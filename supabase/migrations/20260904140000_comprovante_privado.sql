-- Comprovante em arquivo fechado, com link que expira.
--
-- A primeira versão guardava o comprovante junto das fotos de produto, num
-- lugar público. O endereço é sorteado e ninguém acha por acaso — mas quem
-- receber o link vê, para sempre, sem estar logado. Comprovante de PIX traz
-- nome, valor, banco e horário de duas pessoas.
--
-- Agora ele vai para um lugar fechado, e o endereço deixa de ser guardado. O
-- banco guarda só o caminho do arquivo; o endereço para abrir é gerado na hora,
-- vale poucos minutos e some.
--
-- POR QUE A LEITURA NÃO PASSA POR POLÍTICA DE STORAGE
--
-- Quem pode ver o comprovante é o vendedor que pagou, o fornecedor daquele
-- pedido e o admin — uma regra que mora no pedido, não no arquivo. Escrevê-la
-- em política de storage exigiria decompor o nome do arquivo para reencontrar o
-- pedido, e um dia alguém muda o padrão do nome e a regra se desfaz em silêncio.
--
-- A regra fica numa Edge Function, que confere o pedido e só então assina o
-- link. O arquivo em si não é legível por ninguém direto.

insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', false)
on conflict (id) do update set public = false;

-- Enviar pode qualquer conta logada; é o vendedor anexando a prova do PIX dele.
-- Ler não: nem esta política, nem outra, dá select. Só a função assina.
drop policy if exists "conta logada envia comprovante" on storage.objects;

create policy "conta logada envia comprovante"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'comprovantes');


alter table public.orders
  add column if not exists comprovante_path text;

comment on table public.orders is
  'Pedidos. `comprovante_path` guarda o caminho do arquivo no bucket fechado `comprovantes` — nunca um endereço aberto.';

-- O endereço público que a versão anterior gravava sai do banco. Deixá-lo
-- guardado manteria em pé exatamente o link que se quer aposentar.
alter table public.orders
  drop column if exists comprovante_url;


/** A view do Portal passa a expor o caminho, não o endereço. */
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

  -- Só diz que existe e onde está. Abrir depende da função que confere quem
  -- está pedindo.
  o.comprovante_path,

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
