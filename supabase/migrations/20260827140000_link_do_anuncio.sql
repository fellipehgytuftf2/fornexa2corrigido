-- O endereço do anúncio no Mercado Livre.
--
-- A API devolve o `permalink` na hora da publicação, e o FORNEXA jogava fora:
-- guardava só o `ml_item_id`. Em Meus Produtos o vendedor via o anúncio
-- listado e não tinha como abri-lo — tinha que procurar pelo nome dentro do
-- Mercado Livre, num painel que ele nem sempre sabe usar.

alter table public.user_products
  add column if not exists permalink text;

comment on column public.user_products.permalink is
  'Endereço do anúncio no Mercado Livre, como a API devolve na publicação.';

-- Os anúncios que já existem não têm o endereço guardado, mas têm o id — e o
-- Mercado Livre aceita a forma MLB-<numero> e redireciona para o anúncio certo.
--
-- Não é o endereço bonito, com o nome do produto no meio; é um que funciona.
-- Anúncio novo passa a guardar o de verdade.
update public.user_products
set permalink =
  'https://produto.mercadolivre.com.br/'
  || regexp_replace(ml_item_id, '^([A-Z]{3})', '\1-')
  || '-_JM'
where permalink is null
  and ml_item_id is not null
  and ml_item_id <> '';
