-- ============================================================================
-- Medidas da embalagem, vindas do fornecedor
-- ============================================================================
--
-- Em 05/11 o Mercado Livre passou a recusar a criação do anúncio sem elas:
--
--   [item.attribute.missing.seller_package_dimensions] The attributes
--   [seller_package_height, seller_package_width, seller_package_length,
--    seller_package_weight] are all required
--
-- Elas não estavam em lugar nenhum do banco. Mas já eram coletadas: a
-- sincronização da MS Digital apura "Dimensões" e "Peso" na página do produto
-- há meses, nos dois caminhos (login e feed público), e jogava os dois fora na
-- hora de gravar.
--
-- Por isso as colunas moram aqui, no catálogo, e não numa tela de digitação: o
-- fornecedor já publicou essa medida no site dele, e quem embala é ele. O
-- vendedor não tem como saber, e chutar vira frete errado — que sai do bolso
-- de quem vendeu.

alter table public.catalog_products
  add column if not exists altura_cm numeric,
  add column if not exists largura_cm numeric,
  add column if not exists comprimento_cm numeric,
  add column if not exists peso_g numeric;

comment on column public.catalog_products.altura_cm is
  'Altura da embalagem em centímetros, apurada na sincronização do fornecedor.';
comment on column public.catalog_products.largura_cm is
  'Largura da embalagem em centímetros, apurada na sincronização do fornecedor.';
comment on column public.catalog_products.comprimento_cm is
  'Comprimento da embalagem em centímetros, apurado na sincronização do fornecedor.';
comment on column public.catalog_products.peso_g is
  'Peso da embalagem em gramas, apurado na sincronização do fornecedor.';


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) As colunas existem:
-- select column_name from information_schema.columns
-- where table_name = 'catalog_products'
--   and column_name in ('altura_cm','largura_cm','comprimento_cm','peso_g');

-- (b) Depois da próxima sincronização, quantos produtos já têm medida:
-- select count(*) filter (where peso_g is not null) as com_peso,
--        count(*) filter (where altura_cm is not null) as com_dimensoes,
--        count(*) as total
-- from public.catalog_products;
