-- ============================================================================
-- O co-produtor enxerga as contas de vendedor, e só elas
-- ============================================================================
--
-- A tela "Contas e acessos" faz cinco coisas, e só uma é olhar a lista:
--
--   admin_mapa_de_acesso          quem é cada conta, plano, validade, acessos
--   admin_fornecedores_da_conta   quais fornecedores aquela conta enxerga
--   admin_define_plano            MUDA o plano de alguém
--   admin_excluir_conta           APAGA a conta
--   admin-entrar-como             ENTRA na conta como se fosse a pessoa
--
-- Só a primeira é liberada aqui, e mesmo ela sai capada: sem fornecedor.
--
-- FORNECEDOR NÃO APARECE, E O CORTE É AQUI
--
-- A lista inclui as contas de fornecedor -- é de onde sai o bloco
-- "Fornecedores com acesso ao portal", com o botão de entrar no portal de
-- cada um. Essas linhas somem para o co-produtor.
--
-- O corte é nesta função, e não na tela, porque é a função que devolve a
-- lista. Escondido só no navegador, bastaria abrir o console para ler o que
-- veio -- e o que veio seria o acesso ao portal de quem abastece a operação.
--
-- Pelo mesmo motivo `admin_fornecedores_da_conta` NÃO entra aqui: ela diz
-- quais fornecedores uma conta enxerga, e continua só do admin.
--
-- POR QUE O FILTRO FICA FORA DA CONSULTA
--
-- A primeira versão disto punha um `where` dentro da consulta principal.
-- Funcionava e era ilegível na mesma medida: o `f.id is null` mudava a ordem
-- dos joins e o tempo saltava de 23 ms para 18 SEGUNDOS, acima do limite do
-- banco. A tela do co-produtor carregava vazia, com
-- "canceling statement due to statement timeout".
--
-- Então a consulta original roda inteira, intacta, dentro de um CTE
-- MATERIALIZED -- é o MATERIALIZED que impede o banco de empurrar o filtro
-- para dentro de novo -- e o corte acontece depois, sobre as linhas prontas.
-- Medido nos dois caminhos: 22 ms com filtro, 21 ms sem.
--
-- O "ENTRAR" TAMBÉM NÃO VEM
--
-- Não é cautela genérica: `admin-entrar-como` entra em conta de fornecedor
-- também -- a resposta dela devolve `tipo: 'vendedor' | 'fornecedor'`. O
-- botão contradiz a própria regra que o criou.
--
-- Mudar plano e apagar conta ficam de fora por outro motivo: são as duas
-- ações desta tela que um erro não desfaz.

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

-- (a) Só o mapa foi liberado. Esta lista tem de sair com UMA linha:
-- select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and proname in ('admin_mapa_de_acesso', 'admin_fornecedores_da_conta',
--                   'admin_define_plano', 'admin_excluir_conta')
--   and pg_get_functiondef(p.oid) like '%coprodutor%';

-- (b) Rodando como co-produtor, nenhuma linha pode vir como 'Fornecedor':
-- select tipo, count(*) from public.admin_mapa_de_acesso() group by tipo;

-- (c) E a tela não pode voltar a estourar o tempo:
-- explain analyze select * from public.admin_mapa_de_acesso();
