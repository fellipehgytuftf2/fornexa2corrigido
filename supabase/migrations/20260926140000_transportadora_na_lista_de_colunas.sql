-- As colunas da transportadora entram na lista que o vendedor pode ler.
--
-- POR QUE
--
-- Desde 20260922040000 a tabela `suppliers` não é lida inteira por
-- `authenticated`: o acesso é coluna a coluna, para o contato do fornecedor não
-- vazar para quem não deve. Coluna nova fica de fora dessa lista por padrão.
--
-- E o Postgres não devolve "esta coluna você não pode": ele nega o SELECT
-- inteiro. Foi o que aconteceu ao abrir as Configurações do Portal depois de
-- criar `transportadora_nome` — a tela, que já lia as outras colunas havia
-- meses, passou a dizer "permission denied for table suppliers".
--
-- Não é segredo comercial: são o nome da transportadora e o contato dela, que
-- o vendedor precisa ver justamente para se cadastrar.

grant select (
  transportadora_nome,
  transportadora_contato
) on public.suppliers to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- As colunas que `authenticated` enxerga hoje:
-- select column_name
-- from information_schema.column_privileges
-- where table_name = 'suppliers' and grantee = 'authenticated' and privilege_type = 'SELECT'
-- order by column_name;
