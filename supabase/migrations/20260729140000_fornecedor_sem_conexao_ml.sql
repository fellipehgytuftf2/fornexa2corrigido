-- ============================================================================
-- Fornecedor não pode ter conexão com o Mercado Livre
--
-- PROBLEMA ENCONTRADO
-- A conta de login do fornecedor Patrone Atacadista (contato@patrone.com.br)
-- tinha uma linha em `ml_connections` guardando access_token e refresh_token
-- da conta pessoal do vendedor no Mercado Livre (TEODOROFELLIPE941,
-- external_account_id 476651130).
--
-- As policies de `ml_connections` filtram por user_id = auth.uid(), então
-- quem entrasse com esse login lia a linha inteira, tokens inclusive.
--
-- Isso contraria a regra central do Portal do Fornecedor: o fornecedor nunca
-- vê token nem fala com o Mercado Livre. Toda conversa com o ML acontece em
-- Edge Function, usando o token do VENDEDOR.
--
-- Origem provável: a conexão foi criada durante os testes, quando ainda não
-- existia a guarda de rota que hoje impede um fornecedor de abrir /dashboard.
--
-- O QUE ESTE SCRIPT FAZ
--   1. Apaga conexões pertencentes a contas de fornecedor
--   2. Impede, no banco, que outra seja criada
--
-- A guarda de rota já fecha o caminho pela interface. O trigger fecha o
-- caminho pela API, que continua aberto para quem tem o token da sessão.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Limpeza
--
-- Só apaga linhas cujo dono é um fornecedor. As conexões de vendedor e admin
-- não são tocadas.
-- ----------------------------------------------------------------------------
delete from public.ml_connections c
using public.suppliers s
where s.auth_user_id = c.user_id;

-- ----------------------------------------------------------------------------
-- 2. Impedir que aconteça de novo
--
-- Trigger em vez de policy: independe dos nomes das policies existentes e vale
-- também para service_role, que ignora RLS.
-- ----------------------------------------------------------------------------
create or replace function public.bloqueia_conexao_ml_de_fornecedor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.suppliers s where s.auth_user_id = new.user_id
  ) then
    raise exception
      'Conta de fornecedor não pode ter conexão com o Mercado Livre.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function public.bloqueia_conexao_ml_de_fornecedor() is
  'Garante que nenhum token do Mercado Livre fique acessível a uma conta de fornecedor.';

drop trigger if exists trg_bloqueia_conexao_ml_de_fornecedor on public.ml_connections;

create trigger trg_bloqueia_conexao_ml_de_fornecedor
  before insert or update on public.ml_connections
  for each row
  execute function public.bloqueia_conexao_ml_de_fornecedor();

commit;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Precisa voltar VAZIO — nenhuma conexão pertencendo a fornecedor.
--     Sem select *: essa tabela guarda token.
-- select c.account_name, c.status, p.email, s.name as eh_fornecedor
-- from public.ml_connections c
-- left join public.profiles  p on p.id = c.user_id
-- left join public.suppliers s on s.auth_user_id = c.user_id
-- where s.id is not null;

-- (b) Sobrou o quê, e de quem
-- select c.account_name, c.status, c.external_account_id, c.updated_at,
--        p.email, p.role
-- from public.ml_connections c
-- left join public.profiles p on p.id = c.user_id
-- order by c.updated_at desc;

-- (c) Quais policies existem em ml_connections — confirmar que nenhuma
--     expõe a tabela para além do próprio dono
-- select policyname, cmd, roles from pg_policies
-- where schemaname = 'public' and tablename = 'ml_connections'
-- order by policyname;
