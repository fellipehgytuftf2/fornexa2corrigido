-- "Esse eu não tenho" — um produto de cada vez, sem ligar o controle.
--
-- O controle de estoque serve para quem vai contar tudo. Mas o caso mais comum
-- é bem menor: acabou UM produto e o fornecedor quer tirá-lo do catálogo hoje,
-- sem se comprometer a manter número de todos os outros.
--
-- Ligar o controle só para isso obrigaria a contar o catálogo inteiro, senão
-- tudo que está com zero (que é quase tudo, porque o importador grava zero)
-- sumiria junto.
--
-- Então a marca é própria e independe do controle: marcou, sai do catálogo.

alter table public.catalog_products
  add column if not exists indisponivel_no_fornecedor boolean not null default false;

comment on column public.catalog_products.indisponivel_no_fornecedor is
  'Marcado pelo fornecedor no Portal: produto fora do catálogo por falta de estoque, mesmo com o controle de estoque desligado.';


/**
 * O fornecedor marca que tem ou não tem o produto.
 *
 * A marca e a quantidade são duas formas de dizer a mesma coisa, então andam
 * juntas: marcar "não tenho" zera o número, e digitar um número maior que zero
 * traz o produto de volta. Deixá-las independentes criaria o estado sem
 * sentido de "3 unidades, mas indisponível".
 */
create or replace function public.fornecedor_define_disponibilidade(
  p_produto uuid,
  p_disponivel boolean
)
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

  update public.catalog_products
  set
    indisponivel_no_fornecedor = not coalesce(p_disponivel, true),
    -- Voltando ao catálogo sem quantidade nenhuma, o produto sumiria de novo
    -- na hora para quem tem o controle ligado. Uma unidade é o mínimo honesto
    -- para dizer "tenho"; o fornecedor corrige para o número certo depois.
    stock = case
      when coalesce(p_disponivel, true) then greatest(1, coalesce(stock, 0))
      else 0
    end
  where id = p_produto
    and supplier_id = v_fornecedor;

  if not found then
    raise exception 'produto não encontrado ou não é deste fornecedor';
  end if;

  return coalesce(p_disponivel, true);
end;
$$;

grant execute on function public.fornecedor_define_disponibilidade(uuid, boolean) to authenticated;


/**
 * Ajuste de quantidade, agora movendo a marca junto.
 *
 * Zerou, não tem. Pôs número, tem. É o que a pessoa espera ao digitar, e evita
 * o produto ficar escondido por uma marca que ela não lembra de ter feito.
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
  set
    stock = v_novo,
    indisponivel_no_fornecedor = (v_novo = 0)
  where id = p_produto
    and supplier_id = v_fornecedor;

  if not found then
    raise exception 'produto não encontrado ou não é deste fornecedor';
  end if;

  return v_novo;
end;
$$;

grant execute on function public.fornecedor_ajusta_estoque(uuid, integer) to authenticated;


/** A lista do Portal passa a devolver a marca. */
drop function if exists public.fornecedor_meus_produtos();

create or replace function public.fornecedor_meus_produtos()
returns table (
  id uuid,
  nome text,
  imagem text,
  preco numeric,
  estoque integer,
  ativo boolean,
  indisponivel boolean
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
    p.status = 'active',
    coalesce(p.indisponivel_no_fornecedor, false)
  from public.catalog_products p
  where p.supplier_id = v_fornecedor
  order by p.name;
end;
$$;

grant execute on function public.fornecedor_meus_produtos() to authenticated;


/**
 * A baixa automática também marca, quando chega a zero.
 *
 * Sem isto, a última unidade sairia da prateleira e o produto continuaria no
 * catálogo para quem está com o controle desligado — que é o caso da maioria.
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
  set
    stock = greatest(0, coalesce(stock, 0) - v_quantidade),
    indisponivel_no_fornecedor = (greatest(0, coalesce(stock, 0) - v_quantidade) = 0)
  where id = v_catalogo;

  return new;
end;
$$;
