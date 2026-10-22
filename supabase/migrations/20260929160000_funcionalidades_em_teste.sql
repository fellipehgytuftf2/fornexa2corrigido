-- Novidade em produção, visível só para quem você escolher.
--
-- POR QUE
--
-- Coisa nova precisa ser testada com dado de verdade, e dado de verdade só
-- existe em produção. Hoje a escolha é ruim dos dois lados: ou sobe e todo
-- mundo vê metade pronta, ou fica na máquina do desenvolvedor e só descobre os
-- problemas no dia do lançamento.
--
-- Uma marca por funcionalidade resolve: o código sobe desligado, quem tem
-- acesso liberado enxerga, o resto da base não sabe que existe. Lançar vira um
-- clique; dar errado depois de lançado também — desliga, sem deploy e sem
-- reverter nada.
--
-- POR QUE DUAS TABELAS
--
-- Uma diz se a funcionalidade existe e se já foi aberta para todos; a outra
-- diz quem enxerga enquanto ela não foi. Separadas, abrir para todos não perde
-- a lista de quem testou — e fechar de novo devolve exatamente o grupo antigo.


create table if not exists public.funcionalidades (
  chave text primary key
    constraint funcionalidades_chave_valida check (chave ~ '^[a-z0-9-]{2,60}$'),

  titulo text not null,
  descricao text,

  -- Aberta para todos. Enquanto falsa, só a lista de liberados enxerga.
  para_todos boolean not null default false,

  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

comment on table public.funcionalidades is
  'Interruptor de cada novidade: existe, e está aberta para todos ou só para a lista de liberados.';


create table if not exists public.funcionalidades_liberadas (
  chave text not null references public.funcionalidades (chave) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  liberada_em timestamptz not null default now(),

  primary key (chave, user_id)
);

comment on table public.funcionalidades_liberadas is
  'Quem enxerga uma funcionalidade que ainda não foi aberta para todos.';

alter table public.funcionalidades enable row level security;
alter table public.funcionalidades_liberadas enable row level security;
-- Sem policy: tudo passa pelas funções abaixo, como no resto do sistema.


-- ----------------------------------------------------------------------------
-- O que EU enxergo
-- ----------------------------------------------------------------------------
-- A tela pergunta isto uma vez e guarda. É a única função que o código do
-- produto chama; o resto é administração.

create or replace function public.minhas_funcionalidades()
returns table (chave text)
language sql
stable
security definer
set search_path = public
as $$
  select f.chave
  from public.funcionalidades f
  where f.para_todos
     or exists (
       select 1 from public.funcionalidades_liberadas l
       where l.chave = f.chave and l.user_id = auth.uid()
     )
     -- Admin enxerga tudo: é quem precisa ver para decidir se abre.
     or exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'admin'
     );
$$;

grant execute on function public.minhas_funcionalidades() to authenticated;


-- ----------------------------------------------------------------------------
-- A administração
-- ----------------------------------------------------------------------------

create or replace function public.admin_funcionalidades()
returns table (
  chave text,
  titulo text,
  descricao text,
  para_todos boolean,
  liberados bigint,
  criada_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  return query
  select
    f.chave,
    f.titulo,
    f.descricao,
    f.para_todos,
    (select count(*) from public.funcionalidades_liberadas l where l.chave = f.chave),
    f.criada_em
  from public.funcionalidades f
  order by f.criada_em desc;
end;
$$;

grant execute on function public.admin_funcionalidades() to authenticated;


create or replace function public.admin_criar_funcionalidade(
  p_chave text,
  p_titulo text,
  p_descricao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  if coalesce(btrim(p_titulo), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Dê um nome à novidade.');
  end if;

  if lower(btrim(coalesce(p_chave, ''))) !~ '^[a-z0-9-]{2,60}$' then
    return jsonb_build_object(
      'ok', false,
      'erro', 'A chave aceita letras minúsculas, números e hífen. Ex: etiqueta-nova.'
    );
  end if;

  insert into public.funcionalidades (chave, titulo, descricao)
  values (lower(btrim(p_chave)), btrim(p_titulo), nullif(btrim(coalesce(p_descricao, '')), ''))
  on conflict (chave) do nothing;

  return jsonb_build_object('ok', true, 'chave', lower(btrim(p_chave)));
end;
$$;

grant execute on function public.admin_criar_funcionalidade(text, text, text) to authenticated;


/** Abre para todos, ou fecha de volta sem perder quem testava. */
create or replace function public.admin_lancar_funcionalidade(
  p_chave text,
  p_para_todos boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  update public.funcionalidades
  set para_todos = p_para_todos, atualizada_em = now()
  where chave = p_chave;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Novidade não encontrada.');
  end if;

  return jsonb_build_object('ok', true, 'para_todos', p_para_todos);
end;
$$;

grant execute on function public.admin_lancar_funcionalidade(text, boolean) to authenticated;


/** Libera ou tira uma conta, pelo e-mail — que é como se conhece a pessoa. */
create or replace function public.admin_liberar_funcionalidade(
  p_chave text,
  p_email text,
  p_liberar boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  select u.id into v_user
  from auth.users u
  where lower(u.email::text) = lower(btrim(coalesce(p_email, '')));

  if v_user is null then
    return jsonb_build_object('ok', false, 'erro', 'Não há conta com este e-mail.');
  end if;

  if p_liberar then
    insert into public.funcionalidades_liberadas (chave, user_id)
    values (p_chave, v_user)
    on conflict do nothing;
  else
    delete from public.funcionalidades_liberadas
    where chave = p_chave and user_id = v_user;
  end if;

  return jsonb_build_object('ok', true, 'liberado', p_liberar);
end;
$$;

grant execute on function public.admin_liberar_funcionalidade(text, text, boolean) to authenticated;


/** Quem está liberado numa novidade. */
create or replace function public.admin_liberados_da_funcionalidade(p_chave text)
returns table (user_id uuid, email text, nome text, liberada_em timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  return query
  select
    l.user_id,
    u.email::text,
    coalesce(nullif(pr.name, ''), nullif(pr.empresa, ''))::text,
    l.liberada_em
  from public.funcionalidades_liberadas l
  join auth.users u on u.id = l.user_id
  left join public.profiles pr on pr.id = l.user_id
  where l.chave = p_chave
  order by l.liberada_em;
end;
$$;

grant execute on function public.admin_liberados_da_funcionalidade(text) to authenticated;
