-- O agendamento da rotina que levanta as contas do Mercado Livre caídas.
--
-- POR QUE DENTRO DO BANCO
--
-- A `ml-pausar-sem-estoque` é disparada por um agendador de fora, e a senha
-- dela vive numa configuração que não está em lugar nenhum do repositório.
-- Para a renovação isso seria mais uma peça solta: some o agendador, some a
-- rotina, e ninguém percebe até as contas caírem de novo.
--
-- Com `pg_cron` o agendamento nasce no mesmo banco que guarda a senha, aparece
-- em `cron.job` e o resultado de cada disparo fica em `cron.job_run_details`.
--
-- A SENHA NÃO ENTRA NESTE ARQUIVO
--
-- Ela é lida de `segredos_internos` na hora do disparo. Arquivo de migração vai
-- para o GitHub; senha escrita aqui seria senha publicada.
--
-- O QUE A RODADA FAZ (medido em 24/09/2026)
--
-- Duas rodadas de 37s devolveram 88 contas ao ar — de 232 conectadas para 316.
-- Sobraram 28 caídas: 26 que nunca completaram o OAuth e 2 com refresh token
-- vencido de verdade, que só reconectando.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Roda de novo sem duplicar: agendar com um nome que já existe só substitui.
select cron.schedule(
  'renovar-contas-do-mercado-livre',
  -- 08:00 UTC, 05:00 em Brasília. Antes do movimento do dia, para a conta que
  -- voltou já receber pedido e deixar o FORNEXA pausar anúncio sem estoque.
  '0 8 * * *',
  $$
    select net.http_post(
      url := 'https://qsldlfuajwkmelrbpern.functions.supabase.co/ml-renovar-caidas',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-segredo', (
          select valor from public.segredos_internos where nome = 'renovar-caidas'
        )
      ),
      body := '{}'::jsonb,
      -- A rodada leva uns 40s. O padrão de 5s cortaria a resposta no meio.
      timeout_milliseconds := 90000
    );
  $$
);

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) O agendamento existe e está ativo:
-- select jobid, schedule, jobname, active from cron.job
-- where jobname = 'renovar-contas-do-mercado-livre';

-- (b) Os últimos disparos (depois da primeira madrugada):
-- select start_time, status, return_message from cron.job_run_details
-- where jobid = (select jobid from cron.job where jobname = 'renovar-contas-do-mercado-livre')
-- order by start_time desc limit 10;

-- (c) O resultado de cada rodada, com quantas contas voltaram:
-- select criado_em, mensagem, detalhes from public.log_integracao_ml
-- where contexto = 'ml-renovar-caidas' order by criado_em desc limit 10;

-- (d) Para desligar, se um dia precisar:
-- select cron.unschedule('renovar-contas-do-mercado-livre');
