-- Devolução só depois de ENVIADO, e não depois de etiqueta impressa.
--
-- O QUE ELE RELATOU
--
-- "Cancelados: foram todos p devolução — Devolução só após enviado. Ou seja,
-- quando um pedido vai p status enviado e for cancelado ele vira devolução
-- pois já foi despachado."
--
-- MEU ERRO
--
-- Usei `tracking_code` como sinal de "já saiu". Não é: o Mercado Livre entrega
-- o número de rastreio junto com a etiqueta, antes de o pacote existir. Então
-- cancelamento de mercadoria que nunca deixou a prateleira — o caso mais
-- comum, e o que não dá trabalho nenhum — foi tratado como pacote voltando. A
-- aba Cancelados esvaziou dentro de Devoluções, que é exatamente o contrário
-- do que a separação servia para fazer.
--
-- O SINAL CERTO
--
-- `orders.status = 'shipped'` (ou 'delivered'): é o carimbo que o próprio
-- fornecedor dá quando despacha, e o que o Mercado Livre confirma na entrega.
-- Antes disso não há pacote na rua, logo não há nada voltando.
--
-- O QUE ESTA MIGRAÇÃO DESFAZ
--
-- Só o que a carga anterior criou e ninguém tocou: devolução ainda "avisada",
-- sem código de autorização, sem tentativa de motorista, sem observação e sem
-- recebimento. Devolução em que alguém já trabalhou fica onde está, mesmo que
-- tenha nascido pela régua errada — apagar trabalho feito é pior que uma linha
-- a mais na lista.

delete from public.devolucoes d
using public.orders o
where o.id = d.order_id
  and o.status not in ('shipped', 'delivered')
  and d.status = 'avisada'
  and d.codigo_autorizacao is null
  and coalesce(d.tentativas, 0) = 0
  and d.recebida_em is null
  and d.observacao_fornecedor is null
  and d.codigo_devolucao is null;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Devoluções que sobraram, por situação do pedido. Nenhuma deve estar em
--     pedido que nunca foi despachado, fora as que alguém já mexeu:
-- select o.status, count(*)
-- from public.devolucoes d
-- join public.orders o on o.id = d.order_id
-- group by o.status
-- order by 2 desc;

-- (b) Cancelados que voltaram para a aba Cancelados:
-- select count(*) from public.orders o
-- where o.ml_order_status = 'cancelled'
--   and o.status not in ('shipped', 'delivered')
--   and not exists (select 1 from public.devolucoes d where d.order_id = o.id);
