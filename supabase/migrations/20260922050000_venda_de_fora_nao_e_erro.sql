-- Venda de anúncio que não é do FORNEXA deixa de contar como erro.
--
-- O QUE ESTAVA ACONTECENDO
--
-- Levantamento em 22/09/2026, na tabela webhook_events:
--
--   erro        18.535
--   processado   3.803
--   pendente        14
--
-- Dos 18.535 erros, 18.367 são a mesma linha:
--
--   "Nenhum produto encontrado para ml_item_id MLB..."
--
-- Cerca de 1.500 por dia, todo dia. É o Mercado Livre avisando de venda de
-- anúncio que não está em Meus Produtos — anúncio criado direto lá, ou de
-- antes do FORNEXA. Não é falha de processamento: o pedido simplesmente não é
-- daqui, e não há o que fazer com ele.
--
-- Custava dos dois lados. A tabela virou 83% ruído, e falha de verdade ficava
-- enterrada no meio dela. E a tela de Pedidos do vendedor, que lê justamente
-- os eventos com status 'erro', mostrava alarme vermelho mandando ele
-- "corrigir o motivo e sincronizar de novo" numa venda que nunca foi nossa.
--
-- O ml-webhook-receiver passou a gravar esse caso como 'ignorado'. Esta
-- migração acerta o que já está guardado.
--
-- A linha não é apagada: a mensagem continua lá, e o ml_item_id junto, para
-- quem quiser conferir de quem era o anúncio.

-- ============================================================================
-- PARTE 1 de 2 — rode este arquivo SOZINHO, e só depois o 20260922050001.
-- ============================================================================
--
-- Por que dois arquivos: o Postgres recusa usar um rótulo de enum na mesma
-- transação em que ele foi criado (erro 55P04, "New enum values must be
-- committed before they can be used"). O SQL Editor do Supabase roda o arquivo
-- inteiro numa transação só — então os dois comandos juntos falham, e a falha
-- desfaz até o `alter type`. Separados, cada um tem a sua transação.

alter type public.webhook_status add value if not exists 'ignorado';


-- ============================================================================
-- VERIFICAÇÃO — precisa listar os quatro valores antes de seguir para a parte 2
-- ============================================================================

-- select e.enumlabel
-- from pg_type t join pg_enum e on e.enumtypid = t.oid
-- where t.typname = 'webhook_status'
-- order by e.enumsortorder;
