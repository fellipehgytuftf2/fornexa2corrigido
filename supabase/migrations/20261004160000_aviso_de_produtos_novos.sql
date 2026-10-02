-- Produto novo no catálogo avisa quem assina.
--
-- POR QUE
--
-- O catálogo cresce toda semana e ninguém fica sabendo. Quem assina só
-- descobre produto novo se abrir a tela e reparar — e quem abre a tela todo
-- dia é a minoria. Produto parado no catálogo não vira anúncio, e anúncio que
-- não existe não vende.
--
-- UM AVISO POR DIA, NÃO UM POR PRODUTO
--
-- A importação entra em lote: dez, trinta produtos de uma vez. Avisar por
-- produto seria trinta sinos no mesmo minuto, e o sino que toca demais deixa
-- de ser lido. A rodada soma tudo que entrou desde o último aviso e manda uma
-- linha só.
--
-- SÓ QUEM ASSINA
--
-- Decisão do dono. É aviso de oportunidade de venda, e vai para quem tem como
-- aproveitá-la hoje: `plan_status = 'ativo'`.
--
-- QUEM AINDA NÃO LEU NÃO RECEBE DOIS
--
-- Se a pessoa não abriu o aviso de ontem, a rodada de hoje soma no mesmo
-- recado em vez de empilhar outro — mesmo cuidado da pausa por estoque. O
-- sino diz quantos produtos entraram desde a última vez que ela olhou, que é
-- a pergunta que ela tem.

create or replace function public.avisar_produtos_novos_do_catalogo()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marco timestamptz;
  v_novos integer;
  v_avisados integer := 0;
  r record;
begin
  -- Desde quando contar: o último aviso deste tipo. Na primeira rodada, o
  -- último dia — senão o primeiro aviso anunciaria o catálogo inteiro como
  -- novidade.
  select max(criado_em) into v_marco
  from public.avisos
  where tipo = 'catalogo-novidades';

  v_marco := coalesce(v_marco, now() - interval '1 day');

  select count(*) into v_novos
  from public.catalog_products p
  where p.created_at > v_marco
    and p.status = 'active';

  if coalesce(v_novos, 0) = 0 then
    return jsonb_build_object('ok', true, 'novos', 0);
  end if;

  for r in
    select u.id
    from auth.users u
    join public.profiles p on p.id = u.id
    where p.plan_status = 'ativo'
  loop
    -- Aviso ainda não lido desta pessoa: soma nele.
    update public.avisos a
    set quantidade = coalesce(a.quantidade, 0) + v_novos,
        titulo = format(
          '🆕 %s produtos novos no catálogo',
          coalesce(a.quantidade, 0) + v_novos
        ),
        criado_em = now()
    where a.alvo_user_id = r.id
      and a.tipo = 'catalogo-novidades'
      and not exists (
        select 1 from public.avisos_lidos l
        where l.aviso_id = a.id and l.user_id = r.id
      );

    if not found then
      insert into public.avisos (
        titulo, corpo, link_rotulo, link_para, alvo_user_id, tipo, quantidade
      )
      values (
        format('🆕 %s produtos novos no catálogo', v_novos),
        'Entraram produtos novos desde a última vez que você olhou. O catálogo já abre pelos mais recentes.',
        'Ver no catálogo', '/dashboard/catalog',
        r.id, 'catalogo-novidades', v_novos
      );
    end if;

    v_avisados := v_avisados + 1;
  end loop;

  insert into public.log_integracao_ml (contexto, mensagem, detalhes)
  values (
    'catalogo-novidades',
    format('%s produtos novos avisados a %s assinantes.', v_novos, v_avisados),
    jsonb_build_object('novos', v_novos, 'avisados', v_avisados, 'desde', v_marco)
  );

  return jsonb_build_object('ok', true, 'novos', v_novos, 'avisados', v_avisados);
end;
$$;

-- Ninguém chama isto de fora: quem chama é o agendador, com os poderes do
-- banco. Vendedor disparando a rodada criaria aviso para a base inteira.
revoke all on function public.avisar_produtos_novos_do_catalogo() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- O agendamento
-- ----------------------------------------------------------------------------
-- Dentro do banco, sem HTTP: não precisa de Edge Function, de chave, nem de
-- rede. Uma peça a menos para falhar calada.

create extension if not exists pg_cron;

-- Agendar com um nome que já existe só substitui.
select cron.schedule(
  'avisar-produtos-novos-do-catalogo',
  -- 12:00 UTC, 09:00 em Brasília: começo do dia de quem vende, e depois das
  -- importações da madrugada.
  '0 12 * * *',
  $$ select public.avisar_produtos_novos_do_catalogo(); $$
);


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Rodar na mão agora, para ver o que ela faria:
-- select public.avisar_produtos_novos_do_catalogo();

-- (b) Quantos assinantes receberiam:
-- select count(*) from public.profiles where plan_status = 'ativo';

-- (c) O que entrou no catálogo nas últimas 24h:
-- select count(*) from public.catalog_products
-- where created_at > now() - interval '1 day' and status = 'active';

-- (d) O agendamento está de pé:
-- select jobname, schedule, active from cron.job
-- where jobname = 'avisar-produtos-novos-do-catalogo';
