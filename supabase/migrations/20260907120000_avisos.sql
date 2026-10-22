-- Avisos do FORNEXA para os vendedores.
--
-- POR QUE UMA ABA, E NÃO UM AVISO CHUMBADO NO CÓDIGO
--
-- O primeiro aviso é sobre o endereço de remetente: quem já usava o sistema
-- antes de 05/09/2026 configurou a loja quando o FORNEXA ainda não falava
-- disso, e provavelmente está despachando com o endereço errado.
--
-- Mas já se enxergam os próximos: horário de corte do fornecedor, DC-e
-- automática, taxa de embalagem. Cada um chumbado no código seria um deploy
-- para dizer uma frase, e um segundo deploy para removê-la depois.
--
-- E tem o que o aviso avulso não daria: saber QUEM leu. Com registro, dá para
-- cobrar quem falta em vez de repetir para todos.
--
-- POR QUE O ALVO É POR DATA DE CRIAÇÃO DA CONTA
--
-- É o recorte que os avisos deste tipo pedem: "quem entrou antes de X" são as
-- pessoas que combinaram alguma coisa sob a regra antiga. Quem chegou depois
-- já encontrou o sistema pronto e não precisa ser avisado de nada.

create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),

  titulo text not null,
  corpo text not null,

  -- Um destino, opcional. Aviso que manda fazer algo sem dizer onde vira
  -- trabalho de adivinhação para quem lê.
  link_rotulo text,
  link_para text,

  -- Recorte por data de criação da conta. Nulo dos dois lados = todo mundo.
  alvo_criados_ate timestamptz,
  alvo_criados_desde timestamptz,

  ativo boolean not null default true,

  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id)
);

comment on table public.avisos is
  'Avisos que aparecem uma vez para o vendedor ao abrir o painel. Escritos pelo admin, com recorte por data de criação da conta.';

create table if not exists public.avisos_lidos (
  aviso_id uuid not null references public.avisos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  lido_em timestamptz not null default now(),

  primary key (aviso_id, user_id)
);

alter table public.avisos enable row level security;
alter table public.avisos_lidos enable row level security;

-- Sem policy nenhuma, de propósito: tudo passa pelas funções abaixo, que já
-- decidem quem vê o quê. Tabela aberta por policy seria uma segunda porta com
-- regra própria para manter em dia.


/**
 * Os avisos que este vendedor ainda não leu.
 *
 * Ordem de chegada: aviso antigo primeiro, para que uma sequência de avisos
 * seja lida na ordem em que os fatos aconteceram.
 */
create or replace function public.meus_avisos()
returns table (
  id uuid,
  titulo text,
  corpo text,
  link_rotulo text,
  link_para text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_criado_em timestamptz;
begin
  if auth.uid() is null then
    return;
  end if;

  select u.created_at into v_criado_em
  from auth.users u
  where u.id = auth.uid();

  return query
  select a.id, a.titulo, a.corpo, a.link_rotulo, a.link_para
  from public.avisos a
  where a.ativo
    and (a.alvo_criados_ate is null or v_criado_em <= a.alvo_criados_ate)
    and (a.alvo_criados_desde is null or v_criado_em >= a.alvo_criados_desde)
    and not exists (
      select 1 from public.avisos_lidos l
      where l.aviso_id = a.id and l.user_id = auth.uid()
    )
  order by a.criado_em;
end;
$$;

grant execute on function public.meus_avisos() to authenticated;


/** Marca um aviso como lido por quem está logado. */
create or replace function public.marcar_aviso_lido(p_aviso_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'faça login novamente';
  end if;

  insert into public.avisos_lidos (aviso_id, user_id)
  values (p_aviso_id, auth.uid())
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.marcar_aviso_lido(uuid) to authenticated;


/** O admin escreve um aviso. */
create or replace function public.admin_criar_aviso(
  p_titulo text,
  p_corpo text,
  p_link_rotulo text default null,
  p_link_para text default null,
  p_alvo_criados_ate timestamptz default null,
  p_alvo_criados_desde timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  if coalesce(trim(p_titulo), '') = '' or coalesce(trim(p_corpo), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Título e texto são obrigatórios.');
  end if;

  insert into public.avisos (
    titulo, corpo, link_rotulo, link_para,
    alvo_criados_ate, alvo_criados_desde, criado_por
  )
  values (
    trim(p_titulo), trim(p_corpo),
    nullif(trim(coalesce(p_link_rotulo, '')), ''),
    nullif(trim(coalesce(p_link_para, '')), ''),
    p_alvo_criados_ate, p_alvo_criados_desde, auth.uid()
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.admin_criar_aviso(
  text, text, text, text, timestamptz, timestamptz
) to authenticated;


/**
 * Os avisos e quantos já leram cada um.
 *
 * O número de leituras é o que torna a aba útil depois de publicar: sem ele,
 * não há como saber se o recado chegou nem a quem cobrar.
 */
create or replace function public.admin_listar_avisos()
returns table (
  id uuid,
  titulo text,
  corpo text,
  ativo boolean,
  criado_em timestamptz,
  alvo_criados_ate timestamptz,
  alvo_criados_desde timestamptz,
  leram bigint,
  alcance bigint
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
    a.id, a.titulo, a.corpo, a.ativo, a.criado_em,
    a.alvo_criados_ate, a.alvo_criados_desde,

    (select count(*) from public.avisos_lidos l where l.aviso_id = a.id),

    -- Quantas contas o recorte alcança. Comparado com as leituras, diz quanto
    -- do recado ainda não chegou.
    (
      select count(*)
      from auth.users u
      join public.profiles p on p.id = u.id
      where coalesce(p.role, 'user') <> 'admin'
        and (a.alvo_criados_ate is null or u.created_at <= a.alvo_criados_ate)
        and (a.alvo_criados_desde is null or u.created_at >= a.alvo_criados_desde)
    )
  from public.avisos a
  order by a.criado_em desc;
end;
$$;

grant execute on function public.admin_listar_avisos() to authenticated;


/** Liga e desliga um aviso, sem apagar o que já foi lido. */
create or replace function public.admin_alternar_aviso(p_aviso_id uuid, p_ativo boolean)
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

  update public.avisos set ativo = p_ativo where id = p_aviso_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_alternar_aviso(uuid, boolean) to authenticated;
