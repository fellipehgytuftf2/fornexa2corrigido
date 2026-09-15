-- Mapa de acesso estava travando com "canceling statement due to
-- statement timeout" na tela Admin → Contas e acessos.
--
-- POR QUE
--
-- admin_mapa_de_acesso() (última versão em
-- 20260827100000_ml_conectado_de_verdade.sql) faz uma linha por conta em
-- `profiles`, e para CADA linha roda três subconsultas contra `orders` e
-- `user_products` (conta pedidos, conta produtos, conta fornecedores
-- distintos). Com poucas contas isso não doía; com a base crescida — mais
-- de 1800 contas, pedidos na casa das centenas — vira milhares de
-- varreduras dentro de `orders`/`user_products`, uma para cada linha de
-- `profiles`, e o banco desiste antes de terminar.
--
-- A CORREÇÃO
--
-- Trocar "uma subconsulta por linha de profiles" por "uma agregação por
-- tabela, feita uma vez só" — agrupa `orders` e `user_products` por
-- `user_id` antes, e só então junta com `profiles`. Mesmo resultado, uma
-- passada em cada tabela em vez de milhares. A lógica de `ml_conectado` /
-- `ml_situacao` (nunca ligou / conectada / caiu) e todo o resto do
-- resultado continuam exatamente como em 20260827100000 — só a forma de
-- contar pedidos/produtos/fornecedores mudou.
--
-- `drop function` primeiro porque o Postgres recusa trocar o formato de
-- retorno de uma função existente com `create or replace` sozinho.

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
declare
  v_total_fornecedores integer;
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'apenas administradores podem ver o mapa de acesso';
  end if;

  -- Só o admin usa este número (linha 'Administrador' abaixo), e é o mesmo
  -- para toda conta admin — uma vez fora do laço em vez de uma vez por linha.
  select count(*) into v_total_fornecedores from public.suppliers;

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

    exists (
      select 1 from public.ml_connections c
      where c.user_id = p.id
        and c.status = 'connected'
        and c.access_token is not null
        and c.access_token <> ''
    ),

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
      when p.role = 'admin' then v_total_fornecedores
      else coalesce(ped.fornecedores_distintos, 0)
    end,

    coalesce(ped.total_pedidos, 0),
    coalesce(prod.total_produtos, 0),

    u.created_at,
    u.last_sign_in_at

  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.suppliers f on f.auth_user_id = p.id

  -- Agregado uma vez, fora do laço por conta — era isto que rodava por
  -- linha de profiles e não terminava a tempo.
  left join (
    select
      o.user_id,
      count(*)::integer as total_pedidos,
      count(distinct o.supplier_id)::integer as fornecedores_distintos
    from public.orders o
    group by o.user_id
  ) ped on ped.user_id = p.id

  left join (
    select up.user_id, count(*)::integer as total_produtos
    from public.user_products up
    group by up.user_id
  ) prod on prod.user_id = p.id

  order by u.last_sign_in_at desc nulls last;
end;
$$;

grant execute on function public.admin_mapa_de_acesso() to authenticated;

-- Índices que a versão nova depende de existir para uma varredura barata:
-- se já existirem, `if not exists` não faz nada; se não existirem, cria
-- agora sem mudar nada em quem já os tinha.
create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists user_products_user_id_idx on public.user_products (user_id);
create index if not exists suppliers_auth_user_id_idx on public.suppliers (auth_user_id);

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Como admin, deve voltar em bem menos de 1s mesmo com a base cheia:
-- explain analyze select * from admin_mapa_de_acesso();
