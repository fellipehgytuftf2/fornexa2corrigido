-- ============================================================================
-- Várias fotos por produto do catálogo
--
-- `catalog_products` guardava uma imagem só, em `image_url`, e o anúncio subia
-- para o Mercado Livre com essa única foto. Anúncio com uma foto converte
-- menos, e o marketplace aceita várias.
--
-- `image_url` continua sendo a foto principal — a que aparece na grade do
-- catálogo e nos cards. `images` guarda as adicionais, na ordem em que devem
-- aparecer no anúncio.
--
-- Optei por array em vez de tabela separada porque são poucas fotos por
-- produto, sempre lidas junto com ele, e nunca consultadas isoladamente.
-- ============================================================================

begin;

alter table public.catalog_products
  add column if not exists images text[] not null default '{}';

comment on column public.catalog_products.images is
  'Fotos adicionais do produto, em ordem. A principal continua em image_url e não se repete aqui.';

commit;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- select id, name, image_url, images
-- from public.catalog_products
-- order by created_at desc
-- limit 5;
