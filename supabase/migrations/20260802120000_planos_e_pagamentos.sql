-- Planos e pagamentos.
--
-- Até aqui `profiles.plan` era enfeite: um texto mostrado na tela de ajustes
-- que nenhuma linha de código consultava. Quem se cadastrava recebia o sistema
-- inteiro de graça. Esta migração transforma o plano em algo que decide acesso.
--
-- Três ideias sustentam o desenho:
--
-- 1. Quem manda é `plan_status`, não `plan`. O nome do plano diz o que a pessoa
--    comprou; o status diz se ela pode entrar hoje. Separar os dois evita a
--    armadilha de tratar 'premium' como sinônimo de "em dia" — assinatura
--    vencida continua sendo premium, só que sem acesso.
--
-- 2. O pagamento chega antes da conta existir. Na Applyfy o comprador sai da
--    landing para o checkout e só depois vira usuário. Então o pagamento é
--    gravado por e-mail e fica esperando; quando a conta aparece, ela reivindica
--    o que já foi pago. Sem isso, todo cliente novo pagaria e ficaria trancado.
--
-- 3. Conta que já existe não pode ser trancada por esta migração. Todas as
--    contas de hoje ganham acesso vitalício de cortesia.

-- ---------------------------------------------------------------------------
-- 1. Estado da assinatura em profiles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists plan_status text not null default 'inativo',
  add column if not exists plan_expira_em timestamptz,
  add column if not exists plan_origem text not null default 'nenhum',
  add column if not exists plan_atualizado_em timestamptz;

comment on column public.profiles.plan_status is
  'inativo | ativo | vencido | cancelado | reembolsado. Só ativo dá acesso.';

comment on column public.profiles.plan_expira_em is
  'Nulo = não expira (compra única). Preenchido = mensal, precisa renovar.';

comment on column public.profiles.plan_origem is
  'nenhum | applyfy | cortesia | manual. De onde veio a liberação.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_plan_status_valido'
  ) then
    alter table public.profiles
      add constraint profiles_plan_status_valido
      check (plan_status in ('inativo', 'ativo', 'vencido', 'cancelado', 'reembolsado'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Cortesia para quem já está dentro
-- ---------------------------------------------------------------------------
-- Roda uma vez só: só alcança linhas ainda em 'inativo'. Se a migração for
-- reaplicada, quem já pagou de verdade não vira cortesia.

update public.profiles
set
  plan_status = 'ativo',
  plan = case when plan is null or plan = 'free' then 'premium' else plan end,
  plan_expira_em = null,
  plan_origem = 'cortesia',
  plan_atualizado_em = now()
where plan_status = 'inativo';

-- ---------------------------------------------------------------------------
-- 3. Pagamentos recebidos
-- ---------------------------------------------------------------------------
-- Guarda o aviso cru da plataforma além dos campos interpretados. A Applyfy não
-- publica documentação de webhook, então `payload` é o que permite descobrir o
-- formato real no primeiro pagamento e ajustar o mapeamento sem adivinhação.

create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),

  -- Nulo enquanto o comprador ainda não tem conta no FORNEXA.
  user_id uuid references public.profiles(id) on delete set null,

  email text not null,
  nome text,

  gateway text not null default 'applyfy',

  -- Identificador da transação lá na plataforma. É o que impede o mesmo
  -- pagamento de ser processado duas vezes quando o webhook repete o aviso.
  referencia_externa text,

  evento text,
  status text not null default 'desconhecido',

  plano text,
  valor numeric(10, 2),

  payload jsonb not null default '{}'::jsonb,

  aplicado boolean not null default false,
  observacao text,

  criado_em timestamptz not null default now()
);

-- Idempotência do webhook: mesma referência da mesma plataforma entra uma vez.
create unique index if not exists pagamentos_referencia_unica
  on public.pagamentos (gateway, referencia_externa)
  where referencia_externa is not null;

create index if not exists pagamentos_email_idx
  on public.pagamentos (lower(email));

create index if not exists pagamentos_user_idx
  on public.pagamentos (user_id);

alter table public.pagamentos enable row level security;

-- O vendedor comum não precisa ler esta tabela: o que ele vê do próprio plano
-- está em profiles. Quem lê é o admin.
drop policy if exists "admin le pagamentos" on public.pagamentos;
create policy "admin le pagamentos"
  on public.pagamentos
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

grant select on public.pagamentos to authenticated;
grant select, insert, update, delete on public.pagamentos to service_role;

-- ---------------------------------------------------------------------------
-- 4. A regra de acesso, num lugar só
-- ---------------------------------------------------------------------------
-- Front e banco precisam concordar sobre o que é "estar em dia". Deixar a regra
-- aqui evita as duas versões divergirem com o tempo.

create or replace function public.plano_em_dia(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and (
        -- Admin nunca é bloqueado: é quem conserta o bloqueio dos outros.
        p.role = 'admin'
        or (
          p.plan_status = 'ativo'
          and (p.plan_expira_em is null or p.plan_expira_em > now())
        )
      )
  );
$$;

grant execute on function public.plano_em_dia(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Liberar acesso a partir de um pagamento
-- ---------------------------------------------------------------------------
-- Chamada pela Edge Function do webhook. Recebe o pagamento já gravado e
-- carimba o perfil correspondente, se ele existir.

create or replace function public.aplicar_pagamento(p_pagamento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pag public.pagamentos%rowtype;
  v_user_id uuid;
  v_expira timestamptz;
begin
  select * into v_pag from public.pagamentos where id = p_pagamento_id;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'pagamento não encontrado');
  end if;

  select id into v_user_id
  from public.profiles
  where lower(email) = lower(v_pag.email)
  limit 1;

  if v_user_id is null then
    -- Comprou antes de criar a conta. Fica guardado; o cadastro reivindica
    -- depois, em `reivindicar_pagamentos`.
    update public.pagamentos
    set observacao = 'aguardando cadastro com este e-mail'
    where id = p_pagamento_id;

    return jsonb_build_object('ok', true, 'aguardando_cadastro', true);
  end if;

  -- Plano mensal vence; compra única não. A tolerância de 3 dias cobre atraso
  -- de repasse e nova tentativa de cobrança sem derrubar quem está pagando.
  if v_pag.plano = 'basico' then
    v_expira := now() + interval '33 days';
  else
    v_expira := null;
  end if;

  if v_pag.status = 'pago' then
    update public.profiles
    set
      plan = coalesce(v_pag.plano, plan),
      plan_status = 'ativo',
      plan_expira_em = v_expira,
      plan_origem = v_pag.gateway,
      plan_atualizado_em = now()
    where id = v_user_id;

  elsif v_pag.status in ('reembolsado', 'estornado') then
    update public.profiles
    set
      plan_status = 'reembolsado',
      plan_atualizado_em = now()
    where id = v_user_id;

  elsif v_pag.status = 'cancelado' then
    update public.profiles
    set
      plan_status = 'cancelado',
      plan_atualizado_em = now()
    where id = v_user_id;

  else
    -- Aviso de pagamento pendente, recusado ou de tipo desconhecido não muda
    -- acesso. Fica registrado para o admin ver.
    update public.pagamentos
    set observacao = 'status não altera acesso: ' || v_pag.status
    where id = p_pagamento_id;

    return jsonb_build_object('ok', true, 'sem_efeito', true, 'status', v_pag.status);
  end if;

  update public.pagamentos
  set user_id = v_user_id, aplicado = true
  where id = p_pagamento_id;

  return jsonb_build_object('ok', true, 'user_id', v_user_id, 'status', v_pag.status);
end;
$$;

revoke all on function public.aplicar_pagamento(uuid) from public, anon, authenticated;
grant execute on function public.aplicar_pagamento(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Cadastro reivindica pagamento que chegou antes
-- ---------------------------------------------------------------------------

create or replace function public.reivindicar_pagamentos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pag public.pagamentos%rowtype;
begin
  -- O pagamento mais recente vale: se a pessoa comprou básico e depois premium,
  -- o que ela tem é o premium.
  select * into v_pag
  from public.pagamentos
  where lower(email) = lower(new.email)
    and status = 'pago'
    and aplicado = false
  order by criado_em desc
  limit 1;

  if found then
    new.plan := coalesce(v_pag.plano, new.plan);
    new.plan_status := 'ativo';
    new.plan_expira_em := case
      when v_pag.plano = 'basico' then now() + interval '33 days'
      else null
    end;
    new.plan_origem := v_pag.gateway;
    new.plan_atualizado_em := now();

    update public.pagamentos
    set user_id = new.id, aplicado = true
    where id = v_pag.id;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_reivindica_pagamento on public.profiles;
create trigger profiles_reivindica_pagamento
  before insert on public.profiles
  for each row
  execute function public.reivindicar_pagamentos();

-- ---------------------------------------------------------------------------
-- 7. Ajuste manual pelo admin
-- ---------------------------------------------------------------------------
-- Existe para o caso que sempre acontece: alguém pagou por fora, o webhook
-- falhou, ou é preciso dar acesso a um sócio. Sem isto, a saída seria mexer no
-- banco na mão.

create or replace function public.admin_define_plano(
  p_user_id uuid,
  p_plano text,
  p_status text,
  p_dias integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eh_admin boolean;
begin
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) into v_eh_admin;

  if not v_eh_admin then
    raise exception 'apenas administradores podem alterar plano';
  end if;

  if p_status not in ('inativo', 'ativo', 'vencido', 'cancelado', 'reembolsado') then
    raise exception 'status inválido: %', p_status;
  end if;

  update public.profiles
  set
    plan = p_plano,
    plan_status = p_status,
    plan_expira_em = case
      when p_status <> 'ativo' then plan_expira_em
      when p_dias is null then null
      else now() + make_interval(days => p_dias)
    end,
    plan_origem = 'manual',
    plan_atualizado_em = now()
  where id = p_user_id;

  if not found then
    raise exception 'conta não encontrada';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_define_plano(uuid, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 7b. Listagem de contas para o admin
-- ---------------------------------------------------------------------------
-- Por função, e não por policy nova em `profiles`. A tabela já tem regras de
-- leitura em uso pelo painel inteiro; abrir "admin vê tudo" ali mexeria num
-- caminho crítico. A função entrega só o que a tela de admin precisa.

create or replace function public.admin_lista_contas(p_busca text default null)
returns table (
  id uuid,
  name text,
  email text,
  role text,
  plan text,
  plan_status text,
  plan_expira_em timestamptz,
  plan_origem text,
  plan_atualizado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'apenas administradores podem listar contas';
  end if;

  return query
  select
    p.id, p.name, p.email, p.role,
    p.plan, p.plan_status, p.plan_expira_em, p.plan_origem, p.plan_atualizado_em
  from public.profiles p
  where p_busca is null
     or p_busca = ''
     or p.email ilike '%' || p_busca || '%'
     or p.name ilike '%' || p_busca || '%'
  order by p.plan_atualizado_em desc nulls last, p.email
  limit 200;
end;
$$;

grant execute on function public.admin_lista_contas(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Assinatura mensal que venceu
-- ---------------------------------------------------------------------------
-- Chamada pela própria consulta de acesso não bastaria: o perfil precisa contar
-- a verdade também para o admin e para a tela de ajustes. Um passo de limpeza
-- resolve, e pode ser agendado depois se valer a pena.

create or replace function public.marcar_planos_vencidos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  update public.profiles
  set plan_status = 'vencido', plan_atualizado_em = now()
  where plan_status = 'ativo'
    and plan_expira_em is not null
    and plan_expira_em <= now();

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

grant execute on function public.marcar_planos_vencidos() to service_role;
