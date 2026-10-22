-- Lucro de verdade, e controle do que já foi pago ao fornecedor.
--
-- DOIS PROBLEMAS, UM DELES CARO.
--
-- 1. O lucro mostrado no Financeiro era `preço de venda - preço do fornecedor`.
--    Isso ignora o que o Mercado Livre cobra, que não é pouco: comissão da
--    categoria mais a parte do frete que o vendedor banca quando o anúncio
--    entra no frete grátis.
--
--    Com custo de R$ 100 e margem de 40%, o anúncio sai por R$ 140 e a tela
--    diz "lucro R$ 40". Descontando comissão e frete, o que sobra pode ser
--    negativo. O vendedor acha que está ganhando enquanto perde dinheiro, e
--    só descobre quando olha o extrato do Mercado Pago.
--
--    A correção guarda os valores reais cobrados, buscados do próprio Mercado
--    Livre por pedido, e calcula o lucro líquido a partir deles.
--
-- 2. Não havia registro de pagamento ao fornecedor. O portal mostra a ele
--    "Seu valor: R$ X", mas ninguém marca quando o dinheiro sai. Com poucos
--    pedidos dá para lembrar; com dez por semana vira discussão sobre o que
--    foi pago e o que não foi.

-- ---------------------------------------------------------------------------
-- 1. Custos reais do marketplace
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists taxa_marketplace numeric(10, 2),
  add column if not exists custo_frete numeric(10, 2),
  add column if not exists custos_apurados_em timestamptz;

comment on column public.orders.taxa_marketplace is
  'Comissão cobrada pelo marketplace, somada de order_items[].sale_fee. Nulo = ainda não apurado.';

comment on column public.orders.custo_frete is
  'Frete pago pelo VENDEDOR, de /shipments/{id}/costs → senders[].cost. Zero em envio por conta do comprador.';

comment on column public.orders.custos_apurados_em is
  'Quando os custos foram buscados no marketplace. Distingue "custo zero" de "ainda não perguntamos".';

-- Coluna calculada em vez de campo gravado: lucro que se calcula sozinho nunca
-- fica dessincronizado do preço. Enquanto os custos não forem apurados, eles
-- contam como zero — e é por isso que `custos_apurados_em` existe: sem ele,
-- pedido não apurado e pedido sem custo pareceriam a mesma coisa.
alter table public.orders
  drop column if exists lucro_liquido;

-- A quantidade entra na conta de propósito. `sale_price` e `supplier_price`
-- são valores UNITÁRIOS, e o cálculo antigo de `profit` os subtraía direto,
-- como se toda venda fosse de uma peça só. Num pedido de três unidades isso
-- contava um terço do lucro — e, o que é pior, um terço do prejuízo.
alter table public.orders
  add column lucro_liquido numeric(10, 2)
  generated always as (
    (coalesce(sale_price, 0) - coalesce(supplier_price, 0))
      * coalesce(quantidade, 1)
    - coalesce(taxa_marketplace, 0)
    - coalesce(custo_frete, 0)
  ) stored;

comment on column public.orders.lucro_liquido is
  'O que sobra de verdade: (venda - fornecedor) x quantidade, menos comissão e frete.';

-- Faturamento também precisa multiplicar. Existe como coluna calculada para o
-- Financeiro não repetir a conta em cada tela e errar em uma delas.
alter table public.orders
  drop column if exists receita_total;

alter table public.orders
  add column receita_total numeric(10, 2)
  generated always as (coalesce(sale_price, 0) * coalesce(quantidade, 1)) stored;

comment on column public.orders.receita_total is
  'Preço unitário x quantidade. O que o pedido faturou de fato.';

-- ---------------------------------------------------------------------------
-- 2. Pagamento ao fornecedor
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists pago_ao_fornecedor_em timestamptz;

comment on column public.orders.pago_ao_fornecedor_em is
  'Quando o vendedor declarou ter pago o fornecedor. Nulo = em aberto.';

create index if not exists orders_fornecedor_em_aberto_idx
  on public.orders (supplier_id)
  where pago_ao_fornecedor_em is null;

/**
 * Marca ou desmarca o pagamento ao fornecedor.
 *
 * Quem declara é o vendedor, dono do pedido — o fornecedor apenas enxerga o
 * resultado. Deixar o fornecedor marcar o próprio recebimento seria pedir para
 * o sistema virar palco de divergência.
 */
create or replace function public.marcar_pago_ao_fornecedor(
  p_order_id uuid,
  p_pago boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dono uuid;
begin
  select user_id into v_dono from public.orders where id = p_order_id;

  if v_dono is null then
    raise exception 'pedido não encontrado';
  end if;

  if v_dono <> auth.uid() then
    raise exception 'este pedido não é seu';
  end if;

  update public.orders
  set pago_ao_fornecedor_em = case when p_pago then now() else null end
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'pago', p_pago);
end;
$$;

grant execute on function public.marcar_pago_ao_fornecedor(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. O fornecedor enxerga o que já recebeu
-- ---------------------------------------------------------------------------
-- Recriada por inteiro porque view não aceita coluna nova por ALTER. Só muda
-- o acréscimo de `pago_em`; o resto é idêntico à versão anterior.

drop view if exists public.pedidos_do_fornecedor;

create view public.pedidos_do_fornecedor
with (security_invoker = false) as
select
  o.id,
  o.product_name,
  o.product_image_url,
  o.quantidade,
  o.customer_name,
  o.customer_phone,
  o.customer_address,
  o.comprador_documento,
  o.supplier_price,
  o.status,
  o.tracking_code,
  o.etiqueta_url,
  o.marketplace,
  o.created_at,
  o.updated_at,
  (o.ml_shipment_id is not null) as etiqueta_disponivel,
  (o.ml_order_status = 'cancelled') as cancelado_no_marketplace,

  -- Só a data. O fornecedor não precisa saber quanto o vendedor lucrou para
  -- saber se já recebeu.
  o.pago_ao_fornecedor_em as pago_em,

  exists (
    select 1 from public.tickets t
    where t.order_id = o.id
      and t.supplier_id = o.supplier_id
      and t.status in ('open', 'in_progress')
  ) as problema_relatado,

  chamado.id as chamado_id,

  coalesce((
    select count(*)
    from public.ticket_messages m
    where m.ticket_id = chamado.id
      and m.autor = 'vendedor'
      and m.created_at > coalesce(chamado.lido_fornecedor_em, 'epoch'::timestamptz)
  ), 0) as respostas_nao_lidas

from public.orders o
left join lateral (
  select t.id, t.lido_fornecedor_em
  from public.tickets t
  where t.order_id = o.id
    and t.supplier_id = o.supplier_id
  order by t.created_at desc
  limit 1
) chamado on true
where o.supplier_id = public.current_supplier_id()
  and (
    o.ml_order_status is null
    or o.ml_order_status = 'paid'
    or o.ml_order_status = 'cancelled'
  );

comment on view public.pedidos_do_fornecedor is
  'Pedidos do fornecedor logado, sem os dados comerciais do vendedor. Mostra os pagos e os cancelados; esconde os que aguardam pagamento. Única porta de leitura do Portal do Fornecedor.';

revoke all on public.pedidos_do_fornecedor from anon;
grant select on public.pedidos_do_fornecedor to authenticated;
