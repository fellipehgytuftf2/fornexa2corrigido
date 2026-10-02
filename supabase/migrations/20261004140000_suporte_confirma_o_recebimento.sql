-- O suporte confirma na hora que recebeu.
--
-- POR QUE
--
-- Quem escreve para o suporte manda a mensagem e fica olhando para uma tela
-- parada, sem saber se chegou. O silêncio tem duas leituras — "estão vendo" e
-- "sumiu" — e a segunda faz a pessoa reenviar, abrir outro caminho, ou
-- concluir que não tem com quem falar.
--
-- A confirmação automática fecha essa dúvida no mesmo instante, e não promete
-- prazo que ninguém garantiu: diz que a equipe vai responder, não quando.
--
-- SÓ NA PRIMEIRA MENSAGEM
--
-- A conversa de suporte é uma por conta, e dura para sempre. Confirmar a cada
-- mensagem encheria o fio de robô entre duas falas de gente — e quem já está
-- no meio de uma conversa não tem a dúvida que isto resolve.
--
-- O SINO NÃO ACENDE
--
-- O não lido do usuário compara a data da mensagem do suporte com a última
-- leitura dele. Como a confirmação nasce dentro da mesma transação do envio —
-- e o envio marca a conversa como lida por ele — as duas datas são iguais, e
-- iguais não contam como não lidas. Ele vê a resposta na tela aberta, sem
-- bolinha dizendo depois que "o suporte respondeu" uma coisa que robô
-- escreveu.
--
-- A FILA DO ADMIN NÃO MENTE
--
-- `aguardando` compara a última mensagem com a última leitura do SUPORTE, que
-- a confirmação não toca. A conversa continua marcada como esperando resposta
-- de gente, que é o que ela é.

create or replace function public.suporte_confirma_recebimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Robô não responde a robô.
  if new.autor <> 'usuario' then
    return new;
  end if;

  -- Primeira mensagem da conversa: a que acabou de entrar é a única do
  -- usuário até agora.
  if (
    select count(*)
    from public.suporte_mensagens m
    where m.conversa_id = new.conversa_id
      and m.autor = 'usuario'
  ) <> 1 then
    return new;
  end if;

  -- `clock_timestamp()` e não `now()`: dentro de uma transação, `now()` é o
  -- mesmo valor para todas as linhas, e as duas mensagens nasceriam com a
  -- mesma data. A conversa é ordenada por data — empatadas, elas podiam
  -- aparecer trocadas, com a resposta antes da pergunta.
  insert into public.suporte_mensagens (conversa_id, autor, corpo, created_at)
  values (
    new.conversa_id,
    'suporte',
    'Recebemos sua mensagem! Em instantes a equipe FORNEXA vai responder.',
    clock_timestamp()
  );

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- O envio marca a leitura DEPOIS da confirmação
-- ----------------------------------------------------------------------------
-- A conversa passa a ser marcada como lida com `clock_timestamp()`, que corre
-- durante a transação. Como a confirmação nasce antes desta linha, a leitura
-- fica depois dela — e o sino não acende para avisar de uma resposta que a
-- pessoa está vendo na tela, escrita por robô.

create or replace function public.enviar_mensagem_de_suporte(
  p_corpo text,
  p_imagem_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversa uuid;
begin
  v_conversa := public.minha_conversa_de_suporte();

  if coalesce(btrim(p_corpo), '') = '' and coalesce(btrim(p_imagem_path), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Escreva algo ou anexe uma imagem.');
  end if;

  insert into public.suporte_mensagens (conversa_id, autor, autor_user_id, corpo, imagem_path)
  values (v_conversa, 'usuario', auth.uid(), nullif(btrim(p_corpo), ''), nullif(btrim(p_imagem_path), ''));

  update public.suporte_conversas
  set ultima_mensagem_em = clock_timestamp(),
      lida_usuario_em = clock_timestamp()
  where id = v_conversa;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.enviar_mensagem_de_suporte(text, text) to authenticated;


drop trigger if exists confirmar_recebimento_no_suporte on public.suporte_mensagens;

create trigger confirmar_recebimento_no_suporte
  after insert on public.suporte_mensagens
  for each row
  execute function public.suporte_confirma_recebimento();


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Conversas que receberam a confirmação:
-- select count(*) from public.suporte_mensagens
-- where autor = 'suporte'
--   and corpo like 'Recebemos sua mensagem!%';

-- (b) Nenhuma conversa com duas confirmações (tem de dar 0):
-- select conversa_id, count(*)
-- from public.suporte_mensagens
-- where corpo like 'Recebemos sua mensagem!%'
-- group by conversa_id
-- having count(*) > 1;
