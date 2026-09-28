-- Quem se cadastrou, nunca pagou e nunca usou nada.
--
-- POR QUE
--
-- A base tem 6423 contas e 473 pagamentos. A maioria entrou pelo checkout,
-- criou a conta e nunca voltou — e cada uma dessas aparece na busca do admin,
-- na contagem de clientes e na lista de acessos, escondendo quem é real.
--
-- O QUE ESTA FUNÇÃO NÃO FAZ
--
-- Não apaga nada. Ela responde QUEM se encaixa, e é a única definição de
-- "conta abandonada" do sistema: a tela e a função de exclusão perguntam aqui,
-- para não existirem dois critérios que discordam entre si.
--
-- O QUE FICA DE FORA, E POR QUÊ
--
--   admin            — óbvio, e barato de garantir.
--   fornecedor       — `suppliers.auth_user_id` é "on delete set null": apagar
--                      a conta desligaria o login do Portal em silêncio.
--   afiliado         — `afiliados.conta` é "on delete cascade": levaria junto
--                      o cadastro e o histórico de indicação dele.
--   quem já pagou    — por user_id OU pelo e-mail, porque pagamento feito
--                      antes do cadastro nasce sem user_id.
--   quem tem plano   — `plan_status` diferente de inativo. Cancelado,
--                      reembolsado e bloqueado ficam: são história, não lixo.
--   quem usou algo   — conexão com o Mercado Livre, anúncio, pedido, chamado
--                      ou conversa no suporte. Qualquer um destes significa
--                      que a pessoa entrou de verdade.

create or replace function public.admin_contas_abandonadas(p_dias integer default 7)
returns table (
  id uuid,
  email text,
  nome text,
  criado_em timestamptz,
  ultimo_acesso timestamptz
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
    u.id,
    u.email::text,
    coalesce(nullif(pr.name, ''), nullif(pr.empresa, ''))::text,
    u.created_at,
    u.last_sign_in_at
  from auth.users u
  left join public.profiles pr on pr.id = u.id
  where coalesce(pr.role, 'user') <> 'admin'
    and u.created_at < now() - make_interval(days => greatest(p_dias, 1))
    and coalesce(pr.plan_status, 'inativo') = 'inativo'

    -- Pagou alguma vez, em qualquer estado: fica.
    and not exists (
      select 1 from public.pagamentos pg
      where pg.user_id = u.id or lower(pg.email) = lower(u.email::text)
    )

    -- É fornecedor ou afiliado: fica.
    and not exists (select 1 from public.suppliers s where s.auth_user_id = u.id)
    and not exists (select 1 from public.afiliados a where a.conta = u.id)

    -- Usou o sistema de alguma forma: fica.
    and not exists (select 1 from public.ml_connections c where c.user_id = u.id)
    and not exists (select 1 from public.user_products up where up.user_id = u.id)
    and not exists (select 1 from public.orders o where o.user_id = u.id)
    and not exists (select 1 from public.tickets t where t.user_id = u.id)
    and not exists (select 1 from public.suporte_conversas sc where sc.user_id = u.id)

  order by u.created_at;
end;
$$;

grant execute on function public.admin_contas_abandonadas(integer) to authenticated;


/** Só o número, para a tela não carregar milhares de linhas para contar. */
create or replace function public.admin_contas_abandonadas_total(p_dias integer default 7)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  select count(*) into v_total
  from public.admin_contas_abandonadas(p_dias);

  return v_total;
end;
$$;

grant execute on function public.admin_contas_abandonadas_total(integer) to authenticated;


-- ----------------------------------------------------------------------------
-- O que foi apagado
-- ----------------------------------------------------------------------------
-- Conta apagada não volta. O mínimo é saber quem era, quando saiu e por qual
-- regra — senão o primeiro "sumiu a conta de fulano" vira investigação sem
-- nenhuma pista.

create table if not exists public.contas_apagadas (
  id uuid primary key,
  email text,
  nome text,
  criada_em timestamptz,
  ultimo_acesso timestamptz,
  dias_da_regra integer not null,
  apagada_em timestamptz not null default now(),
  apagada_por uuid
);

comment on table public.contas_apagadas is
  'Registro das contas removidas por abandono. Não devolve o acesso: serve para responder o que aconteceu com uma conta que sumiu.';

alter table public.contas_apagadas enable row level security;
revoke all on public.contas_apagadas from public, anon, authenticated;
grant select, insert on public.contas_apagadas to service_role;


create or replace function public.admin_contas_apagadas(p_limite integer default 50)
returns setof public.contas_apagadas
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
  select * from public.contas_apagadas
  order by apagada_em desc
  limit greatest(p_limite, 1);
end;
$$;

grant execute on function public.admin_contas_apagadas(integer) to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Quantas contas a regra alcança hoje (rodando como admin):
-- select public.admin_contas_abandonadas_total(7);

-- Confirmação de que nenhum fornecedor entrou na lista:
-- select count(*) from public.admin_contas_abandonadas(7) c
-- join public.suppliers s on s.auth_user_id = c.id;
