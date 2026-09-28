-- Quem já vendeu ganha o selo agora, sem precisar vender de novo.
--
-- POR QUE
--
-- O gatilho da primeira venda só enxerga o que acontece daqui para frente.
-- Sem esta passada, quem construiu o faturamento do FORNEXA apareceria no
-- ranking sem selo nenhum — e a primeira pessoa a notar seria justamente a
-- que mais vendeu.
--
-- O faturamento histórico não precisa de migração: o ranking soma `orders` a
-- cada consulta, então essas contas já entram com os valores reais.
--
-- RODAR DE NOVO NÃO FAZ MAL
--
-- As duas tabelas têm chave composta por pessoa e selo. Uma segunda passada
-- não duplica nada, e não ressuscita comemoração que já foi vista.

do $$
declare
  v_com_selo integer;
  v_comemoracoes integer;
begin
  with quem_vendeu as (
    select distinct o.user_id
    from public.orders o
    where o.user_id is not null
      and public.venda_confirmada(o)
  ),
  liberados as (
    insert into public.conquistas_do_usuario (chave, user_id)
    select 'primeira-venda', q.user_id from quem_vendeu q
    on conflict do nothing
    returning user_id
  )
  select count(*) into v_com_selo from liberados;

  -- A comemoração entra para quem acabou de ganhar o selo E para quem já o
  -- tinha sem nunca ter visto a mensagem — o selo veio antes da mensagem
  -- existir, e a conquista sem aviso é uma conquista que ninguém percebeu.
  with pendentes as (
    insert into public.comemoracoes_pendentes (user_id, chave)
    select cu.user_id, 'primeira-venda'
    from public.conquistas_do_usuario cu
    where cu.chave = 'primeira-venda'
    on conflict do nothing
    returning user_id
  )
  select count(*) into v_comemoracoes from pendentes;

  insert into public.log_integracao_ml (contexto, mensagem, detalhes)
  values (
    'selo-primeira-venda',
    format('Selo liberado para %s conta(s); %s comemoração(ões) pendente(s).',
           v_com_selo, v_comemoracoes),
    jsonb_build_object('selos', v_com_selo, 'comemoracoes', v_comemoracoes)
  );
end;
$$;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- O que a passada fez:
-- select mensagem, detalhes from public.log_integracao_ml
-- where contexto = 'selo-primeira-venda' order by id desc limit 1;

-- Ninguém com selo sem venda confirmada (tem que voltar zero):
-- select count(*) from public.conquistas_do_usuario cu
-- where cu.chave = 'primeira-venda'
--   and not exists (
--     select 1 from public.orders o
--     where o.user_id = cu.user_id and public.venda_confirmada(o)
--   );
