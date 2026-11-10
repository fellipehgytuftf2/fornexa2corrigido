-- ============================================================================
-- Co-produtor: sócio que acompanha os números, e só isso
-- ============================================================================
--
-- O sistema tinha três papéis: user, supplier e admin. Entre o cliente e o
-- dono não havia nada, e `role = 'admin'` está escrito à mão em cerca de
-- setenta lugares -- 37 migrations, 17 funções de borda, 8 telas. Admin é
-- tudo ou nada: quem tem o papel entra na conta de qualquer um dos clientes
-- ("Entrar na conta") e marca repasse de fornecedor como pago.
--
-- Sócio que entrou para acompanhar o negócio não precisa de nenhuma das duas.
--
-- COMO ESTE PAPEL FOI DESENHADO
--
-- Ao contrário de admin, `coprodutor` NÃO é reconhecido em lugar nenhum por
-- padrão. Ele nasce sem enxergar nada, e cada coisa que ele vê é liberada
-- aqui, uma por uma, de propósito.
--
-- É o contrário de "dar admin e esconder os botões": esconder botão não é
-- permissão. As regras do banco continuariam liberando tudo, e bastaria abrir
-- o inspetor do navegador para chegar lá. A trava mora aqui, no banco.
--
-- O QUE ELE PASSA A VER
--
--   admin_estatisticas_de_vendas  faturamento médio, mediana, faixas
--   admin_ranking_completo        os 50 maiores vendedores do mês
--   admin_afiliados               desempenho de cada afiliado
--
-- Os três são números do negócio.
--
-- O QUE ELE CONTINUA SEM VER, e por quê
--
--   admin_clientes_do_afiliado    e-mail e nome de cliente, um a um. Dado
--                                 pessoal de quem comprou não é número de
--                                 negócio, e vazamento aqui é problema de
--                                 LGPD, não de produto.
--   Contas e acessos              entra na conta de qualquer cliente
--   Repasses                      dinheiro a pagar ao fornecedor
--   Catálogo, Avisos, Impressão, Kanban
--
-- COMO SE DÁ O PAPEL A ALGUÉM
--
--   update public.profiles set role = 'coprodutor' where id = '<uuid>';
--
-- E como se tira:
--
--   update public.profiles set role = 'user' where id = '<uuid>';
--
-- A coluna não tem CHECK, então o valor é aceito sem alterar nada antes.
--
-- AS FUNÇÕES ABAIXO
--
-- São as três de hoje, recriadas com uma única diferença: a guarda deixou de
-- exigir 'admin' e passou a aceitar 'admin' ou 'coprodutor'. O corpo foi
-- copiado do que está vivo no banco (pg_get_functiondef) em vez de
-- reescrito, para não haver diferença nenhuma fora da guarda.

CREATE OR REPLACE FUNCTION public.admin_afiliados()
 RETURNS TABLE(afiliado text, vendas integer, faturamento numeric, clientes_com_conta integer, clientes_ativos integer, clientes_perdidos integer, usando_ainda integer, primeira_venda timestamp with time zone, ultima_venda timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'coprodutor')
  ) then
    raise exception 'apenas administradores e co-produtores';
  end if;

  return query
  select
    pg.afiliado,
    count(*)::integer,
    coalesce(sum(pg.valor), 0),

    count(pg.user_id)::integer,

    count(*) filter (where pf.plan_status = 'ativo')::integer,

    -- Reembolso e cancelamento contam junto: dos dois lados é cliente que
    -- entrou pela indicação e não ficou.
    count(*) filter (
      where pf.plan_status in ('reembolsado', 'cancelado')
    )::integer,

    -- Voltou nas últimas duas semanas. É o sinal mais honesto de que a
    -- indicação trouxe alguém que realmente queria o produto.
    count(*) filter (
      where u.last_sign_in_at > now() - interval '14 days'
    )::integer,

    min(pg.criado_em),
    max(pg.criado_em)

  from public.pagamentos pg
  left join public.profiles pf on pf.id = pg.user_id
  left join auth.users u on u.id = pg.user_id
  where pg.afiliado is not null
    and pg.status = 'pago'
  group by pg.afiliado
  order by count(*) desc;
end;
$function$;


CREATE OR REPLACE FUNCTION public.admin_estatisticas_de_vendas()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'coprodutor')
  ) then
    raise exception 'apenas administradores e co-produtores';
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
    where coalesce(p.role, 'user') not in ('admin', 'coprodutor')
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
$function$;


CREATE OR REPLACE FUNCTION public.admin_ranking_completo(p_periodo text DEFAULT 'mes'::text, p_limite integer DEFAULT 50)
 RETURNS TABLE(posicao bigint, user_id uuid, nome text, email text, faturamento numeric, pedidos bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'coprodutor')
  ) then
    raise exception 'apenas administradores e co-produtores';
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
$function$;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) As três guardas aceitam os dois papéis, e nenhuma outra função mudou:
-- select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and pg_get_functiondef(p.oid) like '%coprodutor%';
-- esperado: admin_afiliados, admin_estatisticas_de_vendas, admin_ranking_completo

-- (b) Quem é co-produtor hoje:
-- select id, email, role from public.profiles where role = 'coprodutor';

-- (c) O caminho fechado continua fechado -- rodando como co-produtor, isto
--     tem de falhar com 'apenas administradores':
-- select * from public.admin_clientes_do_afiliado('qualquer');
