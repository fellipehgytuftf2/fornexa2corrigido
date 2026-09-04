-- O fornecedor confere o repasse sem sair da tela.
--
-- O fornecedor da vez recebe no PagBank e confirma na mão, olhando o extrato.
-- Ele não tem — e não quer, por ora — webhook configurado. Enquanto for assim,
-- o trabalho dele é: ver um valor cair, descobrir a que se refere, achar os
-- pedidos e confirmar um por um.
--
-- Não dá para tirar a conferência sem integração. Dá para tirar a adivinhação.
--
-- O pedido passa a carregar o identificador e o valor do repasse a que
-- pertence. É o mesmo texto que aparece no extrato do PagBank, então conferir
-- vira comparar dois números iguais — e um clique confirma o lote inteiro, na
-- mesma medida do PIX que caiu.

drop view if exists public.pedidos_do_fornecedor;

create view public.pedidos_do_fornecedor
with (security_invoker = false) as
select
  o.id,
  o.product_name,
  o.product_image_url,
  o.quantidade,
  o.customer_name,

  case when liberado.ok then o.customer_phone end as customer_phone,
  case when liberado.ok then o.customer_address end as customer_address,
  case when liberado.ok then o.comprador_documento end as comprador_documento,

  o.supplier_price,
  o.status,
  o.tracking_code,
  o.etiqueta_url,
  o.marketplace,
  o.created_at,
  o.updated_at,

  (o.ml_shipment_id is not null and liberado.ok) as etiqueta_disponivel,
  (o.ml_order_status = 'cancelled') as cancelado_no_marketplace,

  o.pago_ao_fornecedor_em as pago_em,
  o.recebimento_confirmado_em,

  (not liberado.ok) as aguardando_pagamento,
  coalesce(s.exige_pagamento_antecipado, false) as exige_pagamento_antecipado,

  -- O lote a que este pedido pertence. O identificador é o mesmo que aparece
  -- no extrato do banco; é por ele que a conferência deixa de ser adivinhação.
  r.id as repasse_id,
  r.txid as repasse_txid,
  r.valor as repasse_valor,
  r.status as repasse_status,
  (
    select count(*) from public.orders irmaos where irmaos.repasse_id = r.id
  ) as repasse_pedidos,

  coalesce(vendedor.empresa, vendedor.name) as vendedor_nome,
  vendedor.name as vendedor_responsavel,
  vendedor.whatsapp as vendedor_whatsapp,
  vendedor.email as vendedor_email,

  exists (
    select 1 from public.tickets t
    where t.order_id = o.id
      and t.supplier_id = o.supplier_id
      and t.status in ('open', 'in_progress')
  ) as problema_relatado,

  chamado.id as chamado_id,

  coalesce((
    select count(*)
    from public.ticket_messages m
    where m.ticket_id = chamado.id
      and m.autor = 'vendedor'
      and m.created_at > coalesce(chamado.lido_fornecedor_em, 'epoch'::timestamptz)
  ), 0) as respostas_nao_lidas

from public.orders o

left join public.suppliers s on s.id = o.supplier_id
left join public.profiles vendedor on vendedor.id = o.user_id
left join public.repasses r on r.id = o.repasse_id

cross join lateral (
  select (
    not coalesce(s.exige_pagamento_antecipado, false)
    or o.recebimento_confirmado_em is not null
  ) as ok
) liberado

left join lateral (
  select t.id, t.lido_fornecedor_em
  from public.tickets t
  where t.order_id = o.id
    and t.supplier_id = o.supplier_id
  order by t.created_at desc
  limit 1
) chamado on true

where o.supplier_id = public.current_supplier_id()
  and (
    o.ml_order_status is null
    or o.ml_order_status = 'paid'
    or o.ml_order_status = 'cancelled'
  );

comment on view public.pedidos_do_fornecedor is
  'Pedidos do fornecedor logado, com quem vendeu mas sem os valores do vendedor. Endereço e etiqueta ficam ocultos enquanto o pagamento não for confirmado, quando o fornecedor exige pagamento antecipado.';

revoke all on public.pedidos_do_fornecedor from anon;
grant select on public.pedidos_do_fornecedor to authenticated;


/**
 * O fornecedor confirma o lote inteiro de uma vez.
 *
 * O PIX que caiu foi um só, com o valor do lote. Confirmar pedido por pedido
 * obrigaria a repetir o mesmo julgamento cinco vezes sobre um único
 * pagamento — e a errar em uma delas.
 */
create or replace function public.fornecedor_confirma_repasse(p_repasse uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
  v_txid text;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem confirmar recebimento';
  end if;

  select r.txid into v_txid
  from public.repasses r
  where r.id = p_repasse and r.supplier_id = v_fornecedor;

  if v_txid is null then
    raise exception 'repasse não encontrado ou não é seu';
  end if;

  return public.confirmar_repasse(v_txid, 'fornecedor');
end;
$$;

grant execute on function public.fornecedor_confirma_repasse(uuid) to authenticated;

-- `confirmar_repasse` recebe o identificador direto e é chamada pelo aviso do
-- banco, que roda como service_role. Deixá-la aberta a qualquer conta logada
-- permitiria quitar um repasse alheio a quem descobrisse o identificador —
-- e ele viaja no extrato de outra pessoa.
revoke execute on function public.confirmar_repasse(text, text) from authenticated;
