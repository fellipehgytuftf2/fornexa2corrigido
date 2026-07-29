-- ============================================================================
-- Pedido cancelado aparece em vez de sumir
--
-- PROBLEMA
-- A view do portal escondia todo pedido com `ml_order_status` diferente de
-- 'paid'. A intenção era não deixar o fornecedor trabalhar em venda sem
-- pagamento aprovado, mas cancelamento caiu no mesmo balaio.
--
-- Efeito na prática: o fornecedor podia estar com o pedido aberto, já
-- separado e embalado, e o comprador cancelar no Mercado Livre. O pedido
-- simplesmente desaparecia da tela dele, sem aviso nenhum.
--
-- Somava-se a isso um segundo problema: a aba Cancelados do portal filtra por
-- `orders.status = 'cancelled'`, e nenhuma tela do sistema grava esse valor.
-- A aba ficava zerada para sempre.
--
-- SOLUÇÃO
-- Cancelado passa pela view e é sinalizado. Continua escondido apenas o que a
-- regra original queria esconder: venda com pagamento pendente.
--
-- Status do Mercado Livre: confirmed, payment_required, payment_in_process,
-- partially_paid, paid, cancelled, invalid.
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
  (o.ml_shipment_id is not null) as etiqueta_disponivel,

  -- O portal usa isto para mostrar o pedido na aba Cancelados e retirar os
  -- botões de ação. Sem expor o status cru do Mercado Livre, que não diz nada
  -- para quem separa pacote.
  (o.ml_order_status = 'cancelled') as cancelado_no_marketplace

from public.orders o
where o.supplier_id = public.current_supplier_id()
  and (
    o.ml_order_status is null            -- pedido registrado à mão
    or o.ml_order_status = 'paid'        -- venda paga
    or o.ml_order_status = 'cancelled'   -- cancelada: aparece, avisando
  );

comment on view public.pedidos_do_fornecedor is
  'Pedidos do fornecedor logado, sem os dados comerciais do vendedor. Mostra os pagos e os cancelados; esconde os que aguardam pagamento. Única porta de leitura do Portal do Fornecedor.';

revoke all on public.pedidos_do_fornecedor from anon;
grant select on public.pedidos_do_fornecedor to authenticated;

commit;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) A coluna nova existe? sale_price e profit continuam de fora?
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'pedidos_do_fornecedor'
-- order by ordinal_position;

-- (b) O que cada fornecedor enxerga, por situação
-- select s.name as fornecedor,
--        coalesce(o.ml_order_status, '(manual)') as situacao_no_ml,
--        count(*)
-- from public.orders o
-- join public.suppliers s on s.id = o.supplier_id
-- group by s.name, o.ml_order_status
-- order by s.name;
