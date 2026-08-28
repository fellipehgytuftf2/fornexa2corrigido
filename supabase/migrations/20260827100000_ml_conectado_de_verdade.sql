-- O admin dizia "conectado" para conta que não tinha nada conectado.
--
-- A conta era marcada como ligada ao Mercado Livre só por existir uma linha em
-- `ml_connections`:
--
--   exists (select 1 from public.ml_connections c where c.user_id = p.id)
--
-- A linha continua existindo depois que a conexão cai — é ela que guarda o
-- refresh token para reconectar. Então bastava a pessoa ter conectado UMA VEZ,
-- meses atrás, para o admin dizer que estava conectada para sempre.
--
-- Isso apareceu de um jeito ruim: o admin mostrava "conectado", entrava na
-- conta da pessoa para dar suporte, e lá dentro não havia integração nenhuma.
-- A tela do vendedor sempre esteve certa; a do admin é que mentia.
--
-- Além de corrigir, passa a dizer QUAL é o estado. "Nunca ligou" e "caiu"
-- pedem conversas diferentes: uma é ensinar a conectar, a outra é avisar que
-- precisa reconectar.

drop function if exists public.admin_mapa_de_acesso();

create or replace function public.admin_mapa_de_acesso()
returns table (
  user_id uuid,
  nome text,
  email text,
  tipo text,
  plano text,
  plan_status text,
  plan_expira_em timestamptz,
  entra_no_painel boolean,
  ml_conectado boolean,
  ml_situacao text,
  fornecedores_visiveis integer,
  total_pedidos integer,
  total_produtos integer,
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
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'apenas administradores podem ver o mapa de acesso';
  end if;

  return query
  select
    p.id,
    coalesce(nullif(p.name, ''), 'Sem nome'),
    p.email,

    case
      when f.id is not null then 'Fornecedor'
      when p.role = 'admin' then 'Administrador'
      else 'Vendedor'
    end,

    p.plan,
    p.plan_status,
    p.plan_expira_em,

    (
      p.role = 'admin'
      or (
        p.plan_status = 'ativo'
        and (p.plan_expira_em is null or p.plan_expira_em > now())
      )
    ),

    -- Agora exige o status E o token. Status sem token é linha pela metade,
    -- que acontece quando a autorização começou e não terminou.
    exists (
      select 1 from public.ml_connections c
      where c.user_id = p.id
        and c.status = 'connected'
        and c.access_token is not null
        and c.access_token <> ''
    ),

    -- Nunca ligou, está ligada, ou caiu. São três conversas diferentes.
    case
      when not exists (select 1 from public.ml_connections c where c.user_id = p.id)
        then 'nunca'
      when exists (
        select 1 from public.ml_connections c
        where c.user_id = p.id
          and c.status = 'connected'
          and c.access_token is not null
          and c.access_token <> ''
      ) then 'conectada'
      else 'caiu'
    end,

    case
      when p.role = 'admin' then (select count(*)::integer from public.suppliers)
      else (
        select count(distinct o.supplier_id)::integer
        from public.orders o
        where o.user_id = p.id and o.supplier_id is not null
      )
    end,

    (select count(*)::integer from public.orders o where o.user_id = p.id),
    (select count(*)::integer from public.user_products up where up.user_id = p.id),

    u.created_at,
    u.last_sign_in_at

  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.suppliers f on f.auth_user_id = p.id
  order by u.last_sign_in_at desc nulls last;
end;
$$;

grant execute on function public.admin_mapa_de_acesso() to authenticated;
