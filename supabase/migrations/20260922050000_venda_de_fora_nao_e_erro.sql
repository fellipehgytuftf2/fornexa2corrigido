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

-- `status` é o enum webhook_status (pendente, processado, erro). O valor novo
-- entra num comando separado de propósito: o Postgres não deixa usar um rótulo
-- de enum na mesma transação em que ele foi criado. Rode este primeiro,
-- sozinho, e só depois o update abaixo.
alter type public.webhook_status add value if not exists 'ignorado';


update public.webhook_events
   set status = 'ignorado'
 where status = 'erro'
   and erro_mensagem like 'Nenhum produto encontrado para ml_item_id %';


-- ============================================================================
-- VERIFICAÇÃO — rode depois e confira os resultados
-- ============================================================================

-- (a) Como ficou a distribuição. 'erro' precisa cair para a casa das centenas.
-- select status, count(*) from public.webhook_events group by 1 order by 2 desc;

-- (b) O que sobrou de erro de verdade, agrupado. É esta lista que merece
--     atenção de agora em diante.
-- select left(erro_mensagem, 70) as erro, count(*) as vezes, max(criado_em) as ultima
-- from public.webhook_events
-- where status = 'erro'
-- group by 1 order by 2 desc limit 10;
