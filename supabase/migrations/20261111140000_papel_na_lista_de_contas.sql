-- ============================================================================
-- A lista de contas passa a dizer quem é o quê
-- ============================================================================
--
-- `admin_mapa_de_acesso` classificava cada conta em três: Fornecedor,
-- Administrador e Vendedor. Co-produtor e afiliado caíam os dois em
-- "Vendedor" -- então a tela mostrava selo só para o admin, e não havia como
-- responder "quem são meus co-produtores?" ou "quem já é afiliado?" sem
-- abrir outra tela.
--
-- Agora são cinco, nesta ordem de precedência:
--
--   Fornecedor      tem login do portal (entra por outra porta)
--   Administrador   role = 'admin'
--   Co-produtor     role = 'coprodutor'
--   Afiliado        tem cadastro APROVADO em `afiliados`
--   Vendedor        o resto
--
-- A ordem importa porque uma pessoa pode ser duas coisas: um co-produtor
-- também pode ser afiliado. Mandou o papel, que é o que define o que ela
-- alcança no sistema; a afiliação é uma parceria comercial em cima disso.
--
-- "APROVADO" E NÃO "QUALQUER CADASTRO"
--
-- Dos 65 cadastros em `afiliados`, 62 estão pendentes. Marcar todos de
-- Afiliado encheria a lista de gente que só pediu -- e o selo deixaria de
-- significar alguma coisa.

CREATE OR REPLACE FUNCTION public.admin_mapa_de_acesso()
 RETURNS TABLE(user_id uuid, nome text, email text, tipo text, plano text, plan_status text, plan_expira_em timestamp with time zone, entra_no_painel boolean, ml_conectado boolean, ml_situacao text, fornecedores_visiveis integer, total_pedidos integer, total_produtos integer, criado_em timestamp with time zone, ultimo_acesso timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total_fornecedores integer;
  v_eh_coprodutor boolean;
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'coprodutor')
  ) then
    raise exception 'apenas administradores e co-produtores podem ver o mapa de acesso';
  end if;

  -- Quem chama decide o que sai. O co-produtor nao ve fornecedor nenhum.
  select (role = 'coprodutor') into v_eh_coprodutor
  from public.profiles where id = auth.uid();

  -- Só o admin usa este número (linha 'Administrador' abaixo), e é o mesmo
  -- para toda conta admin — uma vez fora do laço em vez de uma vez por linha.
  select count(*) into v_total_fornecedores from public.suppliers;

  return query
  with base (
    user_id, nome, email, tipo, plano, plan_status, plan_expira_em, entra_no_painel, ml_conectado, ml_situacao, fornecedores_visiveis, total_pedidos, total_produtos, criado_em, ultimo_acesso
  ) as materialized (
  select
    p.id,
    coalesce(nullif(p.name, ''), 'Sem nome'),
    p.email,

    case
      when f.id is not null then 'Fornecedor'
      when p.role = 'admin' then 'Administrador'
      when p.role = 'coprodutor' then 'Co-produtor'
      when af.conta is not null then 'Afiliado'
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

  -- Afiliado so conta depois de aprovado: quem pediu e ainda espera continua
  -- sendo vendedor, porque e isso que ele e hoje.
  left join public.afiliados af on af.conta = p.id and af.situacao = 'aprovado'

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

  )
  -- A conta de fornecedor some para o co-produtor.
  --
  -- Cortada aqui, e nao na tela: a lista inteira vem desta funcao, e o
  -- portal do fornecedor e justamente o que ele nao deve alcancar.
  -- Escondido so no navegador, bastaria o console para ler o que veio.
  --
  -- E cortada FORA do CTE, e nao dentro: dentro, o filtro muda a ordem dos
  -- joins e a consulta passa de 69 ms para 18 segundos. O MATERIALIZED
  -- acima e o que impede o banco de empurrar este where para dentro.
  select * from base
  where not (coalesce(v_eh_coprodutor, false) and base.tipo = 'Fornecedor')
  order by base.ultimo_acesso desc nulls last;
end;
$function$;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Quantas contas de cada tipo (rodando como admin):
-- select tipo, count(*) from public.admin_mapa_de_acesso() group by tipo order by 2 desc;
