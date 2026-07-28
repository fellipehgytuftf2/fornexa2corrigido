-- ============================================================================
-- Portal do Fornecedor — libera o status 'separating'
--
-- A Fase 2 introduziu a etapa "Em separação", que o fornecedor marca no Portal
-- ao começar a separar o pedido. O CHECK constraint de `orders.status` não
-- conhecia esse valor, então o UPDATE falhava com:
--
--   new row for relation "orders" violates check constraint "orders_status_check"
--
-- Este script recria a constraint com a lista completa de status.
--
-- Antes de rodar, confira a definição atual para garantir que nenhum status em
-- uso ficou de fora:
--
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'orders_status_check';
--
-- Se aparecer algum valor que não está na lista abaixo, acrescente antes de
-- aplicar. O ALTER valida as linhas existentes: se sobrar alguma com status
-- fora da lista, ele falha em vez de corromper dado.
-- ============================================================================

begin;

alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (
    status in (
      'pending',           -- venda registrada, ainda não repassada
      'sent_to_supplier',  -- repassada ao fornecedor
      'separating',        -- fornecedor confirmou que está separando
      'shipped',           -- despachado
      'delivered',         -- entregue ao comprador
      'cancelled'          -- cancelado
    )
  );

commit;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Nova definição da constraint
-- select pg_get_constraintdef(oid) from pg_constraint
-- where conname = 'orders_status_check';

-- (b) Status realmente em uso hoje — nenhum pode estar fora da lista acima
-- select status, count(*) from public.orders group by status order by status;
