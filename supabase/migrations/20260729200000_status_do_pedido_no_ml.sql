-- ============================================================================
-- Guarda o status do pedido no Mercado Livre
--
-- PROBLEMA
-- Desde que a aba Novos do portal passou a mostrar `pending`, o fornecedor vê
-- a venda assim que ela chega. Só que `ml-sync-orders` busca /orders/search
-- sem filtro e grava tudo como `pending`, e o status do lado do Mercado Livre
-- não era guardado em lugar nenhum.
--
-- Resultado: `pending` no FORNEXA significava "chegou do ML", não "está
-- pago". O fornecedor podia começar a separar uma venda com pagamento não
-- aprovado, ou já cancelada no marketplace.
--
-- SOLUÇÃO
-- Guardar `status` e `status_detail` do pedido no ML, e fazer a view do portal
-- mostrar apenas venda paga.
--
-- Status possíveis no Mercado Livre: confirmed, payment_required,
-- payment_in_process, partially_paid, paid, cancelled, invalid.
-- ============================================================================

begin;

alter table public.orders
  add column if not exists ml_order_status text,
  add column if not exists ml_order_status_detail text;

comment on column public.orders.ml_order_status is
  'Status do pedido no Mercado Livre (paid, cancelled, payment_in_process...). NULL em pedido registrado manualmente, que não vem do marketplace.';

-- Consulta do portal filtra por este campo, e a tabela tende a crescer.
create index if not exists orders_ml_order_status_idx
  on public.orders (ml_order_status)
  where ml_order_status is not null;

-- ----------------------------------------------------------------------------
-- View do portal: só venda confirmada
--
-- A regra tem duas pernas de propósito:
--   - ml_order_status = 'paid'  -> venda do Mercado Livre já paga
--   - ml_order_status is null   -> pedido registrado à mão pelo vendedor, que
--                                  não passa pelo marketplace e portanto não
--                                  tem status de lá
--
-- Pedido cancelado ou aguardando pagamento simplesmente some do portal, sem o
-- fornecedor precisar entender por quê.
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
  o.customer_phone,
  o.customer_address,
  o.comprador_documento,
  o.supplier_price,
  o.status,
  o.tracking_code,
  o.etiqueta_url,
  o.marketplace,
  o.created_at,
  o.updated_at,
  (o.ml_shipment_id is not null) as etiqueta_disponivel
from public.orders o
where o.supplier_id = public.current_supplier_id()
  and (o.ml_order_status is null or o.ml_order_status = 'paid');

comment on view public.pedidos_do_fornecedor is
  'Pedidos pagos do fornecedor logado, sem os dados comerciais do vendedor. Única porta de leitura do Portal do Fornecedor.';

revoke all on public.pedidos_do_fornecedor from anon;
grant select on public.pedidos_do_fornecedor to authenticated;

commit;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) As colunas existem?
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'orders'
--   and column_name like 'ml_order_status%';

-- (b) Depois de sincronizar, como estão os pedidos do Mercado Livre.
--     Só os `paid` aparecem no portal.
-- select ml_order_status, count(*)
-- from public.orders
-- where ml_order_id is not null
-- group by ml_order_status
-- order by 2 desc;

-- (c) Pedidos que somem do portal por não estarem pagos
-- select product_name, status, ml_order_status, ml_order_status_detail
-- from public.orders
-- where ml_order_status is not null and ml_order_status <> 'paid'
-- order by created_at desc;
