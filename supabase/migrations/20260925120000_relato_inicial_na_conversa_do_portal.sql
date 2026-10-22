-- A primeira mensagem do chamado passa a aparecer no Portal do Fornecedor.
--
-- O QUE ELE RELATOU
--
-- "quando a gente faz contato o primeiro contato não aparece, começa aparecer
-- no segundo".
--
-- Está certo. Quem abre o chamado é `fornecedor_relata_problema`, e essa
-- função grava o texto em `tickets.message` — não em `ticket_messages`. A
-- conversa do Portal lê a view `mensagens_do_fornecedor`, que só enxerga
-- `ticket_messages`. Resultado: ele escrevia, a tela dizia "o vendedor ainda
-- não respondeu", e o que ele acabara de escrever não estava em lugar nenhum.
--
-- Do lado do vendedor isso nunca apareceu: a tela de Chamados mostra o relato
-- num bloco próprio, acima da conversa. Por isso o buraco durou.
--
-- A CORREÇÃO
--
-- A view devolve o relato como a primeira mensagem da conversa. O autor é
-- sempre 'fornecedor' porque a view já filtra os chamados dele — chamado de
-- suporte, sem `supplier_id`, não entra aqui.
--
-- Não se mexe em `fornecedor_relata_problema` para inserir uma linha em
-- `ticket_messages`: a tela do vendedor mostra `tickets.message` como primeira
-- mensagem, e duplicar a linha faria o mesmo texto aparecer duas vezes lá.

drop view if exists public.mensagens_do_fornecedor;

create view public.mensagens_do_fornecedor
with (security_invoker = false) as

-- O relato que abriu o chamado.
select
  t.id,
  t.id as ticket_id,
  'fornecedor'::text as autor,
  t.message as corpo,
  t.created_at
from public.tickets t
where t.supplier_id = public.current_supplier_id()
  and coalesce(btrim(t.message), '') <> ''

union all

-- E as respostas que vieram depois.
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
  'A conversa dos chamados abertos pelo fornecedor logado, começando pelo relato que abriu o chamado. Única porta de leitura da conversa no Portal.';

revoke all on public.mensagens_do_fornecedor from anon;
grant select on public.mensagens_do_fornecedor to authenticated;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Entrando como fornecedor, a conversa de um chamado agora começa no
--     relato:
-- select autor, corpo, created_at from public.mensagens_do_fornecedor
-- where ticket_id = '<id do chamado>' order by created_at;

-- (b) Quantos chamados tinham o relato invisível (todos os que não têm
--     nenhuma linha em ticket_messages):
-- select count(*) from public.tickets t
-- where t.supplier_id is not null
--   and not exists (select 1 from public.ticket_messages m where m.ticket_id = t.id);
