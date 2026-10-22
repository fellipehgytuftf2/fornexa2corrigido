-- O produto do catálogo passa a guardar o id que ele tem no site do fornecedor.
--
-- POR QUE
--
-- A sincronização diária da MS Digital casava "produto do site" com "linha do
-- banco" pelo NOME. Funciona até o fornecedor renomear alguma coisa — e eles
-- mexem no catálogo toda semana. Quando renomeavam:
--
--   * o nome novo não batia com nada, e a rodada CRIAVA um produto duplicado;
--   * o nome antigo não aparecia na coleta do dia, e a rodada marcava o
--     original como indisponivel_no_fornecedor.
--
-- Resultado: o produto aparecia duas vezes no catálogo, e quem já tinha anúncio
-- ligado no original ficava com ele fora do ar, do nada.
--
-- O id do site é estável e não muda com renome. Com ele, renomear vira só um
-- update de nome.
--
-- COMO PREENCHE
--
-- Nasce vazio. A própria sincronização preenche: quando reconhece um produto
-- pelo nome e vê que ele ainda não tem id, grava o id junto com a atualização.
-- Depois da primeira rodada completa, o catálogo inteiro está casado por id.
-- Nada a rodar à mão.
--
-- O índice é único e parcial (só linhas com id preenchido), para duas linhas
-- do mesmo fornecedor nunca reivindicarem o mesmo produto do site.

alter table public.catalog_products
  add column if not exists fornecedor_produto_id text;

comment on column public.catalog_products.fornecedor_produto_id is
  'Id do produto no site do fornecedor (ex: MS Digital). Estável a renomeações — é por ele que a sincronização reconhece o produto. Nulo em produto cadastrado à mão.';

create unique index if not exists catalog_products_fornecedor_produto_id_idx
  on public.catalog_products (supplier_id, fornecedor_produto_id)
  where fornecedor_produto_id is not null;


-- ============================================================================
-- VERIFICAÇÃO — rode depois e confira os resultados
-- ============================================================================

-- (a) A coluna existe?
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'catalog_products'
--   and column_name = 'fornecedor_produto_id';

-- (b) DEPOIS da próxima rodada do cron: quantos já estão casados por id?
--     'sem_id' deve cair para perto de zero (só sobra produto cadastrado à mão
--     e produto que saiu do site).
-- select count(*) filter (where fornecedor_produto_id is not null) as com_id,
--        count(*) filter (where fornecedor_produto_id is null)     as sem_id,
--        count(*)                                                  as total
-- from public.catalog_products
-- where supplier_id = (select id from public.suppliers where name = 'MS Digital');

-- (c) A rodada agora deixa rastro. Últimas sincronizações, com o que cada uma
--     fez — inclusive por qual caminho coletou e quantos produtos mudaram.
-- select criado_em, mensagem, detalhes
-- from public.log_integracao_ml
-- where contexto = 'ms-digital-sync'
-- order by criado_em desc
-- limit 10;
