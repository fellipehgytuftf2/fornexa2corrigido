-- O que o Mercado Livre respondeu sobre o envio, guardado no pedido.
--
-- O cartão do fornecedor dizia "Pronto para despachar" em pedido que o Mercado
-- Livre estava segurando. Não era mentira por descuido: o FORNEXA sabia que
-- liberou de sua parte, e a parte do Mercado Livre — DC-e faltando, envio em
-- espera de coleta — só aparecia quando alguém clicava em Baixar etiqueta.
--
-- Numa lista de vinte, isso derruba o valor do selo inteiro: se "pronto" às
-- vezes não é pronto, o fornecedor volta a clicar em todos.
--
-- A sincronização e o webhook já leem o envio para pegar rastreio e endereço —
-- e jogavam fora o campo que responde isto. Agora ele fica.

alter table public.orders
  add column if not exists ml_shipment_substatus text,
  add column if not exists ml_shipment_visto_em timestamptz;

comment on column public.orders.ml_shipment_substatus is
  'O substatus do envio na última vez que o Mercado Livre foi consultado: invoice_pending, buffered, ready_to_print, printed. É o que separa "o FORNEXA liberou" de "dá para imprimir agora".';

comment on column public.orders.ml_shipment_visto_em is
  'Quando esse substatus foi lido. Um valor de três dias atrás diz pouco sobre agora.';


-- ----------------------------------------------------------------------------
-- A view do fornecedor passa a levar o substatus
-- ----------------------------------------------------------------------------
-- Recriada inteira porque não dá para acrescentar coluna a uma view existente.
-- O resto é idêntico a 20260908140000.

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

  (o.ml_shipment_id is not null and liberado.ok) as etiqueta_disponivel,
  (o.ml_order_status = 'cancelled') as cancelado_no_marketplace,

  -- O que falta do lado do Mercado Livre. Sem isto o cartão só sabia dizer se o
  -- FORNEXA liberou, que é metade da resposta.
  o.ml_shipment_substatus,

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
  'Pedidos do fornecedor logado, com quem vendeu mas sem os valores do vendedor. Endereço e etiqueta ficam ocultos enquanto o pagamento não for confirmado, quando o fornecedor exige pagamento antecipado. Comprovante e identificador só aparecem depois que o vendedor declara o pagamento.';

revoke all on public.pedidos_do_fornecedor from anon;
grant select on public.pedidos_do_fornecedor to authenticated;
