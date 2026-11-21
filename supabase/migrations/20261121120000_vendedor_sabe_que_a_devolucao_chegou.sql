-- O vendedor é avisado quando a devolução dele chega no CD do fornecedor.
--
-- Pedido da MS Digital, por mensagem: "o recebimento da devolução não reflete
-- no painel do vendedor no pedido dele. Confirmamos o recebimento da devolução
-- OK, ficando disponível p revenda".
--
-- Refletia, mas só para quem fosse procurar: a linha da devolução dentro do
-- pedido trocava de palavra. Nada chamava o vendedor. A perda já avisava — e a
-- chegada, que é a notícia boa e a que libera o produto para vender de novo,
-- não avisava nada.
--
-- O corpo da função é o que já estava no banco; muda só o trecho do aviso, que
-- deixa de ser exclusivo da perda.

CREATE OR REPLACE FUNCTION public.fornecedor_recebe_devolucao(p_devolucao uuid, p_situacao text, p_observacao text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- O vendedor é avisado do desfecho na hora.
  --
  -- Da perda, porque o produto era dele, foi pago por ele e não volta:
  -- descobrir isso semanas depois, por acaso, tira dele a chance de reclamar
  -- com o Mercado Livre enquanto o caso ainda está aberto.
  --
  -- E da chegada, porque é o que libera o produto para vender de novo. Sem
  -- este aviso, o pedido continuava com cara de enviado e o vendedor não
  -- tinha como saber que já podia contar com a peça.
  --
  -- `v_vendedor` só vem preenchido quando o UPDATE acima pegou uma linha, ou
  -- seja, quando a devolução estava mesmo em 'avisada'. Clicar duas vezes não
  -- gera dois avisos.
  if v_vendedor is not null then
    select o.product_name into v_produto
    from public.devolucoes d
    join public.orders o on o.id = d.order_id
    where d.id = p_devolucao;

    if p_situacao = 'perdida' then
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

    elsif p_situacao = 'recebida' then
      insert into public.avisos (
        titulo, corpo, link_rotulo, link_para, alvo_user_id, tipo, quantidade
      )
      values (
        'Sua devolução chegou no fornecedor',
        format(
          'O fornecedor confirmou o recebimento da devolução de %s. O produto está de volta no CD dele e já conta como disponível para revenda — o estoque voltou ao catálogo.%sVocê não paga de novo por esta peça.',
          coalesce(v_produto, 'um pedido seu'),
          E'\n\n'
        ),
        'Ver minhas devoluções', '/dashboard/orders',
        v_vendedor, 'devolucao-recebida', 1
      );

    elsif p_situacao = 'avariada' then
      insert into public.avisos (
        titulo, corpo, link_rotulo, link_para, alvo_user_id, tipo, quantidade
      )
      values (
        'Sua devolução chegou, mas com avaria',
        format(
          'O fornecedor recebeu a devolução de %s com a embalagem danificada.%sConfirme com ele se ainda dá para vender de novo antes de contar com esta peça.',
          coalesce(v_produto, 'um pedido seu'),
          E'\n\n'
        ),
        'Ver minhas devoluções', '/dashboard/orders',
        v_vendedor, 'devolucao-avariada', 1
      );
    end if;
  end if;

  return p_situacao;
end;
$function$;
