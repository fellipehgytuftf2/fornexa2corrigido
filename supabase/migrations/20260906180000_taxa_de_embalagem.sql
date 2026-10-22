-- A taxa de embalagem do fornecedor.
--
-- POR QUE
--
-- A MS Digital cobra R$ 2,00 por pedido pela embalagem. Não é o preço do
-- produto e não é frete: é um valor por pacote, que o vendedor deve ao
-- fornecedor em todo repasse.
--
-- Sem isto o vendedor pagava a menos em toda venda — e o Financeiro dizia que
-- ele lucrou R$ 2,00 a mais do que lucrou. Dois erros que só apareceriam
-- quando o fornecedor fosse conferir a conta.
--
-- POR FORNECEDOR, NÃO NO CÓDIGO
--
-- Vão entrar outros fornecedores, e cada um cobra o que quiser — inclusive
-- nada. Por isso o valor é do cadastro do fornecedor, e quem define é ele
-- mesmo, no Portal, ao lado da chave PIX e do endereço.
--
-- POR PEDIDO, NÃO POR UNIDADE
--
-- É embalagem: três peças no mesmo pacote levam uma embalagem só. Por isso a
-- taxa não é multiplicada pela quantidade, ao contrário do preço do produto.
--
-- CONGELADA NA VENDA
--
-- O pedido guarda a taxa que valia no dia. Se o fornecedor subir para R$ 3,00
-- amanhã, os pedidos de hoje continuam devendo R$ 2,00 — senão uma mudança de
-- preço reescreveria dívidas já combinadas.

alter table public.suppliers
  add column if not exists taxa_embalagem numeric(10, 2) not null default 0;

comment on column public.suppliers.taxa_embalagem is
  'Quanto este fornecedor cobra por pedido pela embalagem. Entra no repasse e no cálculo de lucro do vendedor. Zero quando não cobra.';

alter table public.orders
  add column if not exists taxa_embalagem numeric(10, 2) not null default 0;

comment on column public.orders.taxa_embalagem is
  'A taxa de embalagem que valia quando esta venda aconteceu. Congelada de propósito: mudança de preço do fornecedor não reescreve dívida antiga.';


-- ----------------------------------------------------------------------------
-- O lucro passa a descontar a embalagem
-- ----------------------------------------------------------------------------
-- Coluna calculada, então é preciso recriá-la. Nenhuma view seleciona
-- `lucro_liquido` — a do fornecedor a omite de propósito —, então o drop passa.
--
-- Fora do parêntese da quantidade: a embalagem é uma por pacote.

alter table public.orders
  drop column if exists lucro_liquido;

alter table public.orders
  add column lucro_liquido numeric(10, 2)
  generated always as (
    (coalesce(sale_price, 0) - coalesce(supplier_price, 0))
      * coalesce(quantidade, 1)
    - coalesce(taxa_marketplace, 0)
    - coalesce(custo_frete, 0)
    - coalesce(taxa_embalagem, 0)
  ) stored;

comment on column public.orders.lucro_liquido is
  'O que sobra de verdade: (venda - fornecedor) x quantidade, menos comissão, frete e embalagem.';


-- ----------------------------------------------------------------------------
-- O fornecedor define a própria taxa
-- ----------------------------------------------------------------------------

create or replace function public.fornecedor_define_taxa_embalagem(p_valor numeric)
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

  if coalesce(p_valor, 0) < 0 then
    return jsonb_build_object('ok', false, 'erro', 'A taxa não pode ser negativa.');
  end if;

  -- Teto de sanidade. Não existe embalagem de R$ 500, existe dedo escorregando
  -- na vírgula — e o erro só apareceria no repasse de um pedido real.
  if coalesce(p_valor, 0) > 200 then
    return jsonb_build_object('ok', false, 'erro', 'Valor alto demais para embalagem. Confira a vírgula.');
  end if;

  update public.suppliers
  set taxa_embalagem = round(coalesce(p_valor, 0), 2)
  where id = v_fornecedor;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.fornecedor_define_taxa_embalagem(numeric) to authenticated;


-- ----------------------------------------------------------------------------
-- O repasse passa a cobrar a embalagem junto
-- ----------------------------------------------------------------------------
-- Mesma função de antes, com a taxa somada ao valor. É o ponto que importa:
-- sem isto o vendedor gera um PIX menor do que deve, e o fornecedor recebe a
-- menos sem ninguém perceber.

create or replace function public.abrir_repasse_do_pedido(p_order_id uuid)
-- A coluna se chama `id`, e não `repasse_id`: é a assinatura que já está em
-- produção. Trocar o nome faria o Postgres recusar o `create or replace` — não
-- dá para mudar o tipo de retorno de uma função existente.
returns table (id uuid, txid text, valor numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.orders%rowtype;
  v_repasse public.repasses%rowtype;
  v_valor numeric;
begin
  select * into v_pedido
  from public.orders o
  where o.id = p_order_id
    and o.user_id = auth.uid();

  if v_pedido.id is null then
    raise exception 'pedido não encontrado';
  end if;

  if v_pedido.supplier_id is null then
    raise exception 'pedido sem fornecedor vinculado';
  end if;

  -- O produto vezes a quantidade, mais uma embalagem. Ver o comentário no topo
  -- deste arquivo: três peças no mesmo pacote levam uma embalagem só.
  v_valor := coalesce(v_pedido.supplier_price, 0) * coalesce(v_pedido.quantidade, 1)
    + coalesce(v_pedido.taxa_embalagem, 0);

  if v_pedido.repasse_id is not null then
    select * into v_repasse
    from public.repasses r
    where r.id = v_pedido.repasse_id and r.status = 'aberto';
  end if;

  if v_repasse.id is null then
    insert into public.repasses (user_id, supplier_id, valor, txid)
    values (
      v_pedido.user_id,
      v_pedido.supplier_id,
      v_valor,
      'FNX' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 22))
    )
    returning * into v_repasse;

    update public.orders
    set repasse_id = v_repasse.id
    where orders.id = v_pedido.id;
  else
    -- O preço do pedido pode ter sido corrigido depois que o lote nasceu.
    update public.repasses
    set valor = v_valor
    where repasses.id = v_repasse.id
    returning * into v_repasse;
  end if;

  return query
  select v_repasse.id, v_repasse.txid, v_repasse.valor;
end;
$$;

grant execute on function public.abrir_repasse_do_pedido(uuid) to authenticated;
