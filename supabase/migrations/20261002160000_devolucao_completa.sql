-- O que faltava na devolução: quem recebe, código interno, Flex e o estoque.
--
-- SÃO CINCO PEDIDOS DO FORNECEDOR, E UM PROBLEMA SÓ
--
-- Todas as devoluções de todos os vendedores chegam no mesmo galpão. Quem está
-- na portaria precisa responder três perguntas antes de o motorista ir embora:
-- de quem é este pacote, qual o código que libera a entrega, e a que pedido
-- isso corresponde lá dentro.
--
--   1. QUEM RECEBE — na devolução aberta pelo comprador, a etiqueta traz só o
--      nome de contato do endereço do vendedor no Mercado Livre. É a única
--      coisa que liga o pacote ao dono, e o FORNEXA não guardava isso.
--
--   2. BUSCA PELO NÚMERO DA VENDA — quando é o Mercado Livre que devolve (não
--      entregue, não recebido, cancelado pós-envio), o pacote volta com a
--      etiqueta de ida, que traz o número da venda. Esse número o FORNEXA tem.
--
--   3. CÓDIGO INTERNO — o que a equipe carimba na separação, para amarrar o
--      pacote ao pedido no processo deles.
--
--   4. CANCELADO (FLEX) — o quinto motivo de devolução, que faltava.
--
--   5. RECEBIDA DEVOLVE AO ESTOQUE — o produto voltava para a prateleira e a
--      quantidade não voltava para o sistema.


-- ----------------------------------------------------------------------------
-- 1. Quem recebe
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists quem_recebe text;

comment on column public.profiles.quem_recebe is
  'O nome de contato que o vendedor cadastrou no endereço do Mercado Livre. É o que aparece na etiqueta de devolução, e a única forma de identificar o dono do pacote no galpão do fornecedor.';

-- A tabela é lida coluna a coluna por `authenticated` desde a auditoria de
-- 22/09: coluna nova fora da lista faz o SELECT inteiro falhar.
grant select (quem_recebe), update (quem_recebe) on public.profiles to authenticated;


-- ----------------------------------------------------------------------------
-- 3. O código interno do fornecedor, no pedido
-- ----------------------------------------------------------------------------

alter table public.orders
  add column if not exists codigo_interno text;

comment on column public.orders.codigo_interno is
  'Código que a equipe do fornecedor carimba na separação. Serve ao processo interno dele, e volta junto quando o pacote é devolvido.';

create or replace function public.fornecedor_define_codigo_interno(
  p_order_id uuid,
  p_codigo text
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

  update public.orders
  set codigo_interno = nullif(btrim(coalesce(p_codigo, '')), ''), updated_at = now()
  where id = p_order_id and supplier_id = v_fornecedor;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fornecedor_define_codigo_interno(uuid, text) from public, anon;
grant execute on function public.fornecedor_define_codigo_interno(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 4. Cancelado (Flex), o quinto motivo
-- ----------------------------------------------------------------------------

alter table public.devolucoes drop constraint if exists devolucoes_motivo_check;

alter table public.devolucoes
  add constraint devolucoes_motivo_check check (
    motivo in (
      'arrependimento', 'nao_entregue', 'defeito', 'produto_errado', 'cancelado_flex'
    )
  );


-- ----------------------------------------------------------------------------
-- 2. A busca pelo número da venda
-- ----------------------------------------------------------------------------
-- A equipe digita o número impresso na etiqueta e descobre de quem é o pacote,
-- sem depender de nome nenhum.

create or replace function public.fornecedor_busca_venda(p_numero text)
returns table (
  order_id uuid,
  produto text,
  quantidade integer,
  ml_order_id text,
  codigo_interno text,
  vendedor text,
  vendedor_whatsapp text,
  quem_recebe text,
  status text,
  devolucao_id uuid,
  devolucao_status text,
  devolucao_codigo text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
  v_limpo text;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores';
  end if;

  -- A etiqueta traz "Venda: 2000018520550620", e quem digita costuma trazer o
  -- rótulo junto. Só os dígitos importam.
  v_limpo := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');

  if length(v_limpo) < 6 then
    return;
  end if;

  return query
  select
    o.id,
    o.product_name,
    o.quantidade,
    o.ml_order_id::text,
    o.codigo_interno,
    coalesce(nullif(pr.empresa, ''), pr.name)::text,
    pr.whatsapp::text,
    pr.quem_recebe::text,
    o.status::text,
    d.id,
    d.status::text,
    d.codigo_autorizacao
  from public.orders o
  left join public.profiles pr on pr.id = o.user_id
  left join lateral (
    select dv.id, dv.status, dv.codigo_autorizacao
    from public.devolucoes dv
    where dv.order_id = o.id
    order by dv.avisada_em desc
    limit 1
  ) d on true
  where o.supplier_id = v_fornecedor
    and (
      o.ml_order_id::text like '%' || v_limpo || '%'
      or o.tracking_code like '%' || upper(btrim(coalesce(p_numero, ''))) || '%'
    )
  order by o.created_at desc
  limit 10;
end;
$$;

revoke all on function public.fornecedor_busca_venda(text) from public, anon;
grant execute on function public.fornecedor_busca_venda(text) to authenticated;


-- ----------------------------------------------------------------------------
-- 5. Recebida devolve ao estoque
-- ----------------------------------------------------------------------------
-- O produto voltava para a prateleira e a quantidade não voltava para o
-- sistema: o catálogo seguia dizendo que não havia, e a venda seguinte não
-- acontecia.
--
-- Só "recebida" soma. Avariada não volta a ser vendável, e "não chegou" nunca
-- entrou no galpão.
--
-- A condição `status = 'avisada'` no UPDATE é o que impede somar duas vezes se
-- alguém responder de novo.

create or replace function public.fornecedor_recebe_devolucao(
  p_devolucao uuid,
  p_situacao text,
  p_observacao text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
  v_catalogo uuid;
  v_quantidade integer;
  v_existe boolean;
begin
  if p_situacao not in ('recebida', 'avariada', 'nao_chegou') then
    raise exception 'situação inválida';
  end if;

  select s.id into v_fornecedor
  from public.suppliers s
  where s.auth_user_id = auth.uid();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem confirmar recebimento';
  end if;

  select exists (
    select 1 from public.devolucoes d
    where d.id = p_devolucao and d.supplier_id = v_fornecedor
  ) into v_existe;

  if not v_existe then
    raise exception 'devolução não encontrada ou não é deste fornecedor';
  end if;

  update public.devolucoes
  set
    status = p_situacao,
    recebida_em = case when p_situacao = 'nao_chegou' then null else now() end,
    observacao_fornecedor = nullif(btrim(coalesce(p_observacao, '')), ''),
    updated_at = now()
  where id = p_devolucao
    and supplier_id = v_fornecedor
    and status = 'avisada'
  returning catalog_product_id into v_catalogo;

  if p_situacao = 'recebida' and v_catalogo is not null then
    select greatest(1, coalesce(o.quantidade, 1)) into v_quantidade
    from public.devolucoes d
    join public.orders o on o.id = d.order_id
    where d.id = p_devolucao;

    update public.catalog_products
    set
      stock = coalesce(stock, 0) + coalesce(v_quantidade, 1),
      indisponivel_no_fornecedor = false
    where id = v_catalogo;
  end if;

  return p_situacao;
end;
$$;

grant execute on function public.fornecedor_recebe_devolucao(uuid, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- A aba Devoluções passa a mostrar quem recebe e o código interno
-- ----------------------------------------------------------------------------
-- Ganhou colunas, então cai antes de ser recriada.

drop function if exists public.fornecedor_minhas_devolucoes();

create or replace function public.fornecedor_minhas_devolucoes()
returns table (
  id uuid,
  produto text,
  imagem text,
  rastreio text,
  motivo text,
  codigo_devolucao text,
  status text,
  avisada_em timestamptz,
  prazo_cd date,
  codigo_autorizacao text,
  tentativas integer,
  ultima_tentativa_em timestamptz,
  ml_order_id text,
  vendedor text,
  vendedor_whatsapp text,
  quem_recebe text,
  codigo_interno text
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
    raise exception 'apenas fornecedores podem ver isto';
  end if;

  return query
  select
    d.id,
    o.product_name,
    o.product_image_url,
    o.tracking_code,
    d.motivo,
    d.codigo_devolucao,
    d.status,
    d.avisada_em,
    d.prazo_cd,
    d.codigo_autorizacao,
    d.tentativas,
    d.ultima_tentativa_em,
    o.ml_order_id::text,
    coalesce(nullif(pr.empresa, ''), pr.name)::text,
    pr.whatsapp::text,

    -- O nome impresso na etiqueta de devolução do comprador. Sem ele, o pacote
    -- chega sem dono.
    pr.quem_recebe::text,

    o.codigo_interno
  from public.devolucoes d
  join public.orders o on o.id = d.order_id
  left join public.profiles pr on pr.id = d.user_id
  where d.supplier_id = v_fornecedor
  order by d.avisada_em desc;
end;
$$;

grant execute on function public.fornecedor_minhas_devolucoes() to authenticated;
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

  (o.ml_shipment_id is not null and liberado.ok and not flex.esperando)
    as etiqueta_disponivel,

  (o.ml_order_status = 'cancelled') as cancelado_no_marketplace,

  o.ml_shipment_id,

  -- O código do anúncio, para procurar na prateleira.
  anuncio.ml_item_id as sku,

  -- O tipo cru, que a tela traduz. Guardar o texto pronto aqui deixaria a
  -- frase presa numa migração.
  o.ml_logistic_type,
  o.ml_shipment_substatus,
  o.ml_liberacao_em,
  o.sem_mercado_envios,

  (o.ml_logistic_type = 'self_service') as flex,
  flex.esperando as flex_sem_cadastro,
  flex.aprovado_em as flex_confirmado_em,
  flex.declarado_em as flex_declarado_em,
  flex.codigo as flex_codigo,
  o.user_id as vendedor_user_id,
  s.transportadora_nome,

  (coalesce(etiqueta.barrada, false) and o.remetente_liberado_em is null)
    as etiqueta_barrada,

  o.codigo_interno,
  vendedor.quem_recebe,

  devolucao.id as devolucao_id,
  devolucao.status as devolucao_status,
  devolucao.motivo as devolucao_motivo,
  devolucao.prazo_cd as devolucao_prazo,
  devolucao.codigo_autorizacao as devolucao_codigo,
  devolucao.tentativas as devolucao_tentativas,

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

left join public.user_products anuncio
  on anuncio.id = coalesce(o.user_product_id, o.product_id)

cross join lateral (
  select (
    not coalesce(s.exige_pagamento_antecipado, false)
    or o.recebimento_confirmado_em is not null
  ) as ok
) liberado

cross join lateral (
  select
    (
      o.ml_logistic_type = 'self_service'
      and nullif(btrim(coalesce(s.transportadora_nome, '')), '') is not null
      and not exists (
        select 1 from public.cadastros_na_transportadora c
        where c.user_id = o.user_id
          and c.supplier_id = o.supplier_id
          and c.aprovado_em is not null
      )
    ) as esperando,
    (
      select c.aprovado_em from public.cadastros_na_transportadora c
      where c.user_id = o.user_id and c.supplier_id = o.supplier_id
    ) as aprovado_em,
    (
      select c.confirmado_em from public.cadastros_na_transportadora c
      where c.user_id = o.user_id
        and c.supplier_id = o.supplier_id
        and c.aprovado_em is null
        and c.recusado_em is null
    ) as declarado_em,
    (
      select c.codigo from public.cadastros_na_transportadora c
      where c.user_id = o.user_id and c.supplier_id = o.supplier_id
    ) as codigo
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

-- A devolução mais recente deste pedido. Mais de uma é raro, e a última é a
-- que está em curso.
left join lateral (
  select d.id, d.status, d.motivo, d.prazo_cd, d.codigo_autorizacao, d.tentativas
  from public.devolucoes d
  where d.order_id = o.id
  order by d.avisada_em desc
  limit 1
) devolucao on true

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
