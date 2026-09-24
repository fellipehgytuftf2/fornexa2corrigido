-- O admin passa a ver o aviso de chamado não lido.
--
-- O QUE ESTAVA ACONTECENDO
--
-- `chamados_nao_lidos()` — a função que acende o número vermelho no menu
-- "Chamados" — conta só o que é do próprio usuário:
--
--   where t.user_id = auth.uid()
--
-- Na tela de Chamados o admin enxerga TODOS os chamados (policy "Admins can
-- manage all tickets"), e na prática é ele quem responde o fornecedor. Mas o
-- contador olhava só os chamados abertos na conta dele — que são zero. O menu
-- nunca acendia para quem mais precisava do aviso.
--
-- A CORREÇÃO
--
-- Para admin, contar o mesmo que se conta para o vendedor, só que em todos os
-- chamados: resposta do fornecedor mais abertura de chamado, sempre o que veio
-- depois de `lido_vendedor_em`. Para o resto, nada muda.
--
-- `marcar_chamado_lido` já escreve em `lido_vendedor_em` quando quem abre é
-- admin, então abrir a conversa apaga o aviso dos dois — que é o certo: quem
-- respondeu foi o suporte, em nome do vendedor.

create or replace function public.chamados_nao_lidos()
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_respostas integer;
  v_aberturas integer;
  v_admin boolean;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) into v_admin;

  -- Respostas do fornecedor dentro de uma conversa já aberta.
  select count(*)
  into v_respostas
  from public.ticket_messages m
  join public.tickets t on t.id = m.ticket_id
  where (v_admin or t.user_id = auth.uid())
    and m.autor = 'fornecedor'
    and m.created_at > coalesce(t.lido_vendedor_em, 'epoch'::timestamptz);

  -- A abertura do chamado. Mora em `tickets.message`, e era o buraco: sem
  -- esta parte, o aviso de que existe um problema nunca chegava.
  -- `supplier_id is not null` separa o que o fornecedor abriu do que o
  -- próprio vendedor abriu para o suporte — esse ele já sabe que existe.
  select count(*)
  into v_aberturas
  from public.tickets t
  where (v_admin or t.user_id = auth.uid())
    and t.supplier_id is not null
    and t.created_at > coalesce(t.lido_vendedor_em, 'epoch'::timestamptz);

  return coalesce(v_respostas, 0) + coalesce(v_aberturas, 0);
end;
$function$;

comment on function public.chamados_nao_lidos() is
  'Quantos avisos de chamado ainda não lidos: resposta do fornecedor mais a abertura do chamado (que mora em tickets.message). Vendedor vê os próprios; admin vê os de todo mundo — ver migrações 20260923020000 e 20260923190000.';

-- ============================================================================
-- VERIFICAÇÃO — rode depois e confira
-- ============================================================================

-- (a) O que o admin deve passar a ver no menu.
-- select
--   (select count(*) from public.ticket_messages m
--      join public.tickets t on t.id = m.ticket_id
--     where m.autor = 'fornecedor'
--       and m.created_at > coalesce(t.lido_vendedor_em, 'epoch'::timestamptz))
--   +
--   (select count(*) from public.tickets t
--     where t.supplier_id is not null
--       and t.created_at > coalesce(t.lido_vendedor_em, 'epoch'::timestamptz))
--   as aviso_do_admin;

-- (b) Entrando com a própria conta, o número do menu:
-- select public.chamados_nao_lidos();
