-- O pedido diz quando é Flex.
--
-- O QUE ELE RELATOU
--
-- "A galera esta ativando o FLEX sem transportador".
--
-- Flex é entrega no mesmo dia, e quem despacha precisa de cadastro prévio na
-- transportadora do fornecedor (a J3, no caso da MS Digital) — não é coisa que
-- se resolva na hora. O vendedor liga o Flex na conta dele do Mercado Livre
-- sem saber disso, a venda chega, e o pacote empaca na bancada.
--
-- O horário de corte do Flex já existia no cadastro do fornecedor desde
-- 20260905120000. O que faltava era saber QUAL pedido é Flex: o Mercado Livre
-- diz isso em `logistic_type` do envio, o webhook já lia o envio inteiro, e o
-- campo era descartado.
--
-- `self_service` é o nome do Flex na API. Os outros tipos (`drop_off`,
-- `cross_docking`, `xd_drop_off`, `fulfillment`) seguem o fluxo normal.
--
-- ISTO NÃO TRAVA NADA
--
-- Só mostra. Travar exigiria saber se aquele vendedor tem cadastro na
-- transportadora, e essa informação não está em lugar nenhum do sistema — quem
-- sabe é o fornecedor. Primeiro os dois lados enxergam; depois se decide se
-- vira regra.

alter table public.orders
  add column if not exists ml_logistic_type text;

comment on column public.orders.ml_logistic_type is
  'O tipo de logística do envio, como o Mercado Livre informa. `self_service` é o Flex, que exige cadastro na transportadora do fornecedor.';

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

  -- Flex: entrega no mesmo dia, com cadastro prévio na transportadora.
  (o.ml_logistic_type = 'self_service') as flex,

  -- A trava de remetente barrou a última tentativa, e ninguém liberou.
  (coalesce(etiqueta.barrada, false) and o.remetente_liberado_em is null)
    as etiqueta_barrada,

  -- Pago, ainda não despachado, e a etiqueta presa por qualquer um dos três
  -- motivos. É a prateleira do fornecedor virando aba.
  (
    o.pago_ao_fornecedor_em is not null
    and o.status not in ('shipped', 'delivered', 'cancelled')
    and (
      o.ml_shipment_id is null
      or (o.ml_liberacao_em is not null and o.ml_liberacao_em > now())
      or (coalesce(etiqueta.barrada, false) and o.remetente_liberado_em is null)
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

-- (a) A coluna e o campo da view existem:
-- select column_name from information_schema.columns
-- where table_schema = 'public'
--   and ((table_name = 'orders' and column_name = 'ml_logistic_type')
--     or (table_name = 'pedidos_do_fornecedor' and column_name = 'flex'));

-- (b) Depois de algumas vendas novas, quantas chegaram como Flex:
-- select ml_logistic_type, count(*) from public.orders
-- where ml_logistic_type is not null group by 1 order by 2 desc;

-- Pedido antigo fica nulo: o campo só passa a ser preenchido a partir do
-- próximo aviso do Mercado Livre sobre aquele envio.
