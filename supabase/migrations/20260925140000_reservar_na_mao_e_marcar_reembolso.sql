-- Reservados puxando cancelado, reserva na mão, e a marca de reembolso.
--
-- TRÊS COISAS QUE ELE RELATOU USANDO A TELA
--
-- 1. "Os reservados está puxando alguns pedidos cancelados."
--
--    Bug meu, de ontem. A aba Reservados exclui pedido que já saiu olhando
--    `orders.status`, e cancelamento feito no Mercado Livre não mexe nesse
--    campo — ele vive em `ml_order_status`. Todas as outras abas do Portal
--    passam por `cancelado_no_marketplace`; a minha não passava.
--
-- 2. "Seria bom no confirmados ter o botão p jogar p Reservados e Em
--    separação. Pq confere o pagamento, vai p confirmados após verificar a
--    conta. Em confirmados o fornecedor imprime as etiquetas liberadas e
--    separa o produto das reservadas."
--
--    Reservado nasceu calculado: pago e sem etiqueta. Mas quem decide o que
--    vai para a prateleira é ele, olhando a bancada — e às vezes reserva
--    mercadoria de pedido que tem etiqueta, porque vai despachar junto com
--    outro. `reservado_em` é essa decisão, e vale ao lado da automática.
--
-- 3. "Seria bom também um botão para Reembolso. Quando cancelado aparecer a
--    opção p marcar, pq quando cancela mistura tudo aí tem q ficar
--    procurando."
--
--    São 48 pedidos cancelados na tela dele hoje, sem distinguir o que já foi
--    devolvido do que ainda deve dinheiro ao vendedor. A marca separa os dois.

alter table public.orders
  add column if not exists reservado_em timestamptz,
  add column if not exists reembolsado_em timestamptz;

comment on column public.orders.reservado_em is
  'Quando o fornecedor separou a mercadoria e pôs o pedido na prateleira, por decisão dele. A aba Reservados também mostra o que está pago e sem etiqueta, sem precisar desta marca.';

comment on column public.orders.reembolsado_em is
  'Quando o fornecedor devolveu ao vendedor o valor de um pedido cancelado que já estava pago.';


-- ----------------------------------------------------------------------------
-- As duas marcas, escritas pelo fornecedor
-- ----------------------------------------------------------------------------
-- Por função, como todo o resto do Portal: ele não tem permissão em `orders`.

create or replace function public.fornecedor_reserva_pedido(
  p_order_id uuid,
  p_reservado boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem reservar pedidos';
  end if;

  update public.orders
  set reservado_em = case when p_reservado then now() else null end,
      updated_at = now()
  where id = p_order_id
    and supplier_id = v_fornecedor
    and status not in ('shipped', 'delivered', 'cancelled');

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado ou já despachado.');
  end if;

  return jsonb_build_object('ok', true, 'reservado', p_reservado);
end;
$$;

revoke all on function public.fornecedor_reserva_pedido(uuid, boolean) from public, anon;
grant execute on function public.fornecedor_reserva_pedido(uuid, boolean) to authenticated;


create or replace function public.fornecedor_marca_reembolso(
  p_order_id uuid,
  p_reembolsado boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem marcar reembolso';
  end if;

  update public.orders
  set reembolsado_em = case when p_reembolsado then now() else null end,
      updated_at = now()
  where id = p_order_id
    and supplier_id = v_fornecedor;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;

  return jsonb_build_object('ok', true, 'reembolsado', p_reembolsado);
end;
$$;

revoke all on function public.fornecedor_marca_reembolso(uuid, boolean) from public, anon;
grant execute on function public.fornecedor_marca_reembolso(uuid, boolean) to authenticated;


-- ----------------------------------------------------------------------------
-- A view: o conserto do cancelado, mais os dois campos novos
-- ----------------------------------------------------------------------------

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
  o.taxa_embalagem,
  o.status,
  o.tracking_code,
  o.etiqueta_url,
  o.marketplace,
  o.created_at,
  o.updated_at,

  (o.ml_shipment_id is not null and liberado.ok) as etiqueta_disponivel,
  (o.ml_order_status = 'cancelled') as cancelado_no_marketplace,

  o.ml_shipment_substatus,
  o.ml_liberacao_em,
  o.sem_mercado_envios,

  (o.ml_logistic_type = 'self_service') as flex,

  (coalesce(etiqueta.barrada, false) and o.remetente_liberado_em is null)
    as etiqueta_barrada,

  o.reservado_em,
  o.reembolsado_em,

  -- Reservado é o que ele pôs na prateleira, mais o que está pago esperando
  -- etiqueta. Cancelado nunca entra: era o bug de ontem, que misturava venda
  -- desfeita com mercadoria separada.
  (
    o.ml_order_status is distinct from 'cancelled'
    and o.status not in ('shipped', 'delivered', 'cancelled')
    and (
      o.reservado_em is not null
      or (
        o.pago_ao_fornecedor_em is not null
        and (
          o.ml_shipment_id is null
          or (o.ml_liberacao_em is not null and o.ml_liberacao_em > now())
          or (coalesce(etiqueta.barrada, false) and o.remetente_liberado_em is null)
        )
      )
    )
  ) as reservado,

  o.pago_ao_fornecedor_em as pago_em,
  o.recebimento_confirmado_em,

  case when o.pago_ao_fornecedor_em is not null then o.comprovante_path end
    as comprovante_path,

  (not liberado.ok) as aguardando_pagamento,
  coalesce(s.exige_pagamento_antecipado, false) as exige_pagamento_antecipado,

  r.id as repasse_id,
  case when o.pago_ao_fornecedor_em is not null then r.txid end as repasse_txid,
  case when o.pago_ao_fornecedor_em is not null then r.valor end as repasse_valor,
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
  select (l.detalhes->>'bloqueado') = 'true' as barrada
  from public.log_integracao_ml l
  where l.contexto = 'supplier-order-label'
    and l.detalhes->>'pedido_id' = o.id::text
  order by l.id desc
  limit 1
) etiqueta on true

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
  'Pedidos do fornecedor logado, sem os dados comerciais do vendedor. Mostra os pagos e os cancelados; esconde os que aguardam pagamento. Única porta de leitura do Portal do Fornecedor.';

revoke all on public.pedidos_do_fornecedor from anon;
grant select on public.pedidos_do_fornecedor to authenticated;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Nenhum cancelado sobra em Reservados (entrando como fornecedor):
-- select count(*) from public.pedidos_do_fornecedor
-- where reservado and cancelado_no_marketplace;

-- (b) Cancelados que ainda devem reembolso — pagos e não devolvidos:
-- select count(*) from public.orders
-- where ml_order_status = 'cancelled'
--   and pago_ao_fornecedor_em is not null
--   and reembolsado_em is null;
