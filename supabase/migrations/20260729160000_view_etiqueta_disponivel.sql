-- ============================================================================
-- Portal do Fornecedor — Fase 3: sinaliza quando a etiqueta pode existir
--
-- A etiqueta do Mercado Livre só é buscável quando o pedido tem
-- `ml_shipment_id`. Sem isso o botão do portal seria um clique que nunca dá
-- certo.
--
-- A view expõe apenas um booleano, não o `ml_shipment_id` em si: o fornecedor
-- não precisa do identificador, só de saber se vale clicar. Quem usa o id é a
-- Edge Function, do lado do servidor.
--
-- `etiqueta_url` continua na tabela mas segue sem uso. A etiqueta é entregue
-- em tempo real pela função, sem passar por Storage — guardar o PDF colocaria
-- endereço de cliente num bucket, e guardar a URL do ML não serviria porque
-- ela exige token.
-- ============================================================================

begin;

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
where o.supplier_id = public.current_supplier_id();

comment on view public.pedidos_do_fornecedor is
  'Pedidos do fornecedor logado, sem os dados comerciais do vendedor. Única porta de leitura do Portal do Fornecedor.';

revoke all on public.pedidos_do_fornecedor from anon;
grant select on public.pedidos_do_fornecedor to authenticated;

commit;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) A coluna nova apareceu, e sale_price/profit continuam de fora?
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'pedidos_do_fornecedor'
-- order by ordinal_position;
