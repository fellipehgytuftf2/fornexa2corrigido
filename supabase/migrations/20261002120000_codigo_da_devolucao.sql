-- O código que libera a devolução na portaria.
--
-- POR QUE
--
-- Quando uma devolução chega, o Mercado Livre manda ao VENDEDOR um código de
-- autorização. Quem recebe o motorista é a equipe do fornecedor — e sem o
-- código na mão dela o motorista vai embora.
--
-- São duas tentativas. Na segunda, o produto se perde: volta ao comprador ou é
-- descartado, e o vendedor fica sem mercadoria e sem venda, tendo pago o
-- fornecedor.
--
-- Aconteceu em 30/09/2026 com um vendedor: o código chegou às 07:47, ele
-- estava estudando, respondeu uma hora depois da segunda tentativa. Produto
-- perdido. O código passou a manhã inteira parado num celular, enquanto quem
-- precisava dele estava na portaria.
--
-- O QUE O FORNEXA NÃO CONSEGUE FAZER
--
-- Ler esse aviso. Ele vai para o WhatsApp e para o painel do vendedor, e não
-- há API que entregue isso a terceiros. O código vai depender sempre de alguém
-- colar — o que dá para fazer é pedir cedo, insistir, e deixar o que foi colado
-- na tela de quem recebe.


alter table public.devolucoes
  add column if not exists codigo_autorizacao text,
  add column if not exists codigo_em timestamptz,
  add column if not exists tentativas integer not null default 0,
  add column if not exists ultima_tentativa_em timestamptz;

comment on column public.devolucoes.codigo_autorizacao is
  'O código que o Mercado Livre manda ao vendedor no dia da devolução. Sem ele na portaria, o motorista não entrega.';

comment on column public.devolucoes.tentativas is
  'Quantas vezes o motorista tentou entregar. Na segunda sem sucesso, o produto se perde.';


-- ----------------------------------------------------------------------------
-- O vendedor cola o código
-- ----------------------------------------------------------------------------

create or replace function public.vendedor_define_codigo_devolucao(
  p_devolucao uuid,
  p_codigo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limpo text;
begin
  if auth.uid() is null then
    raise exception 'faça login novamente';
  end if;

  -- Espaço e minúscula vêm de copiar do WhatsApp; o código do Mercado Livre é
  -- maiúsculo e sem espaço. Guardar como veio faria a equipe digitar algo que
  -- não confere.
  v_limpo := upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'));

  if v_limpo = '' then
    return jsonb_build_object('ok', false, 'erro', 'Informe o código.');
  end if;

  update public.devolucoes
  set codigo_autorizacao = v_limpo, codigo_em = now(), updated_at = now()
  where id = p_devolucao and user_id = auth.uid();

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Devolução não encontrada.');
  end if;

  return jsonb_build_object('ok', true, 'codigo', v_limpo);
end;
$$;

grant execute on function public.vendedor_define_codigo_devolucao(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- A equipe registra a tentativa
-- ----------------------------------------------------------------------------
-- Sem registro, ninguém sabe se está na primeira ou na última chance — e a
-- diferença entre as duas é o produto inteiro.

create or replace function public.fornecedor_registra_tentativa(p_devolucao uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
  v_tentativas integer;
  v_user uuid;
  v_produto text;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores';
  end if;

  update public.devolucoes d
  set tentativas = d.tentativas + 1, ultima_tentativa_em = now(), updated_at = now()
  where d.id = p_devolucao and d.supplier_id = v_fornecedor
  returning d.tentativas, d.user_id into v_tentativas, v_user;

  if v_tentativas is null then
    return jsonb_build_object('ok', false, 'erro', 'Devolução não encontrada.');
  end if;

  select o.product_name into v_produto
  from public.devolucoes d
  join public.orders o on o.id = d.order_id
  where d.id = p_devolucao;

  -- O vendedor precisa saber AGORA, não no fim do dia: com duas tentativas
  -- queimadas ele perde a mercadoria.
  insert into public.avisos (
    titulo, corpo, link_rotulo, link_para, alvo_user_id, tipo, quantidade
  )
  values (
    case when v_tentativas >= 2
      then 'Última tentativa de devolução usada'
      else 'O motorista tentou entregar sua devolução'
    end,
    'O motorista foi até o fornecedor com a devolução de ' ||
      coalesce(v_produto, 'um produto seu') || ' e não conseguiu entregar (' ||
      v_tentativas || 'ª tentativa). ' ||
      case when v_tentativas >= 2
        then 'São duas tentativas: esta era a última, e o produto pode ter sido perdido.'
        else 'Resta uma tentativa. Cole o código de autorização no pedido agora — sem ele o motorista não entrega.'
      end,
    'Ver meus pedidos', '/dashboard/orders',
    v_user, 'devolucao-tentativa', v_tentativas
  );

  return jsonb_build_object('ok', true, 'tentativas', v_tentativas);
end;
$$;

revoke all on function public.fornecedor_registra_tentativa(uuid) from public, anon;
grant execute on function public.fornecedor_registra_tentativa(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- O pedido do código, assim que a devolução nasce
-- ----------------------------------------------------------------------------

create or replace function public.pedir_codigo_da_devolucao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto text;
begin
  select o.product_name into v_produto
  from public.orders o where o.id = new.order_id;

  insert into public.avisos (
    titulo, corpo, link_rotulo, link_para, alvo_user_id, tipo, quantidade
  )
  values (
    'Devolução a caminho: cole o código de autorização',
    'A devolução de ' || coalesce(v_produto, 'um produto seu') ||
      ' está voltando para o fornecedor.' || E'\n\n' ||
      'O Mercado Livre te manda um código de autorização no dia da entrega, ' ||
      'por WhatsApp e no painel de vendas. Quem recebe o motorista é a equipe ' ||
      'do fornecedor, e sem esse código ele não entrega.' || E'\n\n' ||
      'Abra o pedido e cole o código assim que receber. São duas tentativas — ' ||
      'na segunda sem sucesso, o produto se perde.',
    'Ver meus pedidos', '/dashboard/orders',
    new.user_id, 'devolucao-codigo', 1
  );

  return new;
end;
$$;

drop trigger if exists pedir_codigo_da_devolucao on public.devolucoes;

create trigger pedir_codigo_da_devolucao
  after insert on public.devolucoes
  for each row
  execute function public.pedir_codigo_da_devolucao();


-- ----------------------------------------------------------------------------
-- O Portal passa a ver o código e quem avisar
-- ----------------------------------------------------------------------------
-- Ganhou colunas, então a função tem que cair antes de ser recriada.

drop function if exists public.fornecedor_minhas_devolucoes();

create or replace function public.fornecedor_minhas_devolucoes()
returns table (
  id uuid,
  produto text,
  imagem text,
  rastreio text,
  motivo text,
  codigo_devolucao text,
  status text,
  avisada_em timestamptz,
  prazo_cd date,
  codigo_autorizacao text,
  tentativas integer,
  ultima_tentativa_em timestamptz,
  ml_order_id text,
  vendedor text,
  vendedor_whatsapp text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
begin
  select s.id into v_fornecedor
  from public.suppliers s
  where s.auth_user_id = auth.uid();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem ver isto';
  end if;

  return query
  select
    d.id,
    o.product_name,
    o.product_image_url,
    o.tracking_code,
    d.motivo,
    d.codigo_devolucao,
    d.status,
    d.avisada_em,
    d.prazo_cd,
    d.codigo_autorizacao,
    d.tentativas,
    d.ultima_tentativa_em,

    -- O número da venda é o que está impresso na etiqueta de ida, e é por ele
    -- que a equipe identifica o pacote quando o Mercado Livre devolve.
    o.ml_order_id::text,

    -- Quem avisar quando faltar o código. Sem isto, a equipe descobre o dono
    -- do pacote e não tem como falar com ele.
    coalesce(nullif(pr.empresa, ''), pr.name)::text,
    pr.whatsapp::text
  from public.devolucoes d
  join public.orders o on o.id = d.order_id
  left join public.profiles pr on pr.id = d.user_id
  where d.supplier_id = v_fornecedor
  order by d.avisada_em desc;
end;
$$;

grant execute on function public.fornecedor_minhas_devolucoes() to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Devoluções esperando o código do vendedor:
-- select count(*) from public.devolucoes
-- where status = 'avisada' and codigo_autorizacao is null;

-- Devoluções que já queimaram uma tentativa:
-- select count(*) from public.devolucoes where tentativas > 0;
