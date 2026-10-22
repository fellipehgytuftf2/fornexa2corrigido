-- O fornecedor passa a saber de quem é cada pedido.
--
-- A view do portal foi desenhada para esconder tudo do vendedor, e com razão:
-- preço de venda, margem e lucro não são da conta de quem fornece. Só que a
-- régua pegou junto o que o fornecedor legitimamente precisa — o nome de quem
-- vendeu.
--
-- Com um vendedor só isso não incomoda. Com dez usando a FORNEXA e comprando
-- do mesmo fornecedor, ele recebe uma pilha de pedidos sem conseguir atribuir
-- nenhum: não sabe separar por cliente, cobrar quem está devendo, nem emitir
-- nota contra quem comprou.
--
-- O que entra é identificação e contato. O que continua fora é dinheiro:
-- `sale_price`, `profit`, `lucro_liquido` e `taxa_marketplace` seguem
-- invisíveis para o fornecedor.

-- ---------------------------------------------------------------------------
-- 1. Onde o vendedor guarda como quer ser encontrado
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists empresa text,
  add column if not exists whatsapp text;

comment on column public.profiles.empresa is
  'Razão social ou nome da loja do vendedor. Mostrado ao fornecedor no pedido.';

comment on column public.profiles.whatsapp is
  'Contato direto do vendedor, visível ao fornecedor. Para urgência que não cabe em chamado.';

-- ---------------------------------------------------------------------------
-- 2. A view entrega quem vendeu
-- ---------------------------------------------------------------------------
-- Recriada por inteiro porque view não aceita coluna nova por ALTER. O que
-- muda em relação à versão anterior são as quatro colunas `vendedor_*`.
--
-- O join é seguro porque a view é security definer: ela lê `profiles` com a
-- permissão do dono, e o fornecedor continua sem acesso direto à tabela.

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
  o.pago_ao_fornecedor_em as pago_em,

  -- Quem vendeu. Identificação e contato apenas — nada de valores.
  coalesce(vendedor.empresa, vendedor.name) as vendedor_nome,
  vendedor.name as vendedor_responsavel,
  vendedor.whatsapp as vendedor_whatsapp,
  vendedor.email as vendedor_email,

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

left join public.profiles vendedor on vendedor.id = o.user_id

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
  'Pedidos do fornecedor logado, com quem vendeu mas sem os valores do vendedor. Mostra os pagos e os cancelados; esconde os que aguardam pagamento. Única porta de leitura do Portal do Fornecedor.';

revoke all on public.pedidos_do_fornecedor from anon;
grant select on public.pedidos_do_fornecedor to authenticated;
