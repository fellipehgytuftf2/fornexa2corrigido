-- O ranking devolve o pódio, e nada além dele.
--
-- POR QUE
--
-- A tela mostrava do 4º lugar em diante com nome e faturamento de cada um.
-- Faturamento é dado de negócio de outra pessoa, e esconder na tela não
-- resolve: a função aceitava um limite, e quem soubesse pedir 500 recebia 500.
--
-- Agora o pódio é o limite da função, não um parâmetro. Quem chamar direto
-- recebe três linhas, porque não existe forma de pedir mais.
--
-- O QUE CADA UM VÊ
--
--   vendedor  os três primeiros, e a própria posição
--   admin     a lista inteira, por uma função separada, no painel dele
--
-- A posição de quem está vendo vem sem nome nenhum dos outros: é um número.

-- O limite saiu da assinatura, então a versão antiga tem que morrer.
drop function if exists public.ranking_vendedores(text, integer);

create or replace function public.ranking_vendedores(p_periodo text default 'mes')
returns table (
  posicao bigint,
  user_id uuid,
  nome text,
  foto_path text,
  faturamento numeric,
  mostra_valor boolean,
  conquista text,
  sou_eu boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with inicio as (
    select case p_periodo
      when 'semana' then date_trunc('week', now())
      when 'geral' then '-infinity'::timestamptz
      else date_trunc('month', now())
    end as desde
  ),
  soma as (
    select
      o.user_id,
      sum(o.sale_price) as faturamento,
      max(o.created_at) as fechou_em
    from public.orders o, inicio
    where public.venda_confirmada(o)
      and o.created_at >= inicio.desde
    group by o.user_id
    having sum(o.sale_price) > 0
  ),
  colocado as (
    select
      row_number() over (order by s.faturamento desc, s.fechou_em asc) as posicao,
      s.user_id,
      s.faturamento
    from soma s
  )
  select
    c.posicao,
    c.user_id,

    case coalesce(pr.ranking_visibilidade, 'apelido')
      when 'oculto' then 'Vendedor anônimo'
      when 'nome' then coalesce(nullif(pr.name, ''), 'Vendedor')
      else coalesce(
        nullif(pr.apelido, ''),
        split_part(coalesce(nullif(pr.name, ''), 'Vendedor'), ' ', 1)
      )
    end::text,

    case when coalesce(pr.ranking_visibilidade, 'apelido') = 'oculto'
      then null else pr.foto_path end,

    c.faturamento,
    coalesce(pr.ranking_mostra_valor, true),

    (
      select cq.chave
      from public.conquistas_do_usuario cu
      join public.conquistas cq on cq.chave = cu.chave
      where cu.user_id = c.user_id
      order by cq.ordem
      limit 1
    ),

    c.user_id = auth.uid()
  from colocado c
  left join public.profiles pr on pr.id = c.user_id
  where coalesce(pr.role, 'user') <> 'admin'
    -- O pódio é a regra, não um pedido de quem chama.
    and c.posicao <= 3
  order by c.posicao;
$$;

grant execute on function public.ranking_vendedores(text) to authenticated;


/**
 * A minha linha: posição, meu faturamento e quanto falta para o pódio.
 *
 * Quanto falta é uma subtração entre dois números meus — o meu total e o do
 * terceiro lugar. Nunca diz quem é o terceiro.
 */
-- Ganhou a coluna "falta para o pódio", e `create or replace` não muda o
-- retorno de uma função que já existe.
drop function if exists public.minha_posicao_no_ranking(text);

create or replace function public.minha_posicao_no_ranking(p_periodo text default 'mes')
returns table (
  posicao bigint,
  faturamento numeric,
  total_de_vendedores bigint,
  falta_para_o_podio numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with inicio as (
    select case p_periodo
      when 'semana' then date_trunc('week', now())
      when 'geral' then '-infinity'::timestamptz
      else date_trunc('month', now())
    end as desde
  ),
  soma as (
    select
      o.user_id,
      sum(o.sale_price) as faturamento,
      max(o.created_at) as fechou_em
    from public.orders o, inicio
    where public.venda_confirmada(o)
      and o.created_at >= inicio.desde
    group by o.user_id
    having sum(o.sale_price) > 0
  ),
  colocado as (
    select
      row_number() over (order by s.faturamento desc, s.fechou_em asc) as posicao,
      s.user_id,
      s.faturamento
    from soma s
  ),
  terceiro as (
    select c.faturamento from colocado c where c.posicao = 3
  )
  select
    c.posicao,
    c.faturamento,
    (select count(*) from colocado),
    case
      when c.posicao <= 3 then 0
      else greatest(coalesce((select faturamento from terceiro), 0) - c.faturamento, 0)
    end
  from colocado c
  where c.user_id = auth.uid();
$$;

grant execute on function public.minha_posicao_no_ranking(text) to authenticated;


/**
 * A lista inteira, só para o admin.
 *
 * Existe porque quem administra precisa enxergar a base para decidir; e fica
 * numa função separada, com checagem de papel, porque essa é a diferença entre
 * uma informação administrativa e um vazamento.
 */
create or replace function public.admin_ranking_completo(
  p_periodo text default 'mes',
  p_limite integer default 50
)
returns table (
  posicao bigint,
  user_id uuid,
  nome text,
  email text,
  faturamento numeric,
  pedidos bigint
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
  with inicio as (
    select case p_periodo
      when 'semana' then date_trunc('week', now())
      when 'geral' then '-infinity'::timestamptz
      else date_trunc('month', now())
    end as desde
  ),
  soma as (
    select
      o.user_id,
      sum(o.sale_price) as faturamento,
      count(*) as pedidos,
      max(o.created_at) as fechou_em
    from public.orders o, inicio
    where public.venda_confirmada(o)
      and o.created_at >= inicio.desde
    group by o.user_id
    having sum(o.sale_price) > 0
  )
  select
    row_number() over (order by s.faturamento desc, s.fechou_em asc),
    s.user_id,
    coalesce(nullif(pr.name, ''), nullif(pr.apelido, ''), 'Vendedor')::text,
    u.email::text,
    s.faturamento,
    s.pedidos
  from soma s
  join auth.users u on u.id = s.user_id
  left join public.profiles pr on pr.id = s.user_id
  order by s.faturamento desc, s.fechou_em asc
  limit greatest(p_limite, 1);
end;
$$;

grant execute on function public.admin_ranking_completo(text, integer) to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) O ranking devolve no máximo três linhas, peça quem pedir:
-- select count(*) from public.ranking_vendedores('geral');

-- (b) A função antiga, com limite, não existe mais (tem que dar erro):
-- select * from public.ranking_vendedores('geral', 500);

-- (c) Quem pode ler `orders` diretamente — o esperado é só o dono e o
--     service_role; nenhuma policy pode liberar linha de outro vendedor:
-- select policyname, cmd, qual from pg_policies
-- where schemaname = 'public' and tablename = 'orders';
