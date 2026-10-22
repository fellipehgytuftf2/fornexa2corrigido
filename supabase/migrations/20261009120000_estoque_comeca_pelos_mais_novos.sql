-- O estoque do Portal passa a começar pelos produtos mais novos.
--
-- O QUE ELE PEDIU
--
-- "Continua puxando os produtos novos, + sem preço, se vc conseguir ordenar
-- dos + novos p os + antigos fica melhor p gende colocar o preço até
-- conseguir corrigir."
--
-- "Quando cadastramos um produto novo, seu sistema ate puxa, + não puxa o
-- preço, se vc puder colocar os ultimos cadastrado no topo fica + facil p
-- colocar o preço p ativar no fornexa."
--
-- POR QUE É ELE QUEM PRECISA FAZER ISSO
--
-- O preço de custo só existe na loja dele depois do login, e esse login não
-- sobe na Vercel (`libnss3.so`). Toda rodada cai no feed público, que traz
-- nome, foto e estoque — e nenhum preço. Produto novo entra inativo
-- esperando alguém digitar o valor. Enquanto o login não volta, quem digita
-- é ele; a tela é que precisa ajudar.
--
-- A ORDEM
--
-- Alfabética era a ordem de quem procura um produto pelo nome. Quem está
-- precificando o que acabou de chegar precisa do contrário: o recém-chegado
-- primeiro. Com `created_at desc`, os produtos da sincronização de hoje
-- nascem no topo, que é exatamente onde ele quer começar.
--
-- A busca por nome continua existindo e não depende da ordem.

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
  -- O mais novo primeiro. `name` desempata o lote inteiro que entra na mesma
  -- rodada de sincronização, com created_at igual ao segundo.
  order by p.created_at desc nulls last, p.name;
end;
$$;

grant execute on function public.fornecedor_meus_produtos() to authenticated;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Entrando como fornecedor, os dez primeiros devem ser os mais recentes:
-- select nome, preco from public.fornecedor_meus_produtos() limit 10;

-- (b) Quantos ainda esperam preço (o filtro novo da tela conta estes):
-- select count(*) from public.catalog_products
-- where supplier_id = (select id from public.suppliers where name = 'MS Digital')
--   and coalesce(supplier_price, 0) = 0;
