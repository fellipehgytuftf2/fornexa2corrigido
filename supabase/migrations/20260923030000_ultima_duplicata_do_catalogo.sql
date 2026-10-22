-- A última duplicata do catálogo da MS Digital.
--
-- ATENÇÃO: esta migração mexe em anúncio de vendedor. Leia antes de rodar.
--
-- O CASO
--
-- Duas linhas com o MESMO nome, mesmo preço (R$ 19,54) e mesmo estoque (39):
--
--   'Escova Vapor Tira Pelo Pet Recarregável Usb Cão Gato'
--
--   acf5a53c-…  sem fornecedor_produto_id   6 anúncios de vendedores
--   277a8a3a-…  id do site 3814601          8 anúncios de vendedores
--
-- As duas nasceram em 14/09, no mesmo dia — esta duplicata é ANTERIOR à
-- sincronização de 22/09 e não foi criada pela renomeação que a migração
-- 20260922100000 desfez. Por isso ela sobrou: aquela migração só fundia pares
-- em que a linha nova estava sem preço, e aqui as duas têm preço.
--
-- POR QUE NÃO DÁ PARA SÓ APAGAR
--
-- As duas têm anúncio de vendedor apontando. Apagar a linha sem id derrubaria
-- o vínculo de 6 anúncios — o produto sumiria de "Meus Produtos" dessas
-- pessoas. Então os anúncios são repontados antes.
--
-- Fica a linha COM o id do site, porque é a que a sincronização reconhece
-- daqui para frente. A que sai é idêntica em nome, preço e estoque, então
-- nenhum vendedor vê diferença no anúncio.
--
-- Depois disto o catálogo fica sem nenhum nome repetido.

begin;

-- 1. Os 6 anúncios passam a apontar para a linha que fica
update public.user_products
   set catalog_product_id = '277a8a3a-c10e-48e9-9367-8c5f3f60e0a0'
 where catalog_product_id = 'acf5a53c-5153-4ee1-9410-1783f2a31355';

-- 2. Agora nada mais aponta para a linha duplicada
delete from public.catalog_products
 where id = 'acf5a53c-5153-4ee1-9410-1783f2a31355';

commit;


-- ============================================================================
-- VERIFICAÇÃO — rode depois e confira os resultados
-- ============================================================================

-- (a) Nenhum nome repetido no catálogo da MS Digital. Precisa vir VAZIO.
-- select lower(regexp_replace(name, '\s+', ' ', 'g')) as nome, count(*)
-- from public.catalog_products
-- where supplier_id = (select id from public.suppliers where name = 'MS Digital')
-- group by 1 having count(*) > 1;

-- (b) Os 14 anúncios (6 + 8) agora no mesmo produto.
-- select count(*) as anuncios from public.user_products
-- where catalog_product_id = '277a8a3a-c10e-48e9-9367-8c5f3f60e0a0';

-- (c) Nenhum anúncio ficou órfão.
-- select count(*) as orfaos from public.user_products u
-- where u.catalog_product_id is not null
--   and not exists (select 1 from public.catalog_products p where p.id = u.catalog_product_id);
