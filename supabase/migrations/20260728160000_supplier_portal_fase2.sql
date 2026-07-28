-- ============================================================================
-- Portal do Fornecedor — Fase 2: fornecedor mexe nos próprios pedidos
--
-- O que este script faz:
--   1. Devolve os privilégios de service_role em `orders` (estavam revogados,
--      o que quebra qualquer Edge Function que grave pedidos)
--   2. Deixa o fornecedor dar UPDATE apenas nos próprios pedidos
--   3. Trava, via trigger, O QUE o fornecedor pode mudar: só o status, e só
--      seguindo as transições permitidas
--
-- Por que trigger e não grant por coluna: restringir coluna via GRANT exigiria
-- revogar UPDATE de `authenticated`, e esse mesmo papel é usado pelo vendedor,
-- que precisa atualizar outros campos. O trigger separa os dois casos sem
-- tocar no que já funciona.
--
-- Idempotente.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Privilégios de service_role em orders
--
-- Diagnóstico: service_role tinha só REFERENCES, TRIGGER e TRUNCATE. Sem
-- SELECT/INSERT/UPDATE/DELETE nenhuma Edge Function consegue gravar pedido —
-- inclusive o ml-webhook-receiver, que não tem JWT de usuário e portanto
-- depende de service_role.
--
-- Não afrouxa nada para o usuário final: service_role só existe no servidor.
-- ----------------------------------------------------------------------------
grant all privileges on table public.orders to service_role;

-- ----------------------------------------------------------------------------
-- 2. Fornecedor atualiza os próprios pedidos
--
-- USING decide quais linhas ele pode tentar atualizar; WITH CHECK impede que
-- ele "mova" o pedido para outro fornecedor no meio do update.
-- ----------------------------------------------------------------------------
drop policy if exists "fornecedor_atualiza_proprios_pedidos" on public.orders;

create policy "fornecedor_atualiza_proprios_pedidos"
  on public.orders
  for update
  to authenticated
  using (supplier_id = public.current_supplier_id())
  with check (supplier_id = public.current_supplier_id());

-- ----------------------------------------------------------------------------
-- 3. O que o fornecedor pode mudar
--
-- A policy acima libera a LINHA. Este trigger limita as COLUNAS e as
-- transições de status.
--
-- Vale só quando quem atualiza é o fornecedor dono do pedido. Vendedor, admin
-- e Edge Functions (onde auth.uid() é nulo) passam direto e continuam
-- limitados pelas policies que já existiam.
-- ----------------------------------------------------------------------------
create or replace function public.fornecedor_valida_update_pedido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_supplier_id uuid;
begin
  select s.id into v_supplier_id
  from public.suppliers s
  where s.auth_user_id = auth.uid();

  -- Não é fornecedor, ou o pedido não é dele: nada a fazer aqui.
  if v_supplier_id is null or old.supplier_id is distinct from v_supplier_id then
    return new;
  end if;

  -- Daqui pra baixo: fornecedor mexendo no próprio pedido.

  -- Só status e updated_at podem mudar. Compara o resto campo a campo.
  if (to_jsonb(new) - 'status' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Fornecedor pode alterar apenas o status do pedido.'
      using errcode = 'check_violation';
  end if;

  -- Transições permitidas para o fornecedor.
  if not (
    old.status = new.status
    or (old.status = 'sent_to_supplier' and new.status in ('separating', 'shipped'))
    or (old.status = 'separating' and new.status = 'shipped')
  ) then
    raise exception 'Transição de status não permitida para fornecedor: % para %',
      old.status, new.status
      using errcode = 'check_violation';
  end if;

  new.updated_at := now();

  return new;
end;
$$;

comment on function public.fornecedor_valida_update_pedido() is
  'Impede o fornecedor de alterar qualquer coisa além do status do próprio pedido, e só nas transições previstas.';

drop trigger if exists trg_fornecedor_valida_update_pedido on public.orders;

create trigger trg_fornecedor_valida_update_pedido
  before update on public.orders
  for each row
  execute function public.fornecedor_valida_update_pedido();

commit;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) service_role recuperou os privilégios?
-- select grantee, string_agg(privilege_type, ', ' order by privilege_type)
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'orders'
--   and grantee = 'service_role'
-- group by grantee;

-- (b) A policy de UPDATE do fornecedor existe?
-- select policyname, cmd from pg_policies
-- where schemaname = 'public' and tablename = 'orders'
-- order by policyname;

-- (c) Outras tabelas com o mesmo problema de grant.
--     Toda linha que NÃO mostrar DELETE, INSERT, SELECT, UPDATE está quebrada
--     para Edge Functions.
-- select table_name,
--        string_agg(privilege_type, ', ' order by privilege_type) as service_role_tem
-- from information_schema.role_table_grants
-- where table_schema = 'public' and grantee = 'service_role'
-- group by table_name
-- order by table_name;
