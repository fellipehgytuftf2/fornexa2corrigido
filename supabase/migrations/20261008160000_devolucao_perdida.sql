-- A devolução que se perdeu tem onde terminar.
--
-- O QUE ACONTECE HOJE
--
-- O motorista tem duas tentativas. Sem o código do dia na portaria, ele vai
-- embora; na segunda, o Mercado Livre encerra e o produto não volta mais. O
-- fornecedor relatou duas assim, do mesmo Furador de Coco:
--
--   "Esses 2 provavelmente ele já perdeu, pois não enviou o cod nas 2 vezes
--    que o entregador chegou."
--
-- E as duas continuam na tela dele como "Esperando chegar" — para sempre,
-- esperando um pacote que não vem. Lista que mente sobre o que falta fazer
-- deixa de ser lista.
--
-- POR QUE NÃO FECHAR SOZINHO NA SEGUNDA TENTATIVA
--
-- "Duas tentativas" é a regra comum, não uma lei: às vezes o motorista volta,
-- às vezes o vendedor resolve com o Mercado Livre. Fechar sozinho apagaria da
-- tela uma devolução que ainda podia chegar. Quem sabe que acabou é quem está
-- na portaria — então o sistema oferece, e ele decide.
--
-- QUEM PRECISA SABER É O VENDEDOR
--
-- O produto era dele e foi pago por ele. Perdido, vira prejuízo — e prejuízo
-- que ele descobre semanas depois, olhando a tela por acaso, é pior do que
-- prejuízo avisado na hora.

alter table public.devolucoes
  drop constraint if exists devolucoes_status_check;

alter table public.devolucoes
  add constraint devolucoes_status_check
  check (
    status in ('avisada', 'recebida', 'avariada', 'nao_chegou', 'revendida', 'perdida')
  );

comment on column public.devolucoes.status is
  'avisada (a caminho), recebida, avariada, nao_chegou (ainda sem notícia), revendida, perdida (as tentativas acabaram e o produto não volta).';


create or replace function public.fornecedor_recebe_devolucao(
  p_devolucao uuid,
  p_situacao text,
  p_observacao text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
  v_catalogo uuid;
  v_quantidade integer;
  v_existe boolean;
  v_vendedor uuid;
  v_produto text;
begin
  if p_situacao not in ('recebida', 'avariada', 'nao_chegou', 'perdida') then
    raise exception 'situação inválida';
  end if;

  select s.id into v_fornecedor
  from public.suppliers s
  where s.auth_user_id = auth.uid();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem confirmar recebimento';
  end if;

  select exists (
    select 1 from public.devolucoes d
    where d.id = p_devolucao and d.supplier_id = v_fornecedor
  ) into v_existe;

  if not v_existe then
    raise exception 'devolução não encontrada ou não é deste fornecedor';
  end if;

  update public.devolucoes
  set
    status = p_situacao,
    -- Perdida não tem data de recebimento: nada foi recebido.
    recebida_em = case
      when p_situacao in ('nao_chegou', 'perdida') then null
      else now()
    end,
    observacao_fornecedor = nullif(btrim(coalesce(p_observacao, '')), ''),
    updated_at = now()
  where id = p_devolucao
    and supplier_id = v_fornecedor
    and status = 'avisada'
  returning catalog_product_id, user_id into v_catalogo, v_vendedor;

  if p_situacao = 'recebida' and v_catalogo is not null then
    select greatest(1, coalesce(o.quantidade, 1)) into v_quantidade
    from public.devolucoes d
    join public.orders o on o.id = d.order_id
    where d.id = p_devolucao;

    update public.catalog_products
    set
      stock = coalesce(stock, 0) + coalesce(v_quantidade, 1),
      indisponivel_no_fornecedor = false
    where id = v_catalogo;
  end if;

  -- O vendedor é avisado da perda na hora.
  --
  -- O produto era dele, foi pago por ele, e não volta. Descobrir isso semanas
  -- depois, por acaso, tira dele a chance de reclamar com o Mercado Livre
  -- enquanto o caso ainda está aberto.
  if p_situacao = 'perdida' and v_vendedor is not null then
    select o.product_name into v_produto
    from public.devolucoes d
    join public.orders o on o.id = d.order_id
    where d.id = p_devolucao;

    insert into public.avisos (
      titulo, corpo, link_rotulo, link_para, alvo_user_id, tipo, quantidade
    )
    values (
      'Uma devolução sua se perdeu',
      format(
        'O fornecedor marcou como perdida a devolução de %s. O motorista usou as duas tentativas e foi embora sem entregar — sem o código de autorização na portaria, ele não pode deixar o pacote.%sSe o caso ainda estiver aberto no Mercado Livre, vale reclamar hoje. E, para as próximas, informe o código do dia assim que ele chegar: um só libera todas as suas devoluções daquele dia.',
        coalesce(v_produto, 'um pedido seu'),
        E'\n\n'
      ),
      'Ver minhas devoluções', '/dashboard/orders',
      v_vendedor, 'devolucao-perdida', 1
    );
  end if;

  return p_situacao;
end;
$$;

grant execute on function public.fornecedor_recebe_devolucao(uuid, text, text) to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Devoluções paradas há mais de 10 dias esperando chegar — as candidatas
--     a perdidas:
-- select d.id, o.product_name, o.customer_name, d.tentativas, d.avisada_em
-- from public.devolucoes d
-- join public.orders o on o.id = d.order_id
-- where d.status = 'avisada'
--   and d.avisada_em < now() - interval '10 days'
-- order by d.avisada_em;

-- (b) Depois de marcar uma como perdida, o vendedor tem o aviso:
-- select titulo, corpo from public.avisos where tipo = 'devolucao-perdida'
-- order by criado_em desc limit 3;
