-- ============================================================================
-- Devolve os privilégios de `authenticated` em `tickets`
--
-- PROBLEMA
-- A tela de Chamados falhava com "permission denied for table tickets". As
-- policies estavam certas o tempo todo — vendedor lê e insere os próprios,
-- admin gerencia todos — mas sem GRANT a RLS nem chega a ser avaliada.
--
-- Na prática a tela nunca funcionou, e só apareceu agora porque o Portal do
-- Fornecedor passou a escrever chamados.
--
-- A auditoria de ontem olhou apenas `service_role` e deixou este ponto cego.
-- Refeita para os dois papéis, o resultado foi:
--
--   authenticated sem privilégio em: tickets, log_integracao_ml, webhook_events
--
-- Só `tickets` é corrigido aqui. Nas outras duas o "nenhum" é desejável: são
-- log de integração e fila de webhook, escritos por Edge Function com
-- service_role e sem motivo para o navegador alcançar.
-- ============================================================================

begin;

grant select, insert, update, delete on table public.tickets to authenticated;

commit;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Panorama dos dois papéis em todas as tabelas.
--     Esperado depois desta migration: só log_integracao_ml e webhook_events
--     seguem com authenticated = (NENHUM), de propósito.
--
-- select
--   t.tablename,
--   coalesce(string_agg(distinct
--     case when g.grantee = 'authenticated' then g.privilege_type end, ', '), '(NENHUM)') as authenticated,
--   coalesce(string_agg(distinct
--     case when g.grantee = 'service_role' then g.privilege_type end, ', '), '(NENHUM)') as service_role
-- from pg_tables t
-- left join information_schema.role_table_grants g
--        on g.table_schema = t.schemaname
--       and g.table_name = t.tablename
--       and g.grantee in ('authenticated','service_role')
--       and g.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
-- where t.schemaname = 'public'
-- group by t.tablename
-- order by t.tablename;
