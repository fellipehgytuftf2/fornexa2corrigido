-- Cobrar o código do dia de quem tem devolução esperando.
--
-- POR QUE
--
-- O vendedor é avisado uma vez, quando a devolução abre. Depois disso o
-- sistema cala — e o motorista pode aparecer na portaria do fornecedor em
-- qualquer dia dos que vêm. Sem o código do dia, ele vai embora; na segunda
-- tentativa o Mercado Livre encerra e o produto se perde.
--
-- Foi assim que as duas devoluções do Furador de Coco se perderam: ninguém
-- cobrou o código nos dias em que o motorista apareceu.
--
-- O aviso de hoje é o único momento em que a cobrança serve: código de ontem
-- não libera motorista nenhum.
--
-- POR QUE NÃO AVISAR TODO MUNDO
--
-- Só quem tem devolução esperando chegar. Para quem não tem, a cobrança seria
-- barulho sobre coisa que não existe — e sino que toca à toa deixa de ser
-- lido justamente no dia em que importa.

create or replace function public.cobrar_codigo_do_dia()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date;
  v_cobrados integer := 0;
  r record;
begin
  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;

  for r in
    select
      d.user_id,
      count(*) as esperando
    from public.devolucoes d
    where d.status = 'avisada'
      -- Já informou o código de hoje: não há o que cobrar.
      and not exists (
        select 1 from public.codigos_de_devolucao c
        where c.user_id = d.user_id and c.dia = v_hoje
      )
    group by d.user_id
  loop
    -- Aviso do dia anterior ainda não lido vira o de hoje, em vez de empilhar.
    -- Quem não abriu ontem não precisa de dois na caixa; precisa de um que
    -- esteja certo.
    update public.avisos a
    set titulo = case
          when r.esperando = 1 then 'Mande o código de devolução de hoje'
          else format('Mande o código de devolução de hoje (%s devoluções esperando)', r.esperando)
        end,
        quantidade = r.esperando,
        criado_em = now()
    where a.alvo_user_id = r.user_id
      and a.tipo = 'codigo-do-dia-faltando'
      and not exists (
        select 1 from public.avisos_lidos l
        where l.aviso_id = a.id and l.user_id = r.user_id
      );

    if not found then
      insert into public.avisos (
        titulo, corpo, link_rotulo, link_para, alvo_user_id, tipo, quantidade
      )
      values (
        case
          when r.esperando = 1 then 'Mande o código de devolução de hoje'
          else format('Mande o código de devolução de hoje (%s devoluções esperando)', r.esperando)
        end,
        'O Mercado Livre gera um código por dia, e é ele que libera o motorista na portaria do fornecedor. Sem o código de hoje, o motorista vai embora com o seu produto — e na segunda tentativa ele se perde.' ||
          E'\n\n' ||
          'Um código só vale para todas as suas devoluções de hoje. Cole em Pedidos → Devoluções assim que receber.',
        'Informar o código', '/dashboard/orders',
        r.user_id, 'codigo-do-dia-faltando', r.esperando
      );
    end if;

    v_cobrados := v_cobrados + 1;
  end loop;

  if v_cobrados > 0 then
    insert into public.log_integracao_ml (contexto, mensagem, detalhes)
    values (
      'cobrar-codigo-do-dia',
      format('%s vendedor(es) cobrados pelo código de hoje.', v_cobrados),
      jsonb_build_object('cobrados', v_cobrados, 'dia', v_hoje)
    );
  end if;

  return jsonb_build_object('ok', true, 'cobrados', v_cobrados);
end;
$$;

revoke all on function public.cobrar_codigo_do_dia() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- Todo dia de manhã
-- ----------------------------------------------------------------------------
-- 11:00 UTC são 08:00 em Brasília: antes de o primeiro motorista sair para a
-- rua, e dentro do horário em que o vendedor olha o celular.

create extension if not exists pg_cron;

select cron.schedule(
  'cobrar-codigo-do-dia',
  '0 11 * * *',
  $$ select public.cobrar_codigo_do_dia(); $$
);


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Quem seria cobrado agora:
-- select p.email, count(*) as esperando
-- from public.devolucoes d
-- join public.profiles p on p.id = d.user_id
-- where d.status = 'avisada'
--   and not exists (
--     select 1 from public.codigos_de_devolucao c
--     where c.user_id = d.user_id
--       and c.dia = (now() at time zone 'America/Sao_Paulo')::date
--   )
-- group by p.email;

-- (b) Rodar na mão, sem esperar amanhã:
-- select public.cobrar_codigo_do_dia();

-- (c) O agendamento está de pé:
-- select jobname, schedule, active from cron.job
-- where jobname = 'cobrar-codigo-do-dia';
