-- Pedido já despachado que é cancelado vira devolução, venha o aviso de onde vier.
--
-- O QUE ELE RELATOU
--
-- "O pedido quando marcado como ENVIADO, se houver cancelamento colocá-lo em
--  devolução; hoje está indo pra cancelado."
--
-- POR QUE ESTAVA ESCAPANDO
--
-- A devolução automática só nascia num caminho: o aviso de ENVIO do Mercado
-- Livre, quando ele diz que o pacote voltou ou que o envio foi cancelado
-- depois de postado. Só que o cancelamento costuma chegar pelo aviso de VENDA
-- — e esse caminho apenas marcava `ml_order_status = 'cancelled'` e seguia.
--
-- Resultado: pacote na rua, voltando, e o pedido parado na aba Cancelados,
-- onde ninguém espera encontrar coisa a fazer.
--
-- POR QUE UM GATILHO, E NÃO MAIS UM REMENDO NO WEBHOOK
--
-- São quatro portas que mexem em `orders`: o aviso de venda, o aviso de
-- envio, a sincronização manual e a ressincronização do admin. Tratar em cada
-- uma é esquecer numa delas — já esqueci em três. No gatilho, a regra vale
-- para qualquer caminho, inclusive os que ainda não existem.
--
-- A RÉGUA É O DESPACHO, NÃO O RASTREIO
--
-- `tracking_code` nasce junto com a etiqueta, antes de o pacote existir — foi
-- o erro de 03/10, que transformou cancelamento de prateleira em devolução. O
-- que vale é `status` ter chegado a 'shipped' ou 'delivered': é o carimbo de
-- quem despachou.

create or replace function public.cancelado_apos_envio_abre_devolucao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalogo uuid;
begin
  -- Só interessa a passagem para cancelado. Pedido que já estava cancelado e
  -- recebeu outra atualização qualquer não abre devolução de novo.
  if new.ml_order_status is distinct from 'cancelled'
     or old.ml_order_status is not distinct from 'cancelled' then
    return new;
  end if;

  -- Nunca saiu do galpão: é cancelamento de prateleira, e o lugar dele é
  -- Cancelados mesmo.
  if new.status not in ('shipped', 'delivered') then
    return new;
  end if;

  -- Já tem devolução: o aviso de envio pode ter chegado antes.
  if exists (select 1 from public.devolucoes d where d.order_id = new.id) then
    return new;
  end if;

  select up.catalog_product_id into v_catalogo
  from public.user_products up
  where up.id = coalesce(new.user_product_id, new.product_id);

  insert into public.devolucoes (
    order_id, user_id, supplier_id, catalog_product_id, motivo, prazo_cd
  )
  values (
    new.id,
    new.user_id,
    new.supplier_id,
    v_catalogo,
    -- Flex cancelado depois de despachado tem motivo próprio; o resto entra
    -- como não entregue, que é o que o pacote está fazendo: voltando.
    case when new.ml_logistic_type = 'self_service' then 'cancelado_flex' else 'nao_entregue' end,
    public.dias_uteis_depois(current_date, 2)
  );

  -- O aviso ao vendedor sai pelo gatilho `pedir_codigo_da_devolucao`, que já
  -- cuida disso para toda devolução nova. Dois caminhos avisando seria dois
  -- sinos para o mesmo pacote.

  return new;
end;
$$;

drop trigger if exists cancelado_apos_envio on public.orders;

create trigger cancelado_apos_envio
  after update of ml_order_status on public.orders
  for each row
  execute function public.cancelado_apos_envio_abre_devolucao();


-- ----------------------------------------------------------------------------
-- O que já está cancelado e despachado, sem devolução
-- ----------------------------------------------------------------------------
-- Mesma regra, aplicada ao que ficou para trás. Com o gatilho de aviso ligado:
-- são pedidos de agora, e o vendedor precisa saber que tem pacote voltando sem
-- código informado.

insert into public.devolucoes (
  order_id, user_id, supplier_id, catalog_product_id, motivo, prazo_cd
)
select
  o.id,
  o.user_id,
  o.supplier_id,
  up.catalog_product_id,
  case when o.ml_logistic_type = 'self_service' then 'cancelado_flex' else 'nao_entregue' end,
  public.dias_uteis_depois(current_date, 2)
from public.orders o
left join public.user_products up
  on up.id = coalesce(o.user_product_id, o.product_id)
where o.ml_order_status = 'cancelled'
  and o.status in ('shipped', 'delivered')
  and not exists (select 1 from public.devolucoes d where d.order_id = o.id);


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Nenhum despachado-e-cancelado sem devolução (tem de dar 0):
-- select count(*) from public.orders o
-- where o.ml_order_status = 'cancelled'
--   and o.status in ('shipped', 'delivered')
--   and not exists (select 1 from public.devolucoes d where d.order_id = o.id);

-- (b) O que a carga abriu agora:
-- select o.product_name, o.customer_name, d.motivo, d.avisada_em
-- from public.devolucoes d
-- join public.orders o on o.id = d.order_id
-- order by d.avisada_em desc limit 10;

-- (c) O gatilho está de pé:
-- select tgname, tgenabled from pg_trigger where tgname = 'cancelado_apos_envio';
