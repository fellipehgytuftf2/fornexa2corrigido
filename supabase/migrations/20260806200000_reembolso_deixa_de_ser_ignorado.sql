-- Reembolso e chargeback voltam a ser processados.
--
-- O índice que garante idempotência do webhook era sobre
-- (gateway, referencia_externa), e `referencia_externa` guarda o
-- `transaction.id` da Applyfy.
--
-- Acontece que reembolso NÃO é uma transação nova: a Applyfy avisa o estorno
-- com o MESMO transaction.id do pagamento original, mudando só o `event`. Com
-- a chave sem o evento, o segundo aviso batia no índice único, a Edge Function
-- lia o erro 23505 como "aviso repetido, já processado" e devolvia 200 sem
-- fazer nada.
--
-- Resultado: quem pedia reembolso recebia o dinheiro de volta e continuava com
-- o acesso liberado. O mesmo valia para chargeback e cancelamento — só o
-- pagamento chegava ao sistema, porque era sempre o primeiro a chegar.
--
-- A chave passa a incluir o evento. Aviso repetido de verdade (mesma transação,
-- mesmo evento) continua sendo descartado, que era a proteção original.

drop index if exists public.pagamentos_referencia_unica;

create unique index if not exists pagamentos_referencia_unica
  on public.pagamentos (gateway, referencia_externa, evento)
  where referencia_externa is not null;

comment on index public.pagamentos_referencia_unica is
  'Idempotência do webhook. O evento entra na chave porque pagamento e estorno compartilham o mesmo id de transação.';
