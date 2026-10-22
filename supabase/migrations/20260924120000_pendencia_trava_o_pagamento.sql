-- Conta com pendência de remetente não paga o fornecedor.
--
-- O PROBLEMA, NA VOZ DE QUEM SOFRE
--
-- O fornecedor, por WhatsApp: "separamos o produto p qm pagou e esta com a
-- etiqueta presa". O dono: "aquelas contas que estão com pendências não
-- consiga fazer pagamentos".
--
-- É o mesmo buraco visto dos dois lados. A etiqueta trava quando o envio
-- sairia declarando outra cidade como remetente — regra certa, porque o
-- remetente é para onde a devolução volta. Só que o pagamento continuava
-- liberado: o vendedor pagava, o fornecedor separava a mercadoria, e o pacote
-- ficava na prateleira esperando uma etiqueta que não ia sair. Dinheiro
-- parado de um lado, mercadoria parada do outro.
--
-- Medido em 24/09/2026: 18 pedidos barrados e ainda ativos, de 13 vendedores.
-- SEIS deles já estavam pagos ao fornecedor — exatamente a prateleira que ele
-- descreveu.
--
-- O QUE CONTA COMO PENDÊNCIA
--
-- Só o que foi PROVADO por um envio real, nunca suspeita:
--
--   1. a origem declarada foi desmentida — o pacote saiu de outra cidade;
--   2. um pedido teve a etiqueta barrada na trava de remetente, continua
--      ativo e ninguém liberou na mão.
--
-- Declaração ainda sem prova NÃO entra. Hoje são 284 declarações, 23
-- confirmadas e 3 desmentidas: travar por falta de confirmação pararia 258
-- vendedores que provavelmente estão certos.
--
-- POR CONTA, E NÃO POR PEDIDO
--
-- O endereço errado é da conta, não da venda. Travar só o pedido barrado
-- deixaria o vendedor pagar os outros e encher a prateleira do fornecedor com
-- pacotes que vão travar do mesmo jeito.
--
-- COMO SAI DA TRAVA
--
-- Corrigindo o remetente no Mercado Livre e baixando a etiqueta de novo — o
-- próximo envio confirma a origem e a pendência some sozinha. Para o caso que
-- não pode esperar, o admin libera o pedido em Admin → Pedidos travados no
-- remetente, como já fazia.

-- ----------------------------------------------------------------------------
-- 1. A pendência de uma conta
-- ----------------------------------------------------------------------------

create or replace function public.pendencia_de_remetente(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with desmentida as (
    select od.origem_no_envio
    from public.origem_declarada od
    where od.user_id = p_user_id
      and od.desmentida_em is not null
    limit 1
  ),
  -- A última tentativa de etiqueta de cada pedido. Se o vendedor corrigiu o
  -- endereço e baixou depois, é a tentativa mais recente que vale.
  ultima_tentativa as (
    select distinct on (l.detalhes->>'pedido_id')
      (l.detalhes->>'pedido_id')::uuid as pedido_id,
      l.detalhes->>'bloqueado' as bloqueado,
      l.detalhes->>'origem_no_ml' as origem_no_ml
    from public.log_integracao_ml l
    where l.contexto = 'supplier-order-label'
      and l.detalhes->>'pedido_id' is not null
    order by l.detalhes->>'pedido_id', l.id desc
  ),
  barrado as (
    select t.origem_no_ml, count(*) over () as quantos
    from ultima_tentativa t
    join public.orders o on o.id = t.pedido_id
    where t.bloqueado = 'true'
      and o.user_id = p_user_id
      and o.remetente_liberado_em is null
      and o.status not in ('shipped', 'delivered', 'cancelled')
    limit 1
  )
  select jsonb_build_object(
    'tem', (exists (select 1 from desmentida) or exists (select 1 from barrado)),
    'pedidos_barrados', coalesce((select quantos from barrado), 0),
    'origem_no_envio', coalesce(
      (select origem_no_envio from desmentida),
      (select origem_no_ml from barrado)
    )
  );
$$;

comment on function public.pendencia_de_remetente(uuid) is
  'A pendência de remetente de uma conta, provada por envio real: origem desmentida ou pedido com etiqueta barrada e não liberada.';

revoke all on function public.pendencia_de_remetente(uuid) from public, anon;
grant execute on function public.pendencia_de_remetente(uuid) to authenticated;


/** A minha, para a tela do vendedor explicar antes de ele clicar. */
create or replace function public.minha_pendencia_de_remetente()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.pendencia_de_remetente(auth.uid());
$$;

revoke all on function public.minha_pendencia_de_remetente() from public, anon;
grant execute on function public.minha_pendencia_de_remetente() to authenticated;


-- ----------------------------------------------------------------------------
-- 2. A cobrança não nasce com a conta pendente
-- ----------------------------------------------------------------------------
-- Primeira porta: sem PIX copiado não há o que comprovar, e o vendedor para
-- antes de mandar dinheiro para um pedido que não vai despachar.
--
-- O resto da função é idêntico a 20260906180000_taxa_de_embalagem.sql.

create or replace function public.abrir_repasse_do_pedido(p_order_id uuid)
returns table (id uuid, txid text, valor numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.orders;
  v_repasse public.repasses;
  v_valor numeric;
  v_pendencia jsonb;
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

  v_pendencia := public.pendencia_de_remetente(v_pedido.user_id);

  if (v_pendencia->>'tem')::boolean then
    raise exception 'Sua conta está com o remetente pendente%. Corrija o endereço de remetente no Mercado Livre antes de pagar — enquanto isso a etiqueta fica presa e o fornecedor não consegue despachar.',
      case
        when v_pendencia->>'origem_no_envio' is not null
          then ' (o último envio saiu de ' || (v_pendencia->>'origem_no_envio') || ')'
        else ''
      end;
  end if;

  if v_pedido.repasse_id is not null then
    select * into v_repasse
    from public.repasses r
    where r.id = v_pedido.repasse_id and r.status = 'aberto';
  end if;

  -- O produto vezes a quantidade, mais uma embalagem.
  v_valor := coalesce(v_pedido.supplier_price, 0) * coalesce(v_pedido.quantidade, 1)
    + coalesce(v_pedido.taxa_embalagem, 0);

  if v_repasse.id is null then
    insert into public.repasses (user_id, supplier_id, valor, txid)
    values (
      v_pedido.user_id,
      v_pedido.supplier_id,
      v_valor,
      'FNX' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 22))
    )
    returning * into v_repasse;

    update public.orders
    set repasse_id = v_repasse.id
    where orders.id = v_pedido.id;
  else
    -- O preço do pedido pode ter sido corrigido depois que o lote nasceu.
    update public.repasses
    set valor = v_valor
    where repasses.id = v_repasse.id
    returning * into v_repasse;
  end if;

  return query
  select v_repasse.id, v_repasse.txid, v_repasse.valor;
end;
$$;

grant execute on function public.abrir_repasse_do_pedido(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 3. E "marcar como pago" também não passa
-- ----------------------------------------------------------------------------
-- A tela marca com um update direto em `orders`, não por função — então a
-- trava tem que morar no próprio update, senão bastaria pular o passo do PIX.
--
-- Só barra quem está marcando o PRÓPRIO pedido. O fornecedor confirmando o
-- recebimento e o admin acertando um caso passam: a pendência é do vendedor,
-- e travar os outros dois deixaria dinheiro já pago sem registro.

create or replace function public.barra_pagamento_com_pendencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pendencia jsonb;
begin
  if new.pago_ao_fornecedor_em is null
     or old.pago_ao_fornecedor_em is not null
     or auth.uid() is distinct from new.user_id then
    return new;
  end if;

  v_pendencia := public.pendencia_de_remetente(new.user_id);

  if (v_pendencia->>'tem')::boolean then
    raise exception 'Sua conta está com o remetente pendente. Corrija o endereço de remetente no Mercado Livre antes de pagar — enquanto isso a etiqueta fica presa e o fornecedor não consegue despachar.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists barra_pagamento_com_pendencia on public.orders;

create trigger barra_pagamento_com_pendencia
  before update on public.orders
  for each row
  execute function public.barra_pagamento_com_pendencia();

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Quantas contas estão travadas agora (esperado: 13 a 16):
-- select count(*) from (
--   select distinct o.user_id
--   from public.orders o
--   where (public.pendencia_de_remetente(o.user_id)->>'tem')::boolean
-- ) x;

-- (b) A sua própria conta, entrando como vendedor:
-- select public.minha_pendencia_de_remetente();

-- (c) Os pedidos que continuam barrados, já com nome e cidade:
-- select * from public.admin_pedidos_travados_no_remetente();
