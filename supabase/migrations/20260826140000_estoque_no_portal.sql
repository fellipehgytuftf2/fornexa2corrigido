-- Estoque, contado pelo fornecedor no Portal.
--
-- O FORNEXA nunca soube quanto o fornecedor tem. O vendedor publicava, vendia,
-- e só descobria que acabou quando o pedido já estava pago no Mercado Livre —
-- e a punição do marketplace cai sobre ele.
--
-- Quem sabe o estoque é o fornecedor, então é ele quem conta. O vendedor
-- continua sem ver número nenhum: a única coisa que muda para ele é que
-- produto zerado sai do catálogo, do mesmo jeito que fornecedor inativo sai.
--
-- POR QUE É OPCIONAL POR FORNECEDOR
--
-- O importador de catálogo grava `stock = 0` em tudo que sobe. Ligar a regra
-- para todo mundo de uma vez esvaziaria o catálogo inteiro no mesmo instante.
-- Então o controle nasce desligado e cada fornecedor liga quando for contar de
-- verdade. Quem não ligou continua exatamente como estava.

alter table public.suppliers
  add column if not exists controla_estoque boolean not null default false;

comment on column public.suppliers.controla_estoque is
  'Quando verdadeiro, produto com estoque zerado deste fornecedor some do catálogo. Nasce desligado porque o catálogo antigo tem estoque 0 em tudo.';


/**
 * Os produtos do fornecedor que está logado no Portal.
 *
 * Vem por função e não por leitura direta da tabela: o fornecedor não tem, e
 * não deve ter, acesso a `catalog_products` — lá dentro estão os produtos de
 * todos os outros.
 */
create or replace function public.fornecedor_meus_produtos()
returns table (
  id uuid,
  nome text,
  imagem text,
  preco numeric,
  estoque integer,
  ativo boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
begin
  select s.id into v_fornecedor
  from public.suppliers s
  where s.auth_user_id = auth.uid();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem ver os próprios produtos';
  end if;

  return query
  select
    p.id,
    p.name,
    p.image_url,
    p.supplier_price,
    coalesce(p.stock, 0),
    p.status = 'active'
  from public.catalog_products p
  where p.supplier_id = v_fornecedor
  order by p.name;
end;
$$;

grant execute on function public.fornecedor_meus_produtos() to authenticated;


/**
 * O fornecedor corrige a quantidade de um produto dele.
 *
 * Só o estoque muda. Preço, nome e foto continuam sendo do admin — se o
 * fornecedor pudesse mexer no preço aqui, a conta do vendedor mudaria embaixo
 * de anúncios já publicados.
 */
create or replace function public.fornecedor_ajusta_estoque(
  p_produto uuid,
  p_quantidade integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
  v_novo integer;
begin
  select s.id into v_fornecedor
  from public.suppliers s
  where s.auth_user_id = auth.uid();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem ajustar estoque';
  end if;

  -- Negativo não existe em prateleira. Vem de digitação errada, e guardar o
  -- número errado faria a conta da baixa automática nunca mais voltar ao zero.
  v_novo := greatest(0, coalesce(p_quantidade, 0));

  update public.catalog_products
  set stock = v_novo
  where id = p_produto
    and supplier_id = v_fornecedor;

  if not found then
    raise exception 'produto não encontrado ou não é deste fornecedor';
  end if;

  return v_novo;
end;
$$;

grant execute on function public.fornecedor_ajusta_estoque(uuid, integer) to authenticated;


/**
 * Liga e desliga o controle de estoque do próprio fornecedor.
 *
 * Desligado, os números continuam sendo guardados e mostrados no Portal — só
 * não escondem nada do catálogo. Serve para o fornecedor contar tudo primeiro
 * e só depois deixar a regra valer.
 */
create or replace function public.fornecedor_define_controle_estoque(p_ativo boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
begin
  select s.id into v_fornecedor
  from public.suppliers s
  where s.auth_user_id = auth.uid();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem mudar isto';
  end if;

  update public.suppliers
  set controla_estoque = coalesce(p_ativo, false)
  where id = v_fornecedor;

  return coalesce(p_ativo, false);
end;
$$;

grant execute on function public.fornecedor_define_controle_estoque(boolean) to authenticated;


/**
 * Baixa automática quando o pedido é despachado.
 *
 * O gatilho é o 'shipped' e não a chegada da venda: entre uma coisa e outra o
 * pedido pode ser cancelado no marketplace, e aí nada saiu da prateleira.
 *
 * O caminho até o produto do catálogo é indireto de propósito: o pedido aponta
 * para o produto DO VENDEDOR (`user_products`), que por sua vez guarda de qual
 * item do catálogo ele nasceu. Anúncio antigo, publicado antes desse vínculo
 * existir, tem `catalog_product_id` nulo — nesses a baixa simplesmente não
 * acontece, e é melhor assim do que descontar do produto errado.
 *
 * Nunca desce de zero: o fornecedor pode ter zerado na mão no mesmo minuto.
 */
create or replace function public.baixa_estoque_ao_despachar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalogo uuid;
  v_quantidade integer;
begin
  if new.status <> 'shipped' or coalesce(old.status, '') = 'shipped' then
    return new;
  end if;

  select up.catalog_product_id into v_catalogo
  from public.user_products up
  where up.id = coalesce(new.user_product_id, new.product_id);

  if v_catalogo is null then
    return new;
  end if;

  v_quantidade := greatest(1, coalesce(new.quantidade, 1));

  update public.catalog_products
  set stock = greatest(0, coalesce(stock, 0) - v_quantidade)
  where id = v_catalogo;

  return new;
end;
$$;

drop trigger if exists orders_baixa_estoque on public.orders;

create trigger orders_baixa_estoque
  after update on public.orders
  for each row
  execute function public.baixa_estoque_ao_despachar();
