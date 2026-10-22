-- ============================================================================
-- Marcador de resposta não lida
--
-- PROBLEMA
-- A conversa funciona, mas ninguém é avisado. O fornecedor precisa abrir o
-- chamado para descobrir que foi respondido, e o vendedor idem. Na prática a
-- resposta pode ficar dias parada.
--
-- SOLUÇÃO
-- Guardar, por chamado, quando cada lado leu pela última vez. O que veio
-- depois disso é não lido.
--
-- Guardar um instante por chamado, em vez de marcar mensagem por mensagem,
-- custa uma linha de update por abertura em vez de N.
-- ============================================================================

begin;

alter table public.tickets
  add column if not exists lido_vendedor_em timestamptz,
  add column if not exists lido_fornecedor_em timestamptz;

comment on column public.tickets.lido_vendedor_em is
  'Quando o vendedor abriu a conversa pela última vez. Mensagens do fornecedor posteriores a isto contam como não lidas.';

comment on column public.tickets.lido_fornecedor_em is
  'Quando o fornecedor abriu a conversa pela última vez.';

-- ----------------------------------------------------------------------------
-- Marcar como lido
--
-- Uma função só para os dois lados: ela descobre quem está chamando e escreve
-- na coluna certa.
--
-- Precisa ser security definer também para o vendedor: `tickets` não tem
-- policy de UPDATE para usuário comum, apenas para admin. Sem isto, vendedor
-- não admin não conseguiria nem marcar a própria leitura.
-- ----------------------------------------------------------------------------
create or replace function public.marcar_chamado_lido(p_chamado_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_supplier_id uuid;
begin
  v_supplier_id := public.current_supplier_id();

  if v_supplier_id is not null then
    update public.tickets
    set lido_fornecedor_em = now()
    where id = p_chamado_id
      and supplier_id = v_supplier_id;

    return;
  end if;

  -- Vendedor dono do chamado, ou admin.
  update public.tickets t
  set lido_vendedor_em = now()
  where t.id = p_chamado_id
    and (
      t.user_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    );
end;
$$;

comment on function public.marcar_chamado_lido(uuid) is
  'Registra a leitura da conversa no lado de quem chamou. Serve para vendedor, admin e fornecedor.';

revoke all on function public.marcar_chamado_lido(uuid) from public;
grant execute on function public.marcar_chamado_lido(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- O portal conta as respostas não lidas
--
-- Vai na view para não custar consulta extra ao portal, que já relê os pedidos
-- a cada 45 segundos.
-- ----------------------------------------------------------------------------
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

commit;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) A view ganhou respostas_nao_lidas?
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'pedidos_do_fornecedor'
-- order by ordinal_position;

-- (b) Situação de leitura por chamado
-- select t.subject, t.lido_vendedor_em, t.lido_fornecedor_em,
--        (select count(*) from public.ticket_messages m
--          where m.ticket_id = t.id and m.autor = 'fornecedor'
--            and m.created_at > coalesce(t.lido_vendedor_em, 'epoch'::timestamptz)
--        ) as nao_lidas_pelo_vendedor
-- from public.tickets t
-- order by t.created_at desc;
