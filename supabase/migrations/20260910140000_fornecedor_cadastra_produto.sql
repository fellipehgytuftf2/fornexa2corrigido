-- O fornecedor cadastra produto novo pelo Portal.
--
-- POR QUE
--
-- Hoje o catálogo só cresce por importação feita pelo admin. Toda vez que o
-- fornecedor recebe um produto novo, ele manda a lista por WhatsApp e espera —
-- e enquanto espera, nenhum vendedor pode anunciar aquilo. O gargalo é uma
-- pessoa, e não o trabalho.
--
-- Quem tem a informação é ele: nome, preço de custo, quantidade. A equipe dele
-- já mexe no estoque pelo Portal; cadastrar é o mesmo movimento.
--
-- O QUE ELE NÃO DECIDE
--
-- `supplier_id` vem de `current_supplier_id()`, nunca do que ele mandar: senão
-- um fornecedor cadastraria produto no nome de outro. E o preço aqui é o de
-- CUSTO — o de venda é do vendedor, e o FORNEXA calcula na hora de publicar.

create or replace function public.fornecedor_cadastra_produto(
  p_nome text,
  p_preco numeric,
  p_estoque integer default 0,
  p_categoria text default null,
  p_descricao text default null,
  p_imagem text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
  v_id uuid;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem cadastrar produtos';
  end if;

  if coalesce(btrim(p_nome), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'O nome do produto é obrigatório.');
  end if;

  if coalesce(p_preco, 0) <= 0 then
    return jsonb_build_object('ok', false, 'erro', 'Informe o preço de custo do produto.');
  end if;

  -- Teto de sanidade, como na taxa de embalagem: não existe produto de um
  -- milhão neste catálogo, existe vírgula no lugar errado — e o erro só
  -- apareceria quando um vendedor publicasse com o preço errado.
  if p_preco > 100000 then
    return jsonb_build_object('ok', false, 'erro', 'Preço alto demais. Confira a vírgula.');
  end if;

  if coalesce(p_estoque, 0) < 0 then
    return jsonb_build_object('ok', false, 'erro', 'A quantidade não pode ser negativa.');
  end if;

  -- Nome repetido no mesmo fornecedor quase sempre é cadastro em duplicidade,
  -- e duplicata no catálogo vira vendedor anunciando o mesmo produto duas
  -- vezes, com estoques que não conversam.
  if exists (
    select 1 from public.catalog_products p
    where p.supplier_id = v_fornecedor
      and lower(btrim(p.name)) = lower(btrim(p_nome))
  ) then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Você já tem um produto com esse nome. Confira no estoque antes de cadastrar de novo.'
    );
  end if;

  insert into public.catalog_products (
    name, description, category, supplier_price, stock, image_url, supplier_id, status
  )
  values (
    btrim(p_nome),
    nullif(btrim(coalesce(p_descricao, '')), ''),
    nullif(btrim(coalesce(p_categoria, '')), ''),
    round(p_preco, 2),
    coalesce(p_estoque, 0),
    nullif(btrim(coalesce(p_imagem, '')), ''),
    v_fornecedor,
    'active'
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.fornecedor_cadastra_produto(
  text, numeric, integer, text, text, text
) to authenticated;


/**
 * O fornecedor corrige o preço de custo de um produto dele.
 *
 * Preço muda, e hoje mudar exigia pedir ao admin. Só o de CUSTO: o de venda é
 * de cada vendedor, e mexer nele daqui seria mexer no anúncio dos outros.
 *
 * Pedido já feito não muda: `orders.supplier_price` é cópia do preço no dia da
 * venda, e é assim que o repasse continua valendo o que foi combinado.
 */
create or replace function public.fornecedor_ajusta_preco(
  p_produto uuid,
  p_preco numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem mudar isto';
  end if;

  if coalesce(p_preco, 0) <= 0 then
    return jsonb_build_object('ok', false, 'erro', 'Informe um preço maior que zero.');
  end if;

  if p_preco > 100000 then
    return jsonb_build_object('ok', false, 'erro', 'Preço alto demais. Confira a vírgula.');
  end if;

  update public.catalog_products
  set supplier_price = round(p_preco, 2)
  where id = p_produto
    and supplier_id = v_fornecedor;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Produto não encontrado no seu catálogo.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.fornecedor_ajusta_preco(uuid, numeric) to authenticated;
