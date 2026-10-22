-- "Reservado": pago, separado, esperando uma etiqueta que não sai.
--
-- O PEDIDO, NA VOZ DO FORNECEDOR
--
-- "Teria como acrescentar + 1 estágio? Reservado - para pedidos sem etiqueta
-- liberada - separamos o produto p qm pagou e esta com a etiqueta presa."
--
-- É um estado que já existe na prateleira dele e não existia na tela. O
-- pedido pago sem etiqueta ficava em "Novos", junto com o que acabou de
-- chegar: ele separava, descobria que a etiqueta não saía, e o pacote voltava
-- para a fila de novo no dia seguinte.
--
-- Medido em 24/09/2026: 30 pedidos pagos em andamento, 5 sem etiqueta nenhuma
-- e 6 com a etiqueta barrada na trava de remetente.
--
-- O QUE PRENDE UMA ETIQUETA
--
--   1. o envio ainda não existe no Mercado Livre;
--   2. venda agendada — o Mercado Livre solta na data (`ml_liberacao_em`);
--   3. a trava de remetente barrou, e ninguém liberou na mão.
--
-- A terceira não aparecia em lugar nenhum da view: o bloqueio só é descoberto
-- quando o fornecedor clica em Baixar etiqueta, e fica registrado no log.
-- `etiqueta_barrada` traz esse registro para a tela dele.
--
-- A partir de 20260924120000 a terceira deixa de nascer — conta com remetente
-- pendente não paga mais. Os que já estão pagos e presos continuam, e é para
-- eles que esta aba existe.

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

-- A última tentativa de baixar a etiqueta deste pedido. Se o vendedor
-- corrigiu o endereço e o fornecedor baixou depois, é a mais recente que vale.
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

-- O lateral do log procura por pedido; sem índice seria uma varredura por
-- linha da view.
create index if not exists log_etiqueta_por_pedido_idx
  on public.log_integracao_ml ((detalhes->>'pedido_id'))
  where contexto = 'supplier-order-label';

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Os campos novos existem:
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'pedidos_do_fornecedor'
--   and column_name in ('reservado', 'etiqueta_barrada');

-- (b) Quantos pedidos entram na aba Reservados hoje (entrando como fornecedor):
-- select count(*) from public.pedidos_do_fornecedor where reservado;

-- (c) O mesmo, pelo lado do admin, sem depender de quem está logado:
-- select count(*) from public.orders o
-- where o.pago_ao_fornecedor_em is not null
--   and o.status not in ('shipped', 'delivered', 'cancelled')
--   and o.ml_shipment_id is null;
