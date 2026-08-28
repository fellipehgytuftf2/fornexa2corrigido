-- Apagar de uma vez todo o catálogo de um fornecedor.
--
-- O caso real: subiu-se a tabela de VAREJO no lugar da de DROP. O catálogo
-- inteiro está com o preço errado, e corrigir produto por produto num catálogo
-- de centenas é inviável — o certo é apagar tudo e importar de novo.
--
-- POR QUE NÃO É SÓ UM DELETE
--
-- Um produto do catálogo pode já ter virado anúncio de vendedor
-- (`user_products.catalog_product_id`) e pode estar citado numa devolução
-- (`devolucoes.catalog_product_id`). Apagar direto, dependendo da chave
-- estrangeira, ou é barrado pelo banco ou leva junto o anúncio do vendedor.
--
-- Nenhum dos dois serve. O anúncio no Mercado Livre continua existindo de
-- verdade, e o histórico de devolução é o que sustenta o "parados no CD". Por
-- isso a ligação é DESFEITA antes, e só o produto do catálogo é apagado.
--
-- O vendedor perde a origem do anúncio, não o anúncio.

/**
 * O que seria apagado, antes de apagar.
 *
 * Existe para a confirmação na tela poder dizer números em vez de "tem
 * certeza?". Apagar catálogo é o tipo de coisa que se faz uma vez e não se
 * desfaz.
 */
create or replace function public.admin_previa_remocao_catalogo(p_fornecedor uuid)
returns table (
  produtos integer,
  anuncios_ligados integer,
  devolucoes_ligadas integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'apenas administradores podem ver isto';
  end if;

  return query
  select
    (select count(*)::integer
     from public.catalog_products p
     where p.supplier_id = p_fornecedor),

    (select count(*)::integer
     from public.user_products up
     join public.catalog_products p on p.id = up.catalog_product_id
     where p.supplier_id = p_fornecedor),

    (select count(*)::integer
     from public.devolucoes d
     join public.catalog_products p on p.id = d.catalog_product_id
     where p.supplier_id = p_fornecedor);
end;
$$;

grant execute on function public.admin_previa_remocao_catalogo(uuid) to authenticated;


/**
 * Apaga o catálogo inteiro de um fornecedor.
 *
 * Devolve quantos produtos saíram. Os anúncios dos vendedores e as devoluções
 * continuam onde estavam, apenas sem apontar mais para um produto que deixou
 * de existir.
 */
create or replace function public.admin_remover_catalogo_do_fornecedor(p_fornecedor uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_apagados integer;
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'apenas administradores podem remover catálogo';
  end if;

  if p_fornecedor is null then
    raise exception 'informe o fornecedor';
  end if;

  -- Solta o anúncio do vendedor antes. Ele continua no ar no Mercado Livre e
  -- continua listado em Meus Produtos; só perde a referência à linha do
  -- catálogo que vai sumir.
  update public.user_products up
  set catalog_product_id = null
  where up.catalog_product_id in (
    select p.id from public.catalog_products p where p.supplier_id = p_fornecedor
  );

  -- Mesma coisa para as devoluções: o histórico é o que sustenta a lista de
  -- produtos parados no CD, e não pode ser perdido por causa de uma troca de
  -- tabela de preço.
  update public.devolucoes d
  set catalog_product_id = null
  where d.catalog_product_id in (
    select p.id from public.catalog_products p where p.supplier_id = p_fornecedor
  );

  delete from public.catalog_products p
  where p.supplier_id = p_fornecedor;

  get diagnostics v_apagados = row_count;

  return v_apagados;
end;
$$;

grant execute on function public.admin_remover_catalogo_do_fornecedor(uuid) to authenticated;
