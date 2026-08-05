-- Proteção do fornecedor contra vendedor que recebe e não repassa.
--
-- O DINHEIRO NUNCA PASSA PELA FORNEXA, então nenhum código consegue reter o
-- que é do fornecedor. O que dá para fazer é tirar do vendedor desonesto as
-- duas coisas que ele precisa para agir: a mercadoria e o silêncio.
--
-- 1. A MERCADORIA. Hoje o fornecedor vê o pedido, separa, posta — e só depois
--    recebe. Ele está dando crédito a cada venda. Passa a existir a opção de
--    trancar endereço e etiqueta até o pagamento ser confirmado: sem pagar, o
--    produto não sai.
--
--    É opção, não regra. Exigir pagamento antecipado joga o capital de giro
--    para o vendedor, que só recebe do Mercado Livre dias depois da entrega, e
--    atraso no pagamento vira atraso no envio, que o ML pune na reputação.
--    Cada fornecedor decide sua política — alguns dão prazo justamente para
--    atrair vendedor.
--
-- 2. O SILÊNCIO. `pago_ao_fornecedor_em` é declaração do próprio vendedor:
--    quem quiser mentir clica sem ter mandado nada. Passa a haver um segundo
--    carimbo, do fornecedor, dizendo que o dinheiro chegou. Divergência entre
--    os dois fica visível para os dois lados e para o admin.
--
--    Isto contraria o que a migração anterior afirmava — que deixar o
--    fornecedor marcar viraria palco de divergência. A divergência é
--    exatamente o que precisa aparecer; escondê-la só protegia quem mente.

-- ---------------------------------------------------------------------------
-- 1. Política de cada fornecedor
-- ---------------------------------------------------------------------------

alter table public.suppliers
  add column if not exists exige_pagamento_antecipado boolean not null default false;

comment on column public.suppliers.exige_pagamento_antecipado is
  'Quando verdadeiro, endereço e etiqueta ficam trancados até o fornecedor confirmar o recebimento. Padrão falso: não muda a vida de quem já opera na confiança.';

/**
 * Liga ou desliga a exigência de pagamento antecipado de um fornecedor.
 *
 * Por função, e não por UPDATE direto, porque a decisão muda o fluxo de caixa
 * de todos os vendedores que compram desse fornecedor. Vale ter um único ponto
 * de entrada, com dono conhecido.
 */
create or replace function public.admin_define_pagamento_antecipado(
  p_supplier_id uuid,
  p_exige boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'apenas administradores podem mudar a política de pagamento';
  end if;

  update public.suppliers
  set exige_pagamento_antecipado = p_exige
  where id = p_supplier_id;

  if not found then
    raise exception 'fornecedor não encontrado';
  end if;

  return jsonb_build_object('ok', true, 'exige', p_exige);
end;
$$;

grant execute on function public.admin_define_pagamento_antecipado(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Confirmação de quem recebe
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists recebimento_confirmado_em timestamptz;

comment on column public.orders.recebimento_confirmado_em is
  'Quando o FORNECEDOR confirmou que o dinheiro chegou. Diferente de pago_ao_fornecedor_em, que é a declaração do vendedor.';

/**
 * O fornecedor confirma que recebeu.
 *
 * Só o dono do pedido do lado do fornecimento pode chamar. `current_supplier_id()`
 * resolve isso a partir da sessão, então não há como confirmar pedido alheio.
 */
create or replace function public.fornecedor_confirma_recebimento(
  p_order_id uuid,
  p_confirmado boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
  v_dono_do_pedido uuid;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem confirmar recebimento';
  end if;

  select supplier_id into v_dono_do_pedido
  from public.orders
  where id = p_order_id;

  if v_dono_do_pedido is null then
    raise exception 'pedido não encontrado';
  end if;

  if v_dono_do_pedido <> v_fornecedor then
    raise exception 'este pedido não é seu';
  end if;

  update public.orders
  set recebimento_confirmado_em = case when p_confirmado then now() else null end
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'confirmado', p_confirmado);
end;
$$;

grant execute on function public.fornecedor_confirma_recebimento(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Quem pode despachar
-- ---------------------------------------------------------------------------
-- Uma função só, porque a mesma pergunta é feita em três lugares: a view, a
-- função de etiqueta e a de mudança de status. Regra repetida é regra que um
-- dia diverge.

create or replace function public.pedido_liberado_para_despacho(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not coalesce(s.exige_pagamento_antecipado, false)
      or o.recebimento_confirmado_em is not null
  from public.orders o
  left join public.suppliers s on s.id = o.supplier_id
  where o.id = p_order_id;
$$;

grant execute on function public.pedido_liberado_para_despacho(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. A view tranca o que precisa ser trancado
-- ---------------------------------------------------------------------------
-- O pedido continua aparecendo: o fornecedor precisa saber que existe venda
-- para se organizar. O que some é o que permite despachar — endereço,
-- telefone, documento e etiqueta.

drop view if exists public.pedidos_do_fornecedor;

create view public.pedidos_do_fornecedor
with (security_invoker = false) as
select
  o.id,
  o.product_name,
  o.product_image_url,
  o.quantidade,
  o.customer_name,

  -- Trancados até o pagamento ser confirmado, quando o fornecedor exige.
  case when liberado.ok then o.customer_phone end as customer_phone,
  case when liberado.ok then o.customer_address end as customer_address,
  case when liberado.ok then o.comprador_documento end as comprador_documento,

  o.supplier_price,
  o.status,
  o.tracking_code,
  o.etiqueta_url,
  o.marketplace,
  o.created_at,
  o.updated_at,

  (o.ml_shipment_id is not null and liberado.ok) as etiqueta_disponivel,
  (o.ml_order_status = 'cancelled') as cancelado_no_marketplace,

  o.pago_ao_fornecedor_em as pago_em,
  o.recebimento_confirmado_em,

  -- O portal precisa distinguir "ainda não pagaram" de "não tem etiqueta".
  (not liberado.ok) as aguardando_pagamento,
  coalesce(s.exige_pagamento_antecipado, false) as exige_pagamento_antecipado,

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

cross join lateral (
  select (
    not coalesce(s.exige_pagamento_antecipado, false)
    or o.recebimento_confirmado_em is not null
  ) as ok
) liberado

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
  'Pedidos do fornecedor logado, com quem vendeu mas sem os valores do vendedor. Endereço e etiqueta ficam ocultos enquanto o pagamento não for confirmado, quando o fornecedor exige pagamento antecipado.';

revoke all on public.pedidos_do_fornecedor from anon;
grant select on public.pedidos_do_fornecedor to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Mudar status também respeita a trava
-- ---------------------------------------------------------------------------
-- Esconder na tela não basta: a função de status é outra porta, e quem sabe
-- chamá-la direto contornaria a regra sem esforço.

-- Mantém a assinatura, o retorno void, a máquina de transições e os errcodes
-- da versão anterior. O único acréscimo é a trava de despacho.

create or replace function public.fornecedor_atualiza_status_pedido(
  p_pedido_id uuid,
  p_novo_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_supplier_id uuid;
  v_status_atual text;
begin
  v_supplier_id := public.current_supplier_id();

  if v_supplier_id is null then
    raise exception 'Apenas fornecedores podem alterar o status por aqui.'
      using errcode = 'insufficient_privilege';
  end if;

  select o.status into v_status_atual
  from public.orders o
  where o.id = p_pedido_id
    and o.supplier_id = v_supplier_id
  for update;

  if v_status_atual is null then
    raise exception 'Pedido não encontrado para este fornecedor.'
      using errcode = 'no_data_found';
  end if;

  if not (
    (v_status_atual in ('pending', 'sent_to_supplier')
      and p_novo_status in ('separating', 'shipped'))
    or (v_status_atual = 'separating' and p_novo_status = 'shipped')
  ) then
    raise exception 'Transição de status não permitida: % para %',
      v_status_atual, p_novo_status
      using errcode = 'check_violation';
  end if;

  -- Separar pode: é trabalho interno do fornecedor e não entrega mercadoria.
  -- Despachar não, enquanto o pagamento não estiver confirmado.
  if p_novo_status = 'shipped'
     and not public.pedido_liberado_para_despacho(p_pedido_id) then
    raise exception 'Confirme o recebimento do pagamento antes de marcar como enviado.'
      using errcode = 'check_violation';
  end if;

  update public.orders
  set status = p_novo_status,
      updated_at = now()
  where id = p_pedido_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. O admin enxerga quem está devendo
-- ---------------------------------------------------------------------------
-- Sem isto o problema só aparece quando o fornecedor liga reclamando. E é aqui
-- que mora a alavanca real da plataforma: nenhum código impede um desonesto de
-- agir, mas o dono da FORNEXA pode cortar o acesso de quem age.

create or replace function public.admin_repasses_em_aberto()
returns table (
  order_id uuid,
  criado_em timestamptz,
  produto text,
  valor numeric,
  dias_em_aberto integer,
  vendedor_nome text,
  vendedor_email text,
  fornecedor_nome text,
  declarado_pago_em timestamptz,
  recebimento_confirmado_em timestamptz,
  divergente boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'apenas administradores podem ver os repasses';
  end if;

  return query
  select
    o.id,
    o.created_at,
    o.product_name,
    coalesce(o.supplier_price, 0) * coalesce(o.quantidade, 1),
    extract(day from now() - o.created_at)::integer,
    coalesce(v.empresa, v.name),
    v.email,
    coalesce(f.company_name, f.name),
    o.pago_ao_fornecedor_em,
    o.recebimento_confirmado_em,

    -- O vendedor disse que pagou e o fornecedor não confirmou. Não prova
    -- má-fé — pode ser só o fornecedor sem olhar o portal — mas é a única
    -- lista onde uma mentira apareceria.
    (o.pago_ao_fornecedor_em is not null and o.recebimento_confirmado_em is null)
  from public.orders o
  left join public.profiles v on v.id = o.user_id
  left join public.suppliers f on f.id = o.supplier_id
  where o.recebimento_confirmado_em is null
    and o.supplier_id is not null
    and coalesce(o.ml_order_status, 'paid') <> 'cancelled'
    and o.status <> 'cancelled'
  order by o.created_at;
end;
$$;

grant execute on function public.admin_repasses_em_aberto() to authenticated;
