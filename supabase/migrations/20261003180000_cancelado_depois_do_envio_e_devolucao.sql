-- Cancelado depois de despachado é devolução, não cancelamento.
--
-- O QUE ELE RELATOU
--
-- "O certo seria o pedido cancelado depois de enviado ir p aba devolução. Só o
-- vendedor sabe o motivo do cancelamento."
--
-- POR QUE ELE ESTÁ CERTO
--
-- Cancelamento antes do despacho não gera trabalho: a mercadoria nunca saiu da
-- prateleira. Cancelamento DEPOIS gera um pacote voltando — que precisa de
-- código de autorização, de alguém esperando o motorista na portaria, e tem
-- duas tentativas antes de o produto se perder. São duas situações com nomes
-- iguais e consequências opostas, e na mesma aba a segunda desaparece no meio
-- da primeira.
--
-- O DESPACHADO SE RECONHECE PELO RASTREIO
--
-- `tracking_code` só existe depois de a etiqueta sair e o pacote ser postado.
-- É o mesmo sinal que o webhook já usa para abrir devolução sozinho desde
-- ontem. Esta migração aplica a mesma régua ao que ficou para trás.
--
-- POR QUE OS AVISOS FICAM CALADOS AQUI
--
-- O gatilho que pede o código de autorização avisa o vendedor a cada devolução
-- aberta. Numa carga de pedidos antigos — cancelamentos de setembro, pacotes
-- que já voltaram ou já se perderam — isso seria dezenas de sinos tocando por
-- coisa resolvida. O gatilho fica desligado durante a carga e volta logo
-- depois, inteiro, para as devoluções de verdade.

-- ----------------------------------------------------------------------------
-- 1. O que ficou para trás
-- ----------------------------------------------------------------------------

alter table public.devolucoes disable trigger pedir_codigo_da_devolucao;

insert into public.devolucoes (
  order_id, user_id, supplier_id, catalog_product_id, motivo, prazo_cd, avisada_em
)
select
  o.id,
  o.user_id,
  o.supplier_id,
  up.catalog_product_id,
  case when o.ml_logistic_type = 'self_service' then 'cancelado_flex' else 'nao_entregue' end,
  public.dias_uteis_depois(current_date, 2),
  -- A data do cancelamento, e não a de hoje: a lista se ordena por ela, e
  -- carimbar tudo com agora empilharia setembro em cima do que chegou ontem.
  coalesce(o.updated_at, o.created_at)
from public.orders o
left join public.user_products up
  on up.id = coalesce(o.user_product_id, o.product_id)
where o.ml_order_status = 'cancelled'
  and o.tracking_code is not null
  and not exists (
    select 1 from public.devolucoes d where d.order_id = o.id
  );

alter table public.devolucoes enable trigger pedir_codigo_da_devolucao;


-- ----------------------------------------------------------------------------
-- 2. O dinheiro continua à vista na aba nova
-- ----------------------------------------------------------------------------
-- Saindo de Cancelados, esses pedidos levariam junto o botão de reembolso — e
-- cancelado pago ainda deve dinheiro ao vendedor, tendo o produto voltado ou
-- não. A lista de devoluções passa a carregar as duas marcas.

drop function if exists public.fornecedor_minhas_devolucoes();

create or replace function public.fornecedor_minhas_devolucoes()
returns table (
  id uuid,
  order_id uuid,
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
  codigo_interno text,
  pago_em timestamptz,
  reembolsado_em timestamptz
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
    o.id,
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

    -- Vazio é "o mesmo do cadastro".
    coalesce(nullif(pr.quem_recebe, ''), pr.name)::text,

    o.codigo_interno,
    o.pago_ao_fornecedor_em,
    o.reembolsado_em
  from public.devolucoes d
  join public.orders o on o.id = d.order_id
  left join public.profiles pr on pr.id = d.user_id
  where d.supplier_id = v_fornecedor
  order by d.avisada_em desc;
end;
$$;

grant execute on function public.fornecedor_minhas_devolucoes() to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Quantas devoluções a carga abriu:
-- select count(*) from public.devolucoes d
-- join public.orders o on o.id = d.order_id
-- where o.ml_order_status = 'cancelled' and o.tracking_code is not null;

-- (b) Nenhum cancelado com rastreio sem devolução (tem de dar 0):
-- select count(*) from public.orders o
-- where o.ml_order_status = 'cancelled'
--   and o.tracking_code is not null
--   and not exists (select 1 from public.devolucoes d where d.order_id = o.id);

-- (c) O gatilho voltou ligado (tgenabled = 'O'):
-- select tgname, tgenabled from pg_trigger
-- where tgname = 'pedir_codigo_da_devolucao';
