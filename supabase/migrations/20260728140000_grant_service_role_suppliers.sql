-- ============================================================================
-- Portal do Fornecedor — correção de privilégio
--
-- A Edge Function supplier-create-access falhava com
--   "permission denied for table suppliers"
-- ao consultar `suppliers` com a chave service_role.
--
-- Não era RLS: RLS negando devolve zero linhas, não erro de permissão. O papel
-- `service_role` estava sem GRANT nessa tabela — fora do padrão do Supabase,
-- onde ele nasce com privilégio em tudo no schema public. Provavelmente
-- revogado sem querer durante a auditoria de RLS.
--
-- Isto NÃO afrouxa a segurança dos usuários: `service_role` só existe do lado
-- do servidor (a chave nunca chega ao navegador, só o runtime das Edge
-- Functions a recebe). Os papéis do front — `anon` e `authenticated` —
-- continuam intocados e limitados pelas policies de RLS.
-- ============================================================================

grant all privileges on table public.suppliers to service_role;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Quem tem o quê nas tabelas que o portal usa. `service_role` precisa
-- aparecer em todas elas.
--
-- select table_name, grantee,
--        string_agg(privilege_type, ', ' order by privilege_type) as privilegios
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and table_name in ('suppliers', 'profiles', 'orders', 'catalog_products')
--   and grantee in ('service_role', 'authenticated', 'anon')
-- group by table_name, grantee
-- order by table_name, grantee;
