-- ============================================================================
-- O histórico passa a cobrir a área de afiliados, e a dizer quem agiu
-- ============================================================================
--
-- O registro nasceu olhando `user_products`: publicar, editar, pausar,
-- excluir anúncio. Serve para vendedor -- e o co-produtor não mexe em anúncio
-- nenhum. O que ele toca é afiliado: cria, aprova, troca checkout e preço,
-- renomeia o código e remove.
--
-- Por isso o histórico dele vinha vazio. Não havia o que mostrar.
--
-- QUEM APARECE COMO AUTOR, E A DIFERENÇA ENTRE OS DOIS GATILHOS
--
-- Em `user_products` o autor é o dono do anúncio: a pessoa mexe no que é
-- dela. Aqui não -- quem mexe num afiliado é um terceiro, o admin ou o
-- co-produtor. Então o autor é `auth.uid()`: quem estava na sessão.
--
-- `auth.uid()` continua valendo dentro de função SECURITY DEFINER, porque ele
-- lê a credencial de quem chamou, e não o dono da função. `admin_criar_afiliado`
-- é uma dessas, e sai registrada no nome de quem apertou o botão.
--
-- Gravação feita por fora de uma sessão (um job, o service_role) grava autor
-- nulo. A tela mostra isso como "sistema", em vez de inventar um culpado.

create or replace function public.anotar_atividade_do_afiliado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quem uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    insert into public.registro_de_atividade (user_id, acao, alvo_id, titulo)
    values (v_quem, 'afiliado_removido', old.conta, old.apelido);

    return old;
  end if;

  if tg_op = 'INSERT' then
    insert into public.registro_de_atividade (user_id, acao, alvo_id, titulo, detalhes)
    values (
      v_quem, 'afiliado_criado', new.conta, new.apelido,
      jsonb_build_object('situacao', new.situacao)
    );

    return new;
  end if;

  -- UPDATE: uma linha por mudança de verdade.

  if old.situacao is distinct from new.situacao then
    insert into public.registro_de_atividade (user_id, acao, alvo_id, titulo, detalhes)
    values (
      v_quem,
      case new.situacao
        when 'aprovado' then 'afiliado_aprovado'
        when 'recusado' then 'afiliado_pausado'
        else 'afiliado_situacao'
      end,
      new.conta, new.apelido,
      jsonb_build_object('de', old.situacao, 'para', new.situacao)
    );
  end if;

  if old.apelido is distinct from new.apelido then
    insert into public.registro_de_atividade (user_id, acao, alvo_id, titulo, detalhes)
    values (
      v_quem, 'afiliado_codigo_alterado', new.conta, new.apelido,
      jsonb_build_object('de', old.apelido, 'para', new.apelido)
    );
  end if;

  -- Os dois checkouts numa linha só: trocar um costuma ser trocar os dois, e
  -- duas linhas iguais seguidas só fariam barulho.
  if old.checkout_basico is distinct from new.checkout_basico
     or old.checkout_premium is distinct from new.checkout_premium then
    insert into public.registro_de_atividade (user_id, acao, alvo_id, titulo)
    values (v_quem, 'afiliado_checkout_alterado', new.conta, new.apelido);
  end if;

  if old.valor_basico is distinct from new.valor_basico
     or old.valor_premium is distinct from new.valor_premium then
    insert into public.registro_de_atividade (user_id, acao, alvo_id, titulo, detalhes)
    values (
      v_quem, 'afiliado_preco_alterado', new.conta, new.apelido,
      jsonb_build_object(
        'basico_de', old.valor_basico, 'basico_para', new.valor_basico,
        'premium_de', old.valor_premium, 'premium_para', new.valor_premium
      )
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists anotar_atividade_do_afiliado on public.afiliados;

create trigger anotar_atividade_do_afiliado
  after insert or update or delete on public.afiliados
  for each row execute function public.anotar_atividade_do_afiliado();


-- ----------------------------------------------------------------------------
-- A leitura ganha o papel de quem agiu
-- ----------------------------------------------------------------------------
-- Sem isto não dá para perguntar "o que os co-produtores andaram fazendo?",
-- que é a pergunta que motivou tudo isto. Troca o tipo de retorno, por isso
-- cai antes de nascer de novo.

drop function if exists public.admin_historico(integer, timestamptz, uuid, text);

create function public.admin_historico(
  p_limite integer default 100,
  p_antes_de timestamptz default null,
  p_user uuid default null,
  p_acao text default null,
  p_papel text default null
)
returns table(
  id uuid,
  criado_em timestamptz,
  user_id uuid,
  nome text,
  email text,
  papel text,
  plano text,
  plan_status text,
  acao text,
  titulo text,
  detalhes jsonb
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  return query
  select
    r.id,
    r.criado_em,
    r.user_id,
    coalesce(nullif(p.name, ''), 'Sem nome'),
    p.email,
    coalesce(p.role, 'sistema'),
    p.plan,
    p.plan_status,
    r.acao,
    r.titulo,
    r.detalhes
  from public.registro_de_atividade r
  left join public.profiles p on p.id = r.user_id
  where (p_antes_de is null or r.criado_em < p_antes_de)
    and (p_user is null or r.user_id = p_user)
    and (p_acao is null or r.acao = p_acao)
    and (p_papel is null or coalesce(p.role, 'sistema') = p_papel)
  order by r.criado_em desc
  limit least(coalesce(p_limite, 100), 300);
end;
$function$;

revoke all on function public.admin_historico(integer, timestamptz, uuid, text, text) from public;
grant execute on function public.admin_historico(integer, timestamptz, uuid, text, text) to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Os dois gatilhos existem:
-- select tgrelid::regclass as tabela, tgname from pg_trigger
-- where tgname in ('anotar_atividade_do_anuncio', 'anotar_atividade_do_afiliado');

-- (b) Depois de mexer num afiliado, deve sair linha com o seu nome:
-- select criado_em, acao, titulo from public.registro_de_atividade
-- where acao like 'afiliado%' order by criado_em desc limit 10;

-- (c) E só o que os co-produtores fizeram:
-- select * from public.admin_historico(50, null, null, null, 'coprodutor');
