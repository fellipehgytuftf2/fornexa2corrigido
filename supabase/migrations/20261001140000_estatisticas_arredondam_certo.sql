-- As estatísticas voltam a carregar.
--
-- POR QUE QUEBROU
--
-- No Postgres, `round(valor, casas)` só existe para `numeric`. A mediana
-- (`percentile_cont`) e a média de dias (`avg` sobre `extract(epoch ...)`)
-- devolvem `double precision`, e o banco respondia:
--
--   function round(double precision, integer) does not exist
--
-- A média de faturamento passava porque `avg` de `numeric` devolve `numeric` —
-- e foi por isso que o erro só apareceu no painel inteiro, não na conta que o
-- causou.
--
-- A conversão fica junto do arredondamento, onde o problema nasce.

create or replace function public.admin_estatisticas_de_vendas()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  with por_vendedor as (
    select
      o.user_id,
      sum(o.sale_price) as faturamento,
      min(o.created_at) as primeira_venda
    from public.orders o
    where public.venda_confirmada(o)
    group by o.user_id
  ),
  contas as (
    select u.id, u.created_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    where coalesce(p.role, 'user') <> 'admin'
  )
  select jsonb_build_object(
    'vendedores_com_venda', (select count(*) from por_vendedor),
    'contas', (select count(*) from contas),

    'faturamento_medio',
      round(coalesce((select avg(faturamento) from por_vendedor), 0)::numeric, 2),

    'faturamento_mediano',
      round(coalesce((
        select percentile_cont(0.5) within group (order by faturamento)
        from por_vendedor
      ), 0)::numeric, 2),

    -- Quanto tempo a conta demora para virar venda. É a pergunta que diz se o
    -- produto convence, e ela não tinha resposta.
    'dias_ate_a_primeira_venda',
      round(coalesce((
        select avg(extract(epoch from (pv.primeira_venda - c.created_at)) / 86400)
        from por_vendedor pv join contas c on c.id = pv.user_id
        where pv.primeira_venda >= c.created_at
      ), 0)::numeric, 1),

    'faixas', (
      select jsonb_agg(f order by f->>'ordem')
      from (
        select jsonb_build_object(
          'ordem', 1, 'faixa', 'até R$ 1.000',
          'vendedores', count(*) filter (where faturamento <= 1000)
        ) as f from por_vendedor
        union all
        select jsonb_build_object(
          'ordem', 2, 'faixa', 'R$ 1.000 a R$ 5.000',
          'vendedores', count(*) filter (where faturamento > 1000 and faturamento <= 5000)
        ) from por_vendedor
        union all
        select jsonb_build_object(
          'ordem', 3, 'faixa', 'R$ 5.000 a R$ 10.000',
          'vendedores', count(*) filter (where faturamento > 5000 and faturamento <= 10000)
        ) from por_vendedor
        union all
        select jsonb_build_object(
          'ordem', 4, 'faixa', 'R$ 10.000 a R$ 50.000',
          'vendedores', count(*) filter (where faturamento > 10000 and faturamento <= 50000)
        ) from por_vendedor
        union all
        select jsonb_build_object(
          'ordem', 5, 'faixa', 'acima de R$ 50.000',
          'vendedores', count(*) filter (where faturamento > 50000)
        ) from por_vendedor
      ) faixas
    )
  ) into v;

  return v;
end;
$$;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Rodando como admin, tem que devolver o objeto inteiro sem erro:
-- select public.admin_estatisticas_de_vendas();
