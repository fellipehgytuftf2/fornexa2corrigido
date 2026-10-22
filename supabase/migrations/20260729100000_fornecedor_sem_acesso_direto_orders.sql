-- ============================================================================
-- Portal do Fornecedor — fecha o vazamento de margem
--
-- PROBLEMA
-- A policy `fornecedores_select_own_orders` liberava SELECT na linha inteira
-- de `orders`. A interface do portal não mostra sale_price nem profit, mas
-- isso é só a interface: com o próprio token, o fornecedor conseguia
--
--   GET /rest/v1/orders?select=sale_price,profit
--
-- e ver por quanto o vendedor revendeu e quanto lucrou.
--
-- SOLUÇÃO
-- O fornecedor perde qualquer acesso direto à tabela `orders`:
--   - lê pela view `pedidos_do_fornecedor`, que expõe só o operacional
--   - muda status pela função `fornecedor_atualiza_status_pedido`
--
-- Restringir por GRANT de coluna não serviria: exigiria revogar UPDATE de
-- `authenticated`, o mesmo papel que o vendedor usa na tela de Pedidos.
--
-- Idempotente.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. View de leitura
--
-- security_invoker = false (padrão): a view roda com os privilégios do dono,
-- ignorando a RLS de `orders`. É justamente o que queremos — quem filtra é o
-- WHERE abaixo, e ele não tem como ser contornado pelo cliente.
--
-- Se current_supplier_id() for NULL (vendedor, admin), a comparação com NULL
-- não casa com nada e a view volta vazia.
--
-- Colunas de fora, de propósito: sale_price, profit, user_id, supplier_id,
-- user_product_id, ml_order_id, supplier_email e demais dados do vendedor.
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
  o.updated_at
from public.orders o
where o.supplier_id = public.current_supplier_id();

comment on view public.pedidos_do_fornecedor is
  'Pedidos do fornecedor logado, sem os dados comerciais do vendedor. Única porta de leitura do Portal do Fornecedor.';

revoke all on public.pedidos_do_fornecedor from anon;
grant select on public.pedidos_do_fornecedor to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Mudança de status
--
-- Valida dono e transição antes de gravar. O UPDATE aqui roda como o dono da
-- função, mas o trigger fornecedor_valida_update_pedido continua disparando —
-- auth.uid() segue sendo o do fornecedor — então a checagem de colunas
-- permanece valendo como segunda barreira.
-- ----------------------------------------------------------------------------
create or replace function public.fornecedor_atualiza_status_pedido(
  p_pedido_id uuid,
  p_novo_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_supplier_id uuid;
  v_status_atual text;
begin
  v_supplier_id := public.current_supplier_id();

  if v_supplier_id is null then
    raise exception 'Apenas fornecedores podem alterar o status por aqui.'
      using errcode = 'insufficient_privilege';
  end if;

  select o.status into v_status_atual
  from public.orders o
  where o.id = p_pedido_id
    and o.supplier_id = v_supplier_id
  for update;

  if v_status_atual is null then
    raise exception 'Pedido não encontrado para este fornecedor.'
      using errcode = 'no_data_found';
  end if;

  if not (
    (v_status_atual = 'sent_to_supplier' and p_novo_status in ('separating', 'shipped'))
    or (v_status_atual = 'separating' and p_novo_status = 'shipped')
  ) then
    raise exception 'Transição de status não permitida: % para %',
      v_status_atual, p_novo_status
      using errcode = 'check_violation';
  end if;

  update public.orders
  set status = p_novo_status,
      updated_at = now()
  where id = p_pedido_id;
end;
$$;

comment on function public.fornecedor_atualiza_status_pedido(uuid, text) is
  'Única forma de o fornecedor mexer em um pedido. Valida dono e transição de status.';

revoke all on function public.fornecedor_atualiza_status_pedido(uuid, text) from public;
grant execute on function public.fornecedor_atualiza_status_pedido(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Corta o acesso direto do fornecedor a `orders`
--
-- A partir daqui, consultar /rest/v1/orders com o token de fornecedor devolve
-- zero linhas, e tentar UPDATE não afeta nenhuma.
--
-- As policies do vendedor e do admin não são tocadas.
-- ----------------------------------------------------------------------------
drop policy if exists "fornecedores_select_own_orders" on public.orders;
drop policy if exists "fornecedor_atualiza_proprios_pedidos" on public.orders;

commit;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Sobraram só as policies de vendedor e admin?
--     As duas de fornecedor não podem mais aparecer.
-- select policyname, cmd from pg_policies
-- where schemaname = 'public' and tablename = 'orders'
-- order by policyname;

-- (b) A view existe e expõe só o operacional?
--     sale_price e profit NÃO podem aparecer nesta lista.
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'pedidos_do_fornecedor'
-- order by ordinal_position;

-- (c) TESTE REAL — o que importa de verdade.
--     No portal, com o fornecedor logado, abra o console do navegador (F12) e
--     rode. A primeira precisa voltar [] e a segunda precisa voltar o pedido:
--
--       const { data } = await window.supabase.from('orders').select('*')
--       const { data } = await window.supabase.from('pedidos_do_fornecedor').select('*')
--
--     Se `window.supabase` não existir, use a aba Network: repita a chamada
--     que o portal faz, trocando o caminho para /rest/v1/orders.
