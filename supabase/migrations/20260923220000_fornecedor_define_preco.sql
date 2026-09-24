-- O fornecedor corrige o preço de custo pelo Portal.
--
-- POR QUE
--
-- A MS Digital escreveu duas coisas no mesmo dia:
--
--   "Produtos novos estão como aguardando preço"
--   "Os preços não foram atualizados no catálogo de vcs, tivemos produtos
--    que foram reajustados, tanto p+ quanto p-"
--
-- As duas têm a mesma causa. O preço de CUSTO só existe na loja dela depois
-- do login, e o login usa Chromium, que não sobe na Vercel
-- ("libnss3.so: cannot open shared object file"). Desde 14/09 toda rodada cai
-- no feed público, que não traz custo — então produto novo entra sem preço e
-- inativo, e reajuste de produto que já existe nunca chega.
--
-- Consertar o login é outro trabalho, e depende da loja estar no ar para
-- descobrir o POST de autenticação. Mas quem sabe o preço é ela, e ela já
-- mexe no Portal todo dia: cadastrar produto novo com preço já era possível
-- (ver 20260910140000). Faltava corrigir o preço de um produto que já existe.
--
-- O QUE A FUNÇÃO DECIDE SOZINHA
--
-- Produto que estava inativo só por falta de preço volta ao catálogo assim
-- que ganha um. É o mesmo "aguardando preço" da tela dela saindo de cena —
-- sem isso ela digitaria o preço e o produto continuaria fora, sem explicação.
-- Inativo por outro motivo (admin tirou do ar) continua inativo.

create or replace function public.fornecedor_define_preco(
  p_produto_id uuid,
  p_preco numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
  v_status text;
  v_preco_atual numeric;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem mudar o preço';
  end if;

  if coalesce(p_preco, 0) <= 0 then
    return jsonb_build_object('ok', false, 'erro', 'Informe o preço de custo do produto.');
  end if;

  -- Mesmo teto de sanidade do cadastro: não existe produto de cem mil neste
  -- catálogo, existe vírgula no lugar errado.
  if p_preco > 100000 then
    return jsonb_build_object('ok', false, 'erro', 'Preço alto demais. Confira a vírgula.');
  end if;

  select p.status, p.supplier_price
  into v_status, v_preco_atual
  from public.catalog_products p
  where p.id = p_produto_id
    and p.supplier_id = v_fornecedor;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Produto não encontrado.');
  end if;

  update public.catalog_products
  set supplier_price = round(p_preco::numeric, 2),
      status = case
                 when status = 'inactive' and coalesce(supplier_price, 0) = 0
                   then 'active'
                 else status
               end,
      updated_at = now()
  where id = p_produto_id
    and supplier_id = v_fornecedor;

  return jsonb_build_object(
    'ok', true,
    'voltou_ao_catalogo', v_status = 'inactive' and coalesce(v_preco_atual, 0) = 0
  );
end;
$$;

comment on function public.fornecedor_define_preco(uuid, numeric) is
  'O fornecedor corrige o preço de custo de um produto seu. Produto que estava inativo só por não ter preço volta ao catálogo.';

revoke all on function public.fornecedor_define_preco(uuid, numeric) from public, anon;
grant execute on function public.fornecedor_define_preco(uuid, numeric) to authenticated;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Quantos produtos estão esperando preço hoje (23/09: 19):
-- select count(*) from public.catalog_products
-- where status = 'inactive' and coalesce(supplier_price, 0) = 0;

-- (b) Entrando como a MS Digital, o preço de um produto dela:
-- select public.fornecedor_define_preco('<id do produto>', 18.75);
