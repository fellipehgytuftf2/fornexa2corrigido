-- O Portal mostra quando o vendedor JÁ tem cadastro na transportadora.
--
-- POR QUE
--
-- A trava do Flex aparecia só na falta: sem cadastro, pendência no cartão.
-- Tendo cadastro, o cartão voltava a ser um cartão comum — e o fornecedor não
-- tinha como saber se aquele vendedor estava liberado ou se a venda nem era
-- Flex. "Deveria ter algum aviso que já tem cadastro na transportadora, igual
-- quando não tem."
--
-- Ausência de alerta não é confirmação: é ausência de informação.

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

  -- Flex sem cadastro na transportadora entra aqui: a etiqueta sairia para um
  -- vendedor que não tem como despachar.
  (o.ml_shipment_id is not null and liberado.ok and not flex.esperando)
    as etiqueta_disponivel,

  (o.ml_order_status = 'cancelled') as cancelado_no_marketplace,

  o.ml_shipment_substatus,
  o.ml_liberacao_em,
  o.sem_mercado_envios,

  (o.ml_logistic_type = 'self_service') as flex,
  flex.esperando as flex_sem_cadastro,
  flex.confirmado_em as flex_confirmado_em,
  s.transportadora_nome,

  (coalesce(etiqueta.barrada, false) and o.remetente_liberado_em is null)
    as etiqueta_barrada,

  o.reservado_em,
  o.reembolsado_em,

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
          or flex.esperando
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

cross join lateral (
  select (
    o.ml_logistic_type = 'self_service'
    and nullif(btrim(coalesce(s.transportadora_nome, '')), '') is not null
    and not exists (
      select 1 from public.cadastros_na_transportadora c
      where c.user_id = o.user_id and c.supplier_id = o.supplier_id
    )
  ) as esperando,
  (
    select c.confirmado_em from public.cadastros_na_transportadora c
    where c.user_id = o.user_id and c.supplier_id = o.supplier_id
  ) as confirmado_em
) flex

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

-- (a) Pedidos Flex parados por falta de cadastro, por fornecedor:
-- select s.company_name, count(*)
-- from public.orders o join public.suppliers s on s.id = o.supplier_id
-- where o.ml_logistic_type = 'self_service'
--   and nullif(btrim(coalesce(s.transportadora_nome, '')), '') is not null
--   and not exists (select 1 from public.cadastros_na_transportadora c
--                    where c.user_id = o.user_id and c.supplier_id = o.supplier_id)
-- group by 1;

-- (b) Fornecedor sem transportadora cadastrada não trava nada:
-- select count(*) from public.orders o join public.suppliers s on s.id = o.supplier_id
-- where o.ml_logistic_type = 'self_service' and s.transportadora_nome is null;
