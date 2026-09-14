-- Anúncio no ar volta a saber de que produto do catálogo ele veio.
--
-- POR QUE
--
-- `user_products.catalog_product_id` só passou a ser gravado quando a
-- publicação começou a mandá-lo. Tudo que foi publicado antes ficou órfão:
-- 5611 anúncios ativos, 3 com vínculo.
--
-- O órfão parece inofensivo até o estoque zerar. Aí o FORNEXA sabe que o
-- fornecedor não tem o produto, esconde do catálogo — e não tem como avisar
-- quem já está vendendo aquilo, porque não sabe quem é. O comprador descobre,
-- e a punição do marketplace cai sobre o vendedor.
--
-- COMO
--
-- O vínculo com o fornecedor sobreviveu, e o nome do anúncio nasce do nome do
-- produto. Isso basta para reconstruir o resto — desde que não haja dúvida.
--
-- Só religa quando existe EXATAMENTE UM produto daquele fornecedor com aquele
-- nome. Nome repetido fica órfão de propósito: chutar entre dois candidatos
-- gravaria vínculo errado, e vínculo errado é pior que vínculo nenhum — ele
-- mente com a mesma confiança de um certo.

update public.user_products up
set catalog_product_id = unico.produto
from (
  select
    up2.id as anuncio,
    min(p.id) as produto
  from public.user_products up2
  join public.catalog_products p
    on p.supplier_id = up2.supplier_id
   and lower(btrim(p.name)) = lower(btrim(up2.name))
  where up2.catalog_product_id is null
  group by up2.id
  having count(p.id) = 1
) as unico
where up.id = unico.anuncio
  and up.catalog_product_id is null;


-- ----------------------------------------------------------------------------
-- E não volta a acontecer
-- ----------------------------------------------------------------------------
-- O mesmo casamento por nome, aplicado a quem entrar sem vínculo. A publicação
-- pelo FORNEXA já manda o `catalog_product_id`; isto cobre o que entra por
-- outro caminho — importação de anúncio existente, correção manual, sincronismo.

create or replace function public.religar_anuncio_ao_catalogo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produto uuid;
  v_quantos integer;
begin
  if new.catalog_product_id is not null or new.supplier_id is null then
    return new;
  end if;

  select count(*), min(p.id) into v_quantos, v_produto
  from public.catalog_products p
  where p.supplier_id = new.supplier_id
    and lower(btrim(p.name)) = lower(btrim(new.name));

  -- Dois candidatos: o anúncio segue órfão, de propósito.
  if v_quantos = 1 then
    new.catalog_product_id := v_produto;
  end if;

  return new;
end;
$$;

comment on function public.religar_anuncio_ao_catalogo is
  'Preenche catalog_product_id pelo nome quando há um único produto do fornecedor com aquele nome. Silencioso quando há dúvida.';

drop trigger if exists religar_anuncio_ao_catalogo on public.user_products;

create trigger religar_anuncio_ao_catalogo
  before insert on public.user_products
  for each row
  execute function public.religar_anuncio_ao_catalogo();


-- ----------------------------------------------------------------------------
-- Achar os anúncios de um produto passa a ser barato
-- ----------------------------------------------------------------------------
-- É a pergunta que o aviso de estoque zerado faz: "quem está vendendo isto?".

create index if not exists user_products_catalog_product_id_idx
  on public.user_products (catalog_product_id)
  where catalog_product_id is not null;
