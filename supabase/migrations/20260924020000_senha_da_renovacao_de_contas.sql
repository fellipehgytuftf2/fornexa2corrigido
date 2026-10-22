-- A senha da rotina que levanta as contas do Mercado Livre caídas.
--
-- POR QUE A ROTINA EXISTE
--
-- Levantamento de 24/09/2026:
--
--   232 conexões conectadas
--   112 marcadas como caídas
--    27 dessas nunca completaram o OAuth (sem token, `external_account_id`
--       vazio) — nunca estiveram conectadas
--    85 têm refresh token guardado e poderiam voltar sozinhas
--
-- Ninguém tentava. A renovação só roda quando o vendedor mexe no sistema:
-- publica, abre a tela, recebe webhook. Quem não entra, fica caído — e conta
-- caída não recebe pedido, não publica e não deixa o FORNEXA pausar anúncio
-- sem estoque. Dos 170 anúncios que falharam ao pausar, 67 falharam com
-- "Conta do Mercado Livre desconectada".
--
-- A FUNÇÃO
--
-- `ml-renovar-caidas`, chamada por POST com a senha abaixo no cabeçalho
-- `x-segredo` — mesmo desenho de `ml-pausar-sem-estoque`, que não pede login
-- de usuário. O agendamento fica fora daqui, de propósito: é o mesmo lugar
-- onde a pausa já é disparada.

insert into public.segredos_internos (nome, valor)
values (
  'renovar-caidas',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
on conflict (nome) do nothing;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) A senha, para configurar o agendamento:
-- select valor from public.segredos_internos where nome = 'renovar-caidas';

-- (b) Quantas contas a rotina tem para tentar hoje:
-- select count(*) from public.ml_connections
-- where status = 'disconnected'
--   and refresh_token is not null and refresh_token <> '';

-- (c) Depois de rodar, o resultado de cada rodada:
-- select criado_em, mensagem, detalhes from public.log_integracao_ml
-- where contexto = 'ml-renovar-caidas' order by criado_em desc limit 10;
