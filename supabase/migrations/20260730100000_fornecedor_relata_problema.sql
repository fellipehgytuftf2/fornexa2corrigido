-- ============================================================================
-- Fornecedor relata problema em um pedido
--
-- PROBLEMA
-- Chega pedido de produto sem estoque, com endereço truncado ou quantidade
-- errada, e o fornecedor não tem nenhum botão no portal. A saída dele é o
-- WhatsApp — justamente o canal que o Portal do Fornecedor existe para
-- substituir.
--
-- SOLUÇÃO
-- Reusar `tickets`, que já alimenta a tela de Chamados do vendedor, ligando o
-- chamado ao pedido e ao fornecedor que relatou.
--
-- O chamado nasce com `user_id` do VENDEDOR dono do pedido, não do fornecedor:
-- é assim que ele aparece na tela de quem precisa resolver.
--
-- O fornecedor continua sem permissão alguma em `tickets`, mesmo princípio
-- aplicado a `orders`. Ele escreve pela função abaixo e enxerga apenas um
-- sinalizador na view.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Vínculos
-- ----------------------------------------------------------------------------
alter table public.tickets
  add column if not exists order_id uuid references public.orders (id) on delete set null,
  add column if not exists supplier_id uuid references public.suppliers (id) on delete set null;

comment on column public.tickets.order_id is
  'Pedido a que o chamado se refere. NULL em chamado aberto pelo vendedor sobre a plataforma.';

comment on column public.tickets.supplier_id is
  'Fornecedor que abriu o chamado pelo Portal. NULL quando quem abriu foi o vendedor.';

create index if not exists tickets_order_id_idx
  on public.tickets (order_id)
  where order_id is not null;

-- ----------------------------------------------------------------------------
-- 2. Abertura do chamado pelo fornecedor
--
-- Valida dono antes de gravar e recusa relato repetido enquanto o anterior não
-- for resolvido, para o vendedor não receber a mesma reclamação várias vezes.
-- ----------------------------------------------------------------------------
create or replace function public.fornecedor_relata_problema(
  p_pedido_id uuid,
  p_mensagem text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_supplier_id uuid;
  v_pedido record;
begin
  v_supplier_id := public.current_supplier_id();

  if v_supplier_id is null then
    raise exception 'Apenas fornecedores podem relatar problema por aqui.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_mensagem is null or length(btrim(p_mensagem)) < 10 then
    raise exception 'Descreva o problema com pelo menos 10 caracteres.'
      using errcode = 'check_violation';
  end if;

  select o.id, o.user_id, o.product_name
    into v_pedido
  from public.orders o
  where o.id = p_pedido_id
    and o.supplier_id = v_supplier_id;

  if v_pedido.id is null then
    raise exception 'Pedido não encontrado para este fornecedor.'
      using errcode = 'no_data_found';
  end if;

  if exists (
    select 1 from public.tickets t
    where t.order_id = v_pedido.id
      and t.supplier_id = v_supplier_id
      and t.status in ('open', 'in_progress')
  ) then
    raise exception 'Já existe um chamado aberto para este pedido.'
      using errcode = 'unique_violation';
  end if;

  insert into public.tickets (user_id, subject, message, status, order_id, supplier_id)
  values (
    v_pedido.user_id,
    'Problema no pedido: ' || v_pedido.product_name,
    btrim(p_mensagem),
    'open',
    v_pedido.id,
    v_supplier_id
  );
end;
$$;

comment on function public.fornecedor_relata_problema(uuid, text) is
  'Única forma de o fornecedor abrir chamado. O chamado nasce no nome do vendedor dono do pedido, para aparecer na tela dele.';

revoke all on function public.fornecedor_relata_problema(uuid, text) from public;
grant execute on function public.fornecedor_relata_problema(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. A view avisa que já existe chamado aberto
--
-- Só um booleano: evita o fornecedor relatar duas vezes e bater no erro, e não
-- expõe a tabela de chamados a ele.
-- ----------------------------------------------------------------------------
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

  exists (
    select 1 from public.tickets t
    where t.order_id = o.id
      and t.supplier_id = o.supplier_id
      and t.status in ('open', 'in_progress')
  ) as problema_relatado

from public.orders o
where o.supplier_id = public.current_supplier_id()
  and (
    o.ml_order_status is null            -- pedido registrado à mão
    or o.ml_order_status = 'paid'        -- venda paga
    or o.ml_order_status = 'cancelled'   -- cancelada: aparece, avisando
  );

comment on view public.pedidos_do_fornecedor is
  'Pedidos do fornecedor logado, sem os dados comerciais do vendedor. Mostra os pagos e os cancelados; esconde os que aguardam pagamento. Única porta de leitura do Portal do Fornecedor.';

revoke all on public.pedidos_do_fornecedor from anon;
grant select on public.pedidos_do_fornecedor to authenticated;

commit;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) As colunas e a coluna nova da view existem?
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'tickets'
-- order by ordinal_position;

-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'pedidos_do_fornecedor'
-- order by ordinal_position;

-- (b) Chamados abertos por fornecedor
-- select t.created_at, s.name as fornecedor, o.product_name, t.status, t.message
-- from public.tickets t
-- join public.suppliers s on s.id = t.supplier_id
-- left join public.orders o on o.id = t.order_id
-- order by t.created_at desc;
