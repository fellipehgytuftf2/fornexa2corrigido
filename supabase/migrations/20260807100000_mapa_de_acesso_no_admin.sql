-- Mapa de acesso: quem é cada conta e até onde ela alcança.
--
-- O que define acesso está espalhado por cinco lugares — `profiles.role`,
-- `profiles.plan_status`, `suppliers.auth_user_id`, `ml_connections` e os
-- pedidos que a conta tem. Para responder "o que essa pessoa consegue ver?"
-- era preciso consultar todos eles na mão, e por isso ninguém consultava.
--
-- Estas funções só leem. Nenhuma altera acesso — quem altera é
-- `admin_define_plano`, que já existe.

/**
 * Uma linha por conta, com tudo que decide o alcance dela.
 *
 * Lê `auth.users` para trazer o último acesso, que é o dado que mais rápido
 * separa cliente de verdade de quem cadastrou e sumiu. Por isso é
 * `security definer`: o esquema `auth` não é legível pelo usuário comum.
 */
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

    -- Fornecedor primeiro: quem tem cadastro em `suppliers` entra pelo portal
    -- e não vê o painel do vendedor, mesmo tendo plano.
    case
      when f.id is not null then 'Fornecedor'
      when p.role = 'admin' then 'Administrador'
      else 'Vendedor'
    end,

    p.plan,
    p.plan_status,
    p.plan_expira_em,

    -- Mesma regra de `plano_em_dia`, repetida aqui porque o admin precisa
    -- enxergar a conclusão junto dos dados que a produzem.
    (
      p.role = 'admin'
      or (
        p.plan_status = 'ativo'
        and (p.plan_expira_em is null or p.plan_expira_em > now())
      )
    ),

    exists (select 1 from public.ml_connections c where c.user_id = p.id),

    -- Fornecedores que esta conta alcança. Admin alcança todos; vendedor
    -- alcança aqueles com quem já teve pedido.
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
  left join public.suppliers f on f.auth_user_id = p.id
  left join auth.users u on u.id = p.id
  order by u.last_sign_in_at desc nulls last;
end;
$$;

grant execute on function public.admin_mapa_de_acesso() to authenticated;

/**
 * Quais fornecedores exatamente uma conta enxerga, e por quê.
 *
 * A contagem da lista responde "quantos"; esta responde "quais" — que é a
 * pergunta que aparece quando a contagem surpreende.
 */
create or replace function public.admin_fornecedores_da_conta(p_user_id uuid)
returns table (
  supplier_id uuid,
  fornecedor text,
  pedidos integer,
  primeiro_pedido timestamptz,
  ultimo_pedido timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_eh_admin boolean;
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'apenas administradores podem ver isto';
  end if;

  select (role = 'admin') into v_eh_admin
  from public.profiles where id = p_user_id;

  -- Conta de admin enxerga o cadastro inteiro, tenha pedido ou não.
  if coalesce(v_eh_admin, false) then
    return query
    select
      s.id,
      coalesce(s.company_name, s.name),
      (select count(*)::integer from public.orders o
        where o.supplier_id = s.id and o.user_id = p_user_id),
      null::timestamptz,
      null::timestamptz
    from public.suppliers s
    order by coalesce(s.company_name, s.name);

    return;
  end if;

  return query
  select
    s.id,
    coalesce(s.company_name, s.name),
    count(o.id)::integer,
    min(o.created_at),
    max(o.created_at)
  from public.orders o
  join public.suppliers s on s.id = o.supplier_id
  where o.user_id = p_user_id
  group by s.id, s.company_name, s.name
  order by max(o.created_at) desc;
end;
$$;

grant execute on function public.admin_fornecedores_da_conta(uuid) to authenticated;
