-- ============================================================================
-- Conversa dentro do chamado
--
-- PROBLEMA
-- O fornecedor relatava um problema e ficava no escuro: via o selo sumir
-- quando o vendedor resolvia, sem saber o que foi decidido. E o vendedor lia
-- o relato sem ter como responder pelo sistema.
--
-- SOLUÇÃO
-- Uma tabela de mensagens ligada ao chamado, com os dois lados escrevendo.
--
-- O fornecedor continua sem permissão direta em `tickets` e em
-- `ticket_messages`, mesmo princípio de `orders`: lê por view e escreve por
-- função. O vendedor e o admin usam a tabela direto, limitados por RLS.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Mensagens
--
-- Quem escreveu fica registrado de duas formas, porque são naturezas
-- diferentes: vendedor e admin têm conta de usuário; fornecedor é identificado
-- pelo cadastro. `autor` diz qual dos dois ler.
-- ----------------------------------------------------------------------------
create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  autor text not null check (autor in ('vendedor', 'fornecedor')),
  autor_user_id uuid references auth.users (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  corpo text not null check (length(btrim(corpo)) >= 1),
  created_at timestamptz not null default now()
);

comment on table public.ticket_messages is
  'Mensagens trocadas dentro de um chamado, entre vendedor e fornecedor.';

create index if not exists ticket_messages_ticket_id_idx
  on public.ticket_messages (ticket_id, created_at);

alter table public.ticket_messages enable row level security;

grant select, insert on table public.ticket_messages to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Acesso do vendedor e do admin
--
-- A subconsulta em `tickets` herda a RLS daquela tabela, então cada um só
-- alcança as mensagens dos chamados que já enxerga. Admin enxerga todos pela
-- policy "Admins can manage all tickets".
-- ----------------------------------------------------------------------------
drop policy if exists "vendedor_le_mensagens_dos_proprios_chamados" on public.ticket_messages;

create policy "vendedor_le_mensagens_dos_proprios_chamados"
  on public.ticket_messages
  for select
  to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id));

drop policy if exists "vendedor_escreve_nos_proprios_chamados" on public.ticket_messages;

create policy "vendedor_escreve_nos_proprios_chamados"
  on public.ticket_messages
  for insert
  to authenticated
  with check (
    autor = 'vendedor'
    and autor_user_id = auth.uid()
    and exists (select 1 from public.tickets t where t.id = ticket_id)
  );

-- ----------------------------------------------------------------------------
-- 3. Leitura do fornecedor
--
-- Só as mensagens dos chamados que ele abriu. Não expõe `user_id` do vendedor
-- nem nada além do texto e de quem falou.
-- ----------------------------------------------------------------------------
drop view if exists public.mensagens_do_fornecedor;

create view public.mensagens_do_fornecedor
with (security_invoker = false) as
select
  m.id,
  m.ticket_id,
  m.autor,
  m.corpo,
  m.created_at
from public.ticket_messages m
join public.tickets t on t.id = m.ticket_id
where t.supplier_id = public.current_supplier_id();

comment on view public.mensagens_do_fornecedor is
  'Mensagens dos chamados abertos pelo fornecedor logado. Única porta de leitura da conversa no Portal.';

revoke all on public.mensagens_do_fornecedor from anon;
grant select on public.mensagens_do_fornecedor to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Escrita do fornecedor
--
-- Responder reabre o chamado: se o vendedor tinha dado como resolvido e o
-- fornecedor volta a falar, o assunto não está resolvido.
-- ----------------------------------------------------------------------------
create or replace function public.fornecedor_responde_chamado(
  p_chamado_id uuid,
  p_mensagem text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_supplier_id uuid;
  v_ticket_id uuid;
begin
  v_supplier_id := public.current_supplier_id();

  if v_supplier_id is null then
    raise exception 'Apenas fornecedores podem responder por aqui.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_mensagem is null or length(btrim(p_mensagem)) < 2 then
    raise exception 'Escreva sua mensagem.'
      using errcode = 'check_violation';
  end if;

  select t.id into v_ticket_id
  from public.tickets t
  where t.id = p_chamado_id
    and t.supplier_id = v_supplier_id;

  if v_ticket_id is null then
    raise exception 'Chamado não encontrado para este fornecedor.'
      using errcode = 'no_data_found';
  end if;

  insert into public.ticket_messages (ticket_id, autor, supplier_id, corpo)
  values (v_ticket_id, 'fornecedor', v_supplier_id, btrim(p_mensagem));

  update public.tickets
  set status = 'open'
  where id = v_ticket_id
    and status in ('resolved', 'closed');
end;
$$;

revoke all on function public.fornecedor_responde_chamado(uuid, text) from public;
grant execute on function public.fornecedor_responde_chamado(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. A view de pedidos passa a apontar o chamado
--
-- Sem o id, o portal não teria como abrir a conversa. Vem o mais recente
-- daquele pedido, resolvido ou não, para o fornecedor poder reler o que foi
-- combinado depois de encerrado.
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

  (
    select t.id from public.tickets t
    where t.order_id = o.id
      and t.supplier_id = o.supplier_id
    order by t.created_at desc
    limit 1
  ) as chamado_id

from public.orders o
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

-- (a) A tabela e as policies existem?
-- select policyname, cmd from pg_policies
-- where schemaname = 'public' and tablename = 'ticket_messages';

-- (b) A view de pedidos ganhou chamado_id?
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'pedidos_do_fornecedor'
-- order by ordinal_position;

-- (c) Conversas por chamado
-- select t.subject, m.autor, m.corpo, m.created_at
-- from public.ticket_messages m
-- join public.tickets t on t.id = m.ticket_id
-- order by t.created_at desc, m.created_at;
