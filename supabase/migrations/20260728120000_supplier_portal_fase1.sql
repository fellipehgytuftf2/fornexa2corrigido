-- ============================================================================
-- Portal do Fornecedor — Fase 1: login do fornecedor
--
-- O que este script faz:
--   1. Liga cada fornecedor a uma conta real do Supabase Auth
--      (suppliers.auth_user_id)
--   2. Cria a função current_supplier_id(), usada pelas policies de RLS
--      para descobrir qual fornecedor está logado
--   3. Deixa o fornecedor ler o próprio cadastro em `suppliers`
--
-- Idempotente: pode rodar mais de uma vez sem quebrar nada.
--
-- ATENÇÃO — este script NÃO executa `enable row level security` em
-- `suppliers`. Se a RLS já estiver ligada (é o esperado), a policy abaixo
-- passa a valer. Se estiver desligada, ligar aqui quebraria as telas que já
-- funcionam. Confira o estado atual com a consulta de verificação no fim.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Vínculo entre fornecedor e conta de login
-- ----------------------------------------------------------------------------
alter table public.suppliers
  add column if not exists auth_user_id uuid
  references auth.users (id) on delete set null;

comment on column public.suppliers.auth_user_id is
  'Conta do Supabase Auth que representa este fornecedor no Portal do Fornecedor. NULL = fornecedor ainda sem acesso.';

-- Uma conta de login pertence a no máximo um fornecedor.
-- Índice parcial: vários fornecedores podem ter auth_user_id NULL.
create unique index if not exists suppliers_auth_user_id_key
  on public.suppliers (auth_user_id)
  where auth_user_id is not null;

-- ----------------------------------------------------------------------------
-- 2. Qual fornecedor está logado?
--
-- SECURITY DEFINER de propósito: a função precisa ler `suppliers` ignorando a
-- RLS, senão as policies que a chamam entrariam em recursão infinita.
-- search_path fixo para o dono da função não ser enganado por um schema
-- plantado no caminho de busca.
-- ----------------------------------------------------------------------------
create or replace function public.current_supplier_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id
  from public.suppliers s
  where s.auth_user_id = auth.uid()
  limit 1;
$$;

comment on function public.current_supplier_id() is
  'Id do fornecedor ligado ao usuário logado, ou NULL se a conta não for de fornecedor. Base das policies do Portal do Fornecedor.';

revoke all on function public.current_supplier_id() from public;
grant execute on function public.current_supplier_id() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Fornecedor lê o próprio cadastro
--
-- Sem isto o portal não consegue nem descobrir o nome de quem acabou de logar.
-- Escopo mínimo: só a própria linha, nunca a lista de fornecedores.
-- ----------------------------------------------------------------------------
drop policy if exists "fornecedor_le_proprio_cadastro" on public.suppliers;

create policy "fornecedor_le_proprio_cadastro"
  on public.suppliers
  for select
  to authenticated
  using (auth_user_id = auth.uid());

commit;

-- ============================================================================
-- VERIFICAÇÃO — rode depois e confira os resultados
-- ============================================================================

-- (a) A coluna existe?
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'suppliers'
--   and column_name = 'auth_user_id';

-- (b) A RLS está ligada em suppliers? Precisa vir true.
--     Se vier false, as policies não valem nada e o portal ficaria aberto.
-- select relname, relrowsecurity
-- from pg_class
-- where oid = 'public.suppliers'::regclass;

-- (c) Quais policies existem hoje em suppliers?
-- select policyname, cmd, roles
-- from pg_policies
-- where schemaname = 'public' and tablename = 'suppliers'
-- order by policyname;

-- (d) Quem já tem acesso criado?
-- select id, name, company_name, email, auth_user_id
-- from public.suppliers
-- order by created_at desc;
