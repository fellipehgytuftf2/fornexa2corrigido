-- O vendedor passa a ser avisado quando o fornecedor relata um problema.
--
-- O QUE ESTAVA ACONTECENDO
--
-- O sininho do vendedor conta chamados não lidos com `chamados_nao_lidos()`,
-- e ela olhava só a tabela `ticket_messages`:
--
--   where t.user_id = auth.uid()
--     and m.autor = 'fornecedor'
--     and m.created_at > coalesce(t.lido_vendedor_em, 'epoch')
--
-- Só que quem ABRE o chamado é `fornecedor_relata_problema`, e essa função
-- grava a mensagem em `tickets.message` — não em `ticket_messages`. Resultado:
-- a primeira mensagem, justamente a que diz "tem um problema no seu pedido",
-- era a única que o contador nunca enxergava. O vendedor só era avisado a
-- partir da SEGUNDA mensagem do fornecedor, que quase nunca vem, porque ele
-- está esperando resposta.
--
-- Levantamento em 23/09/2026:
--
--   52 chamados abertos pelo fornecedor
--   35 deles sem nenhuma linha em ticket_messages -> invisíveis
--   todos com status 'open' e lido_vendedor_em nulo; o mais antigo de 15/09
--
--   13 vendedores com o sininho aceso
--   28 vendedores com problema relatado esperando resposta
--
-- Ou seja: 15 vendedores com pedido travado e nenhum aviso.
--
-- A CORREÇÃO
--
-- Contar também a abertura do chamado. Não mexemos em
-- `fornecedor_relata_problema` para inserir em `ticket_messages` de propósito:
-- a tela do vendedor já mostra `tickets.message` como primeira mensagem da
-- conversa, e duplicar a linha faria o texto aparecer duas vezes.
--
-- A ponta contrária — vendedor responde e o fornecedor precisa saber — já
-- funciona: a view `pedidos_do_fornecedor` calcula `respostas_nao_lidas` e o
-- Portal do Fornecedor já mostra o número no cartão do pedido.

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
begin
  if auth.uid() is null then
    return 0;
  end if;

  -- Respostas do fornecedor dentro de uma conversa já aberta.
  select count(*)
  into v_respostas
  from public.ticket_messages m
  join public.tickets t on t.id = m.ticket_id
  where t.user_id = auth.uid()
    and m.autor = 'fornecedor'
    and m.created_at > coalesce(t.lido_vendedor_em, 'epoch'::timestamptz);

  -- A abertura do chamado. Mora em `tickets.message`, e era o buraco: sem
  -- esta parte, o aviso de que existe um problema nunca chegava.
  -- `supplier_id is not null` separa o que o fornecedor abriu do que o
  -- próprio vendedor abriu para o suporte — esse ele já sabe que existe.
  select count(*)
  into v_aberturas
  from public.tickets t
  where t.user_id = auth.uid()
    and t.supplier_id is not null
    and t.created_at > coalesce(t.lido_vendedor_em, 'epoch'::timestamptz);

  return coalesce(v_respostas, 0) + coalesce(v_aberturas, 0);
end;
$function$;

comment on function public.chamados_nao_lidos() is
  'Quantos avisos de chamado o vendedor logado ainda não leu: respostas do fornecedor MAIS a abertura do chamado, que mora em tickets.message — ver migração 20260923020000.';


-- ============================================================================
-- VERIFICAÇÃO — rode depois e confira os resultados
-- ============================================================================

-- (a) Quantos vendedores passam a ter o sininho aceso. Antes: 13. Esperado: 28.
-- select count(distinct alvo) as vendedores_avisados from (
--   select t.user_id as alvo
--   from public.ticket_messages m join public.tickets t on t.id = m.ticket_id
--   where m.autor = 'fornecedor'
--     and m.created_at > coalesce(t.lido_vendedor_em, 'epoch'::timestamptz)
--   union
--   select t.user_id
--   from public.tickets t
--   where t.supplier_id is not null
--     and t.created_at > coalesce(t.lido_vendedor_em, 'epoch'::timestamptz)
-- ) x;

-- (b) Os 35 chamados que estavam invisíveis agora contam.
-- select count(*) as aberturas_nao_lidas
-- from public.tickets t
-- where t.supplier_id is not null
--   and t.created_at > coalesce(t.lido_vendedor_em, 'epoch'::timestamptz);
