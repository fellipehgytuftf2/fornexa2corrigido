-- Pedido Flex só libera etiqueta depois que o vendedor confirma o cadastro na
-- transportadora do fornecedor.
--
-- POR QUE
--
-- "A galera está ativando o FLEX sem transportador." Flex é entrega no mesmo
-- dia, e quem despacha precisa de cadastro prévio na transportadora do
-- fornecedor — a J3, no caso da MS Digital. O vendedor liga o Flex na conta
-- dele do Mercado Livre sem saber disso, a venda chega, e o pacote empaca na
-- bancada do fornecedor, que não tem como despachar.
--
-- Até aqui o FORNEXA só mostrava um selo dizendo que o pedido era Flex. Ver o
-- problema não resolve o problema: o pedido continua parado, e agora com duas
-- pessoas sabendo.
--
-- COMO FUNCIONA
--
--   1. O fornecedor cadastra a transportadora dele e o contato.
--   2. Chegando venda Flex, a etiqueta fica presa e o Portal diz por quê.
--   3. O vendedor vê o contato da transportadora na tela de Pedidos, se
--      cadastra, e marca "Estou cadastrado".
--   4. A etiqueta libera — para todos os pedidos Flex daquele fornecedor.
--
-- A confirmação é POR FORNECEDOR, não por pedido: o cadastro na transportadora
-- se faz uma vez. Pedir de novo a cada venda seria burocracia sem ganho.
--
-- O FORNECEDOR DECIDE SE A TRAVA EXISTE
--
-- Sem transportadora cadastrada, nada trava. Fornecedor que não usa
-- transportadora própria — ou que aceita Flex sem cadastro — simplesmente não
-- preenche o campo, e o Flex segue como hoje.


-- ----------------------------------------------------------------------------
-- A transportadora do fornecedor
-- ----------------------------------------------------------------------------

alter table public.suppliers
  add column if not exists transportadora_nome text,
  add column if not exists transportadora_contato text;

comment on column public.suppliers.transportadora_nome is
  'Transportadora que faz o Flex deste fornecedor. Preenchido, passa a exigir que o vendedor confirme cadastro antes de a etiqueta Flex liberar.';

comment on column public.suppliers.transportadora_contato is
  'Como falar com a transportadora: telefone, WhatsApp, site ou e-mail. Aparece para o vendedor no pedido Flex.';


create or replace function public.fornecedor_define_transportadora(
  p_nome text,
  p_contato text
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
    raise exception 'apenas fornecedores';
  end if;

  update public.suppliers
  set
    transportadora_nome = nullif(btrim(coalesce(p_nome, '')), ''),
    transportadora_contato = nullif(btrim(coalesce(p_contato, '')), ''),
    updated_at = now()
  where id = v_fornecedor;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fornecedor_define_transportadora(text, text) from public, anon;
grant execute on function public.fornecedor_define_transportadora(text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- A confirmação do vendedor
-- ----------------------------------------------------------------------------

create table if not exists public.cadastros_na_transportadora (
  user_id uuid not null references auth.users (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  confirmado_em timestamptz not null default now(),

  primary key (user_id, supplier_id)
);

comment on table public.cadastros_na_transportadora is
  'O vendedor declara que já tem cadastro na transportadora daquele fornecedor. Libera a etiqueta dos pedidos Flex dele.';

alter table public.cadastros_na_transportadora enable row level security;
-- Sem policy: tudo passa pelas funções abaixo, como no resto do Portal.


create or replace function public.vendedor_confirma_transportadora(
  p_supplier_id uuid,
  p_confirmado boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'faça login novamente';
  end if;

  if p_confirmado then
    insert into public.cadastros_na_transportadora (user_id, supplier_id)
    values (auth.uid(), p_supplier_id)
    on conflict (user_id, supplier_id) do nothing;
  else
    delete from public.cadastros_na_transportadora
    where user_id = auth.uid() and supplier_id = p_supplier_id;
  end if;

  return jsonb_build_object('ok', true, 'confirmado', p_confirmado);
end;
$$;

grant execute on function public.vendedor_confirma_transportadora(uuid, boolean) to authenticated;


/**
 * Os pedidos Flex do vendedor que estão presos esperando a confirmação.
 *
 * Agrupado por fornecedor, porque é assim que se resolve: um cadastro na
 * transportadora destrava todos os pedidos daquele fornecedor.
 */
create or replace function public.meus_pedidos_flex_parados()
returns table (
  supplier_id uuid,
  fornecedor text,
  transportadora text,
  contato text,
  pedidos bigint,
  confirmado boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    coalesce(nullif(s.company_name, ''), s.name)::text,
    s.transportadora_nome::text,
    s.transportadora_contato::text,
    count(o.id),
    exists (
      select 1 from public.cadastros_na_transportadora c
      where c.user_id = auth.uid() and c.supplier_id = s.id
    )
  from public.orders o
  join public.suppliers s on s.id = o.supplier_id
  where o.user_id = auth.uid()
    and o.ml_logistic_type = 'self_service'
    and nullif(btrim(coalesce(s.transportadora_nome, '')), '') is not null
    and o.status not in ('shipped', 'delivered', 'cancelled')
    and o.ml_order_status is distinct from 'cancelled'
  group by s.id, s.company_name, s.name, s.transportadora_nome, s.transportadora_contato;
$$;

grant execute on function public.meus_pedidos_flex_parados() to authenticated;


/** Serve à função da etiqueta, que precisa decidir pelo pedido. */
create or replace function public.flex_esperando_cadastro(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    o.ml_logistic_type = 'self_service'
    and nullif(btrim(coalesce(s.transportadora_nome, '')), '') is not null
    and not exists (
      select 1 from public.cadastros_na_transportadora c
      where c.user_id = o.user_id and c.supplier_id = o.supplier_id
    )
  from public.orders o
  join public.suppliers s on s.id = o.supplier_id
  where o.id = p_order_id;
$$;

grant execute on function public.flex_esperando_cadastro(uuid) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- O Portal passa a saber
-- ----------------------------------------------------------------------------
-- Recriada inteira porque não dá para acrescentar coluna a uma view existente.

drop view if exists public.pedidos_do_fornecedor;

create view public.pedidos_do_fornecedor
with (security_invoker = false) as
select
  o.id,
  o.product_name,
  o.product_image_url,
  o.quantidade,
  o.customer_name,

  case when liberado.ok then o.customer_phone end as customer_phone,
  case when liberado.ok then o.customer_address end as customer_address,
  case when liberado.ok then o.comprador_documento end as comprador_documento,

  o.supplier_price,
  o.taxa_embalagem,
  o.status,
  o.tracking_code,
  o.etiqueta_url,
  o.marketplace,
  o.created_at,
  o.updated_at,

  -- Flex sem cadastro na transportadora entra aqui: a etiqueta sairia para um
  -- vendedor que não tem como despachar.
  (o.ml_shipment_id is not null and liberado.ok and not flex.esperando)
    as etiqueta_disponivel,

  (o.ml_order_status = 'cancelled') as cancelado_no_marketplace,

  o.ml_shipment_substatus,
  o.ml_liberacao_em,
  o.sem_mercado_envios,

  (o.ml_logistic_type = 'self_service') as flex,
  flex.esperando as flex_sem_cadastro,
  s.transportadora_nome,

  (coalesce(etiqueta.barrada, false) and o.remetente_liberado_em is null)
    as etiqueta_barrada,

  o.reservado_em,
  o.reembolsado_em,

  (
    o.ml_order_status is distinct from 'cancelled'
    and o.status not in ('shipped', 'delivered', 'cancelled')
    and (
      o.reservado_em is not null
      or (
        o.pago_ao_fornecedor_em is not null
        and (
          o.ml_shipment_id is null
          or (o.ml_liberacao_em is not null and o.ml_liberacao_em > now())
          or (coalesce(etiqueta.barrada, false) and o.remetente_liberado_em is null)
          or flex.esperando
        )
      )
    )
  ) as reservado,

  o.pago_ao_fornecedor_em as pago_em,
  o.recebimento_confirmado_em,

  case when o.pago_ao_fornecedor_em is not null then o.comprovante_path end
    as comprovante_path,

  (not liberado.ok) as aguardando_pagamento,
  coalesce(s.exige_pagamento_antecipado, false) as exige_pagamento_antecipado,

  r.id as repasse_id,
  case when o.pago_ao_fornecedor_em is not null then r.txid end as repasse_txid,
  case when o.pago_ao_fornecedor_em is not null then r.valor end as repasse_valor,
  r.status as repasse_status,
  (
    select count(*) from public.orders irmaos where irmaos.repasse_id = r.id
  ) as repasse_pedidos,

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

left join public.suppliers s on s.id = o.supplier_id
left join public.profiles vendedor on vendedor.id = o.user_id
left join public.repasses r on r.id = o.repasse_id

cross join lateral (
  select (
    not coalesce(s.exige_pagamento_antecipado, false)
    or o.recebimento_confirmado_em is not null
  ) as ok
) liberado

cross join lateral (
  select (
    o.ml_logistic_type = 'self_service'
    and nullif(btrim(coalesce(s.transportadora_nome, '')), '') is not null
    and not exists (
      select 1 from public.cadastros_na_transportadora c
      where c.user_id = o.user_id and c.supplier_id = o.supplier_id
    )
  ) as esperando
) flex

left join lateral (
  select (l.detalhes->>'bloqueado') = 'true' as barrada
  from public.log_integracao_ml l
  where l.contexto = 'supplier-order-label'
    and l.detalhes->>'pedido_id' = o.id::text
  order by l.id desc
  limit 1
) etiqueta on true

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


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Pedidos Flex parados por falta de cadastro, por fornecedor:
-- select s.company_name, count(*)
-- from public.orders o join public.suppliers s on s.id = o.supplier_id
-- where o.ml_logistic_type = 'self_service'
--   and nullif(btrim(coalesce(s.transportadora_nome, '')), '') is not null
--   and not exists (select 1 from public.cadastros_na_transportadora c
--                    where c.user_id = o.user_id and c.supplier_id = o.supplier_id)
-- group by 1;

-- (b) Fornecedor sem transportadora cadastrada não trava nada:
-- select count(*) from public.orders o join public.suppliers s on s.id = o.supplier_id
-- where o.ml_logistic_type = 'self_service' and s.transportadora_nome is null;
