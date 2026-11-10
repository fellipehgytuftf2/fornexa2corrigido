-- ============================================================================
-- O co-produtor enxerga as contas, sem poder mexer nelas
-- ============================================================================
--
-- A tela "Contas e acessos" faz cinco coisas, e só duas são olhar:
--
--   admin_mapa_de_acesso          quem é cada conta, plano, validade, acessos
--   admin_fornecedores_da_conta   quais fornecedores aquela conta enxerga
--   admin_define_plano            MUDA o plano de alguém
--   admin_excluir_conta           APAGA a conta
--   admin-entrar-como             ENTRA na conta como se fosse a pessoa
--
-- As duas primeiras são liberadas aqui. As outras três continuam só do admin.
--
-- POR QUE O "ENTRAR" NÃO VEM JUNTO
--
-- Não é cautela genérica: `admin-entrar-como` também entra em conta de
-- FORNECEDOR -- a resposta dela devolve `tipo: 'vendedor' | 'fornecedor'`.
-- Dar esse botão ao co-produtor abriria o portal do fornecedor por dentro,
-- que é exatamente o que ele não deve ver. O botão contradiz a própria regra
-- que o criou.
--
-- Mudar plano e apagar conta ficam de fora por outro motivo: são as duas
-- ações desta tela que um erro não desfaz. Apagar é definitivo, e mexer no
-- plano mexe no que alguém pagou.
--
-- Nada disso depende da tela esconder botão. Quem chamar a função direto,
-- pelo console do navegador, recebe a mesma recusa.

CREATE OR REPLACE FUNCTION public.admin_fornecedores_da_conta(p_user_id uuid)
 RETURNS TABLE(supplier_id uuid, fornecedor text, pedidos integer, primeiro_pedido timestamp with time zone, ultimo_pedido timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_eh_admin boolean;
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'coprodutor')
  ) then
    raise exception 'apenas administradores e co-produtores';
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
$function$;


CREATE OR REPLACE FUNCTION public.admin_mapa_de_acesso()
 RETURNS TABLE(user_id uuid, nome text, email text, tipo text, plano text, plan_status text, plan_expira_em timestamp with time zone, entra_no_painel boolean, ml_conectado boolean, ml_situacao text, fornecedores_visiveis integer, total_pedidos integer, total_produtos integer, criado_em timestamp with time zone, ultimo_acesso timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total_fornecedores integer;
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'coprodutor')
  ) then
    raise exception 'apenas administradores e co-produtores';
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
$function$;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) As duas funções de leitura aceitam os dois papéis:
-- select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and proname in
--   ('admin_mapa_de_acesso', 'admin_fornecedores_da_conta')
--   and pg_get_functiondef(p.oid) like '%coprodutor%';

-- (b) E as três pesadas continuam fechadas -- nenhuma pode aparecer aqui:
-- select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and proname in
--   ('admin_define_plano', 'admin_excluir_conta')
--   and pg_get_functiondef(p.oid) like '%coprodutor%';
