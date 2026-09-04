-- Um PIX por pedido, com comprovante anexado.
--
-- O repasse nasceu agrupado: tudo que estava em aberto com um fornecedor virava
-- um PIX só. Menos cliques para o vendedor, menos lançamentos no extrato do
-- fornecedor. Parecia melhor para os dois.
--
-- O fornecedor apontou o que faltava nessa conta: o MED.
--
-- MED é o mecanismo do Banco Central em que quem pagou um PIX pede o dinheiro
-- de volta alegando fraude, e o valor é bloqueado na conta de quem recebeu.
-- Para contestar, o recebedor precisa provar aquele pagamento ligado àquele
-- pedido, com o rastreio da entrega. Ele já passou por isso.
--
-- Com cinco pedidos num PIX só, o comprovante mostra R$ 192,45 e o pedido
-- contestado vale R$ 17,36. Os números não batem e a defesa cai.
--
-- Então o agrupamento sai. Cada pedido tem o seu PIX, o seu identificador e o
-- seu comprovante — e cada um se defende sozinho.

alter table public.orders
  add column if not exists comprovante_url text;

comment on column public.orders.comprovante_url is
  'Comprovante do PIX deste pedido, enviado pelo vendedor. É a prova que o fornecedor usa para contestar um MED.';


/**
 * Abre o repasse de UM pedido.
 *
 * Substitui `abrir_repasse`, que juntava tudo do fornecedor. Reaproveita o
 * repasse ainda aberto do mesmo pedido: copiar o código duas vezes sem pagar
 * tem que dar o mesmo identificador, senão a mesma dívida ganha dois códigos e
 * alguém paga duas vezes.
 */
create or replace function public.abrir_repasse_do_pedido(p_order_id uuid)
returns table (id uuid, txid text, valor numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.orders;
  v_repasse public.repasses;
begin
  select * into v_pedido
  from public.orders o
  where o.id = p_order_id and o.user_id = auth.uid();

  if v_pedido.id is null then
    raise exception 'pedido não encontrado';
  end if;

  if v_pedido.pago_ao_fornecedor_em is not null then
    raise exception 'este pedido já está pago';
  end if;

  if v_pedido.supplier_id is null then
    raise exception 'pedido sem fornecedor vinculado';
  end if;

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
      coalesce(v_pedido.supplier_price, 0),
      'FNX' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 22))
    )
    returning * into v_repasse;

    update public.orders
    set repasse_id = v_repasse.id
    where orders.id = v_pedido.id;
  else
    -- O preço do pedido pode ter sido corrigido depois que o lote nasceu.
    update public.repasses
    set valor = coalesce(v_pedido.supplier_price, 0)
    where repasses.id = v_repasse.id
    returning * into v_repasse;
  end if;

  return query
  select v_repasse.id, v_repasse.txid, v_repasse.valor;
end;
$$;

grant execute on function public.abrir_repasse_do_pedido(uuid) to authenticated;

-- A versão que agrupava sai de circulação. Deixá-la de pé convidaria a voltar
-- a juntar pedidos, que é exatamente o que enfraquece a defesa do fornecedor.
drop function if exists public.abrir_repasse(uuid);


/** A view do Portal passa a mostrar o comprovante. */
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

  -- A prova que sustenta a contestação de um MED, junto do rastreio que já
  -- estava aqui em cima.
  o.comprovante_url,

  (not liberado.ok) as aguardando_pagamento,
  coalesce(s.exige_pagamento_antecipado, false) as exige_pagamento_antecipado,

  r.id as repasse_id,
  r.txid as repasse_txid,
  r.valor as repasse_valor,
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
