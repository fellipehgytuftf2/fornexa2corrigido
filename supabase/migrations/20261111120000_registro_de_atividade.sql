-- ============================================================================
-- Histórico: o que cada vendedor fez com os anúncios dele
-- ============================================================================
--
-- Não existia registro de ação de usuário. `log_integracao_ml` guarda eventos
-- da integração sem dizer quem os provocou, e `webhook_events` é o que o
-- Mercado Livre manda para cá. Nenhum dos dois responde "quem fez isto".
--
-- POR QUE GATILHO, E NÃO UMA CHAMADA EM CADA TELA
--
-- Porque a tela mente por omissão. Uma gravação feita por uma função de
-- borda, por um job noturno ou por alguém com o console aberto não passaria
-- por nenhum `registrar()` que eu espalhasse pelo front -- e o histórico
-- ficaria com buracos justamente nos casos em que ele importa.
--
-- O gatilho mora na tabela. O que mudou em `user_products`, mudou aqui.
--
-- O QUE ENTRA
--
-- As ações do anúncio: publicar, mudar título, mudar preço, pausar, reativar
-- e excluir. É o núcleo pedido, e é barato -- uma linha por mudança de
-- verdade, não uma por UPDATE.
--
-- Status de pedido ficou de fora de propósito: são 1.724 contas e o volume
-- multiplicaria, exigindo política de expurgo antes de haver o que ler. Se um
-- dia entrar, o lugar é este mesmo arquivo, com um gatilho irmão em `orders`.
--
-- QUEM APARECE COMO AUTOR
--
-- `user_products.user_id`, o dono do anúncio. Vale notar um limite honesto:
-- quando o admin usa "Entrar na conta", ele age na sessão da pessoa -- e o
-- registro vai sair no nome dela, porque é isso que o banco enxerga.

create table if not exists public.registro_de_atividade (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  acao text not null,
  alvo_id uuid,
  titulo text,
  detalhes jsonb,
  criado_em timestamptz not null default now()
);

comment on table public.registro_de_atividade is
  'O que cada vendedor fez com os anúncios dele. Escrito por gatilho, lido só pelo admin.';

-- A tela lê sempre do mais novo para o mais velho, e às vezes de uma conta
-- só. São os dois únicos caminhos de leitura que existem.
create index if not exists registro_de_atividade_criado_em_idx
  on public.registro_de_atividade (criado_em desc);

create index if not exists registro_de_atividade_user_idx
  on public.registro_de_atividade (user_id, criado_em desc);

alter table public.registro_de_atividade enable row level security;

-- Ninguém escreve por fora: quem escreve é o gatilho, que roda como dono.
drop policy if exists "só o admin lê o histórico" on public.registro_de_atividade;

create policy "só o admin lê o histórico"
  on public.registro_de_atividade
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );


-- ----------------------------------------------------------------------------
-- O gatilho
-- ----------------------------------------------------------------------------

create or replace function public.anotar_atividade_do_anuncio()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_titulo text;
begin
  if tg_op = 'DELETE' then
    insert into public.registro_de_atividade (user_id, acao, alvo_id, titulo)
    values (
      old.user_id, 'anuncio_excluido', old.id,
      coalesce(nullif(old.announcement_title, ''), old.name)
    );

    return old;
  end if;

  v_titulo := coalesce(nullif(new.announcement_title, ''), new.name);

  if tg_op = 'INSERT' then
    insert into public.registro_de_atividade (user_id, acao, alvo_id, titulo)
    values (new.user_id, 'anuncio_salvo', new.id, v_titulo);

    return new;
  end if;

  -- Daqui para baixo é UPDATE, e só o que mudou de verdade vira linha.

  -- Ganhar `ml_item_id` é o momento em que o anúncio passou a existir no
  -- Mercado Livre. É a ação que mais importa no histórico.
  if old.ml_item_id is distinct from new.ml_item_id and new.ml_item_id is not null then
    insert into public.registro_de_atividade (user_id, acao, alvo_id, titulo, detalhes)
    values (
      new.user_id, 'anuncio_publicado', new.id, v_titulo,
      jsonb_build_object('ml_item_id', new.ml_item_id)
    );
  end if;

  if old.announcement_title is distinct from new.announcement_title then
    insert into public.registro_de_atividade (user_id, acao, alvo_id, titulo, detalhes)
    values (
      new.user_id, 'titulo_alterado', new.id, v_titulo,
      jsonb_build_object('de', old.announcement_title, 'para', new.announcement_title)
    );
  end if;

  if old.announcement_price is distinct from new.announcement_price then
    insert into public.registro_de_atividade (user_id, acao, alvo_id, titulo, detalhes)
    values (
      new.user_id, 'preco_alterado', new.id, v_titulo,
      jsonb_build_object('de', old.announcement_price, 'para', new.announcement_price)
    );
  end if;

  -- Pausa do vendedor e pausa por falta de estoque são coisas diferentes, com
  -- causas diferentes -- e no histórico precisam continuar sendo.
  if old.pausado_pelo_vendedor is distinct from new.pausado_pelo_vendedor then
    insert into public.registro_de_atividade (user_id, acao, alvo_id, titulo)
    values (
      new.user_id,
      case when new.pausado_pelo_vendedor then 'anuncio_pausado' else 'anuncio_reativado' end,
      new.id, v_titulo
    );
  end if;

  if old.pausado_sem_estoque_em is distinct from new.pausado_sem_estoque_em
     and new.pausado_sem_estoque_em is not null then
    insert into public.registro_de_atividade (user_id, acao, alvo_id, titulo)
    values (new.user_id, 'pausado_sem_estoque', new.id, v_titulo);
  end if;

  return new;
end;
$function$;

drop trigger if exists anotar_atividade_do_anuncio on public.user_products;

create trigger anotar_atividade_do_anuncio
  after insert or update or delete on public.user_products
  for each row execute function public.anotar_atividade_do_anuncio();


-- ----------------------------------------------------------------------------
-- A leitura, para a tela
-- ----------------------------------------------------------------------------
-- Junta o nome, o e-mail e o plano de quem agiu. Vai por função, e não por
-- consulta direta, porque a tela precisa de `profiles` e `auth.users` -- e
-- abrir essas duas por política seria pagar caro por uma tela só.

create or replace function public.admin_historico(
  p_limite integer default 100,
  p_antes_de timestamptz default null,
  p_user uuid default null,
  p_acao text default null
)
returns table(
  id uuid,
  criado_em timestamptz,
  user_id uuid,
  nome text,
  email text,
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
  order by r.criado_em desc
  limit least(coalesce(p_limite, 100), 300);
end;
$function$;

revoke all on function public.admin_historico(integer, timestamptz, uuid, text) from public;
grant execute on function public.admin_historico(integer, timestamptz, uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- O expurgo
-- ----------------------------------------------------------------------------
-- Histórico que cresce para sempre vira custo sem virar informação: ninguém
-- consulta o que um vendedor fez há dois anos. Fica como função, e não como
-- cron, para a decisão de quando apagar ser tomada por quem é dono do dado.
--
--   select public.limpar_registro_de_atividade(180);

create or replace function public.limpar_registro_de_atividade(p_dias integer default 180)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_apagadas integer;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  delete from public.registro_de_atividade
  where criado_em < now() - make_interval(days => greatest(p_dias, 7));

  get diagnostics v_apagadas = row_count;

  return v_apagadas;
end;
$function$;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) O gatilho está na tabela:
-- select tgname from pg_trigger where tgrelid = 'public.user_products'::regclass
--   and not tgisinternal;

-- (b) Depois de mexer num anúncio, deve aparecer linha aqui:
-- select criado_em, acao, titulo from public.registro_de_atividade
-- order by criado_em desc limit 10;

-- (c) E a tela lê por esta função:
-- select * from public.admin_historico(20);
