-- ============================================================================
-- Restaura os privilégios de service_role no schema public
--
-- CONTEXTO
-- Uma auditoria de RLS antiga revogou, sem querer, os privilégios de
-- `service_role` em várias tabelas. O papel nasce com ALL em tudo no schema
-- public por padrão do Supabase; aqui estava capado.
--
-- Sintoma: Edge Function falhando com "permission denied for table X". Não
-- confundir com RLS — RLS negando devolve zero linhas, nunca erro de
-- permissão. `service_role` ignora RLS, então erro de permissão só pode ser
-- GRANT.
--
-- Já corrigidos antes: suppliers e orders.
-- Corrigidos aqui: catalog_products, tickets, profiles, webhook_events.
--
-- IMPACTO CONHECIDO DO QUE ESTAVA QUEBRADO
-- - webhook_events sem INSERT: o ml-webhook-receiver não conseguia registrar
--   nada do que o Mercado Livre mandava. Junto com orders, também sem INSERT,
--   explica a sincronização em tempo real nunca ter gravado pedido
-- - profiles sem UPDATE: supplier-create-access não conseguia marcar
--   role = 'supplier' na conta recém-criada, e caía no aviso previsto
--
-- SEGURANÇA
-- Não afrouxa nada para o usuário final. `service_role` só existe no servidor:
-- a chave nunca chega ao navegador, apenas o runtime das Edge Functions a
-- recebe. Os papéis do front — `anon` e `authenticated` — não são tocados e
-- seguem limitados pelas policies de RLS, que a auditoria confirmou ligadas em
-- todas as tabelas.
-- ============================================================================

begin;

grant all privileges on table public.catalog_products to service_role;
grant all privileges on table public.tickets          to service_role;
grant all privileges on table public.profiles         to service_role;
grant all privileges on table public.webhook_events   to service_role;

-- Rede para o futuro: tabela nova criada pelo mesmo dono já nasce acessível
-- ao service_role, em vez de repetir esse diagnóstico daqui a alguns meses.
alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant all on sequences to service_role;

commit;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Precisa voltar VAZIO. Qualquer linha aqui é Edge Function que ainda
--     vai falhar com "permission denied".
-- select t.tablename,
--        coalesce(string_agg(g.privilege_type, ', ' order by g.privilege_type),
--                 '(NENHUM)') as service_role_tem
-- from pg_tables t
-- left join information_schema.role_table_grants g
--        on g.table_schema = t.schemaname
--       and g.table_name = t.tablename
--       and g.grantee = 'service_role'
--       and g.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
-- where t.schemaname = 'public'
-- group by t.tablename
-- having count(g.privilege_type) < 4
-- order by t.tablename;

-- (b) O perfil do fornecedor ficou marcado corretamente?
--     Se ainda estiver 'user', rode o UPDATE abaixo — agora ele tem permissão.
-- select p.id, p.email, p.role
-- from public.profiles p
-- join public.suppliers s on s.auth_user_id = p.id;

-- update public.profiles p
-- set role = 'supplier'
-- from public.suppliers s
-- where s.auth_user_id = p.id and p.role <> 'supplier';
