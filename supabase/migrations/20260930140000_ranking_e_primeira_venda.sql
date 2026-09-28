-- O ranking, as metas e o desbloqueio automático da primeira venda.
--
-- O QUE CONTA COMO VENDA
--
-- Pagamento aprovado no Mercado Livre, pedido não cancelado e não estornado.
-- Estornou, o valor sai e a posição recalcula sozinha — o ranking lê os
-- pedidos a cada consulta, não guarda placar.
--
-- POR QUE NÃO EXISTE TABELA DE PLACAR
--
-- Placar guardado é um segundo lugar onde a verdade mora, e os dois discordam
-- no primeiro estorno. Somar na hora custa uma consulta indexada e nunca
-- mente.


-- ----------------------------------------------------------------------------
-- As metas
-- ----------------------------------------------------------------------------
-- Faixas, e não um número fixo: "faltam R$ 99.000" para quem vendeu R$ 1.000
-- desanima em vez de puxar.

create table if not exists public.metas_de_faturamento (
  valor numeric(12, 2) primary key,
  ordem integer not null
);

insert into public.metas_de_faturamento (valor, ordem)
values (1000, 1), (5000, 2), (10000, 3), (50000, 4), (100000, 5)
on conflict (valor) do nothing;

alter table public.metas_de_faturamento enable row level security;
grant select on public.metas_de_faturamento to authenticated;

drop policy if exists "meta e publica para quem esta logado" on public.metas_de_faturamento;
create policy "meta e publica para quem esta logado"
  on public.metas_de_faturamento for select to authenticated using (true);


-- ----------------------------------------------------------------------------
-- O que é uma venda confirmada
-- ----------------------------------------------------------------------------
-- Uma definição só, usada pelo ranking, pela barra do topo e pelo gatilho.
-- Três cópias da mesma regra viram três números diferentes na mesma tela.

create or replace function public.venda_confirmada(p_order public.orders)
returns boolean
language sql
immutable
as $$
  select
    p_order.ml_order_status = 'paid'
    and p_order.status is distinct from 'cancelled'
    and p_order.reembolsado_em is null;
$$;

create index if not exists orders_ranking_idx
  on public.orders (user_id, created_at)
  where ml_order_status = 'paid';


-- ----------------------------------------------------------------------------
-- O ranking
-- ----------------------------------------------------------------------------

create or replace function public.ranking_vendedores(
  p_periodo text default 'mes',
  p_limite integer default 20
)
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
      -- Desempate: quem chegou primeiro ao valor. A venda mais recente de
      -- quem empatou diz quem fechou a conta antes.
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
      s.faturamento,
      s.fechou_em
    from soma s
  )
  select
    c.posicao,
    c.user_id,

    -- Privacidade: quem escolheu ficar oculto some do nome, não do ranking.
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

    -- O selo de maior destaque que a pessoa já tem.
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
  order by c.posicao
  limit greatest(p_limite, 1);
$$;

grant execute on function public.ranking_vendedores(text, integer) to authenticated;


/**
 * A minha linha, mesmo fora do top.
 *
 * Sem isto, quem está em 43º abre o ranking e não se encontra — e a única
 * pergunta que ele tinha era essa.
 */
create or replace function public.minha_posicao_no_ranking(p_periodo text default 'mes')
returns table (posicao bigint, faturamento numeric, total_de_vendedores bigint)
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
  select c.posicao, c.faturamento, (select count(*) from colocado)
  from colocado c
  where c.user_id = auth.uid();
$$;

grant execute on function public.minha_posicao_no_ranking(text) to authenticated;


-- ----------------------------------------------------------------------------
-- A barra do topo
-- ----------------------------------------------------------------------------

create or replace function public.meu_faturamento_e_meta()
returns table (
  faturamento numeric,
  meta numeric,
  falta numeric,
  conquista text
)
language sql
stable
security definer
set search_path = public
as $$
  with total as (
    select coalesce(sum(o.sale_price), 0) as faturamento
    from public.orders o
    where o.user_id = auth.uid()
      and public.venda_confirmada(o)
  ),
  proxima as (
    -- A primeira meta ainda não alcançada. Passou da última, a meta vira ela
    -- mesma e a barra fica cheia: melhor que inventar um número novo.
    select coalesce(
      (select min(m.valor) from public.metas_de_faturamento m, total
        where m.valor > total.faturamento),
      (select max(m.valor) from public.metas_de_faturamento m)
    ) as meta
  )
  select
    total.faturamento,
    proxima.meta,
    greatest(proxima.meta - total.faturamento, 0),
    (
      select cq.chave
      from public.conquistas_do_usuario cu
      join public.conquistas cq on cq.chave = cu.chave
      where cu.user_id = auth.uid()
      order by cq.ordem
      limit 1
    )
  from total, proxima;
$$;

grant execute on function public.meu_faturamento_e_meta() to authenticated;


-- ----------------------------------------------------------------------------
-- Meus selos
-- ----------------------------------------------------------------------------

create or replace function public.minhas_conquistas()
returns table (
  chave text,
  nome text,
  descricao text,
  icone text,
  ativa boolean,
  ordem integer,
  desbloqueada_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.chave, c.nome, c.descricao, c.icone, c.ativa, c.ordem,
    cu.desbloqueada_em
  from public.conquistas c
  left join public.conquistas_do_usuario cu
    on cu.chave = c.chave and cu.user_id = auth.uid()
  order by c.ordem;
$$;

grant execute on function public.minhas_conquistas() to authenticated;


-- ----------------------------------------------------------------------------
-- A comemoração
-- ----------------------------------------------------------------------------

create or replace function public.minha_comemoracao_pendente()
returns table (chave text, nome text, icone text, criada_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.chave, c.nome, c.icone, p.criada_em
  from public.comemoracoes_pendentes p
  join public.conquistas c on c.chave = p.chave
  where p.user_id = auth.uid() and p.vista_em is null
  order by p.criada_em
  limit 1;
$$;

grant execute on function public.minha_comemoracao_pendente() to authenticated;


create or replace function public.marcar_comemoracao_vista(p_chave text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'faça login novamente';
  end if;

  update public.comemoracoes_pendentes
  set vista_em = now()
  where user_id = auth.uid() and chave = p_chave and vista_em is null;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.marcar_comemoracao_vista(text) to authenticated;


-- ----------------------------------------------------------------------------
-- O desbloqueio automático
-- ----------------------------------------------------------------------------
-- Roda quando o pedido nasce pago e quando um pedido vira pago depois. As duas
-- entradas existem porque a venda chega dos dois jeitos: webhook com pagamento
-- já aprovado, e sincronização que atualiza o status horas depois.

create or replace function public.desbloquear_primeira_venda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null or not public.venda_confirmada(new) then
    return new;
  end if;

  -- A chave composta faz o resto: quem já tem o selo não ganha de novo, e a
  -- comemoração também não se repete.
  insert into public.conquistas_do_usuario (chave, user_id)
  values ('primeira-venda', new.user_id)
  on conflict do nothing;

  if found then
    insert into public.comemoracoes_pendentes (user_id, chave)
    values (new.user_id, 'primeira-venda')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists desbloquear_primeira_venda on public.orders;

create trigger desbloquear_primeira_venda
  after insert or update of ml_order_status, reembolsado_em, status on public.orders
  for each row
  execute function public.desbloquear_primeira_venda();


-- ----------------------------------------------------------------------------
-- O painel do admin
-- ----------------------------------------------------------------------------

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
    'faturamento_medio', round(coalesce((select avg(faturamento) from por_vendedor), 0), 2),
    'faturamento_mediano', round(coalesce((
      select percentile_cont(0.5) within group (order by faturamento) from por_vendedor
    ), 0), 2),

    -- Quanto tempo a conta demora para virar venda. É a pergunta que diz se o
    -- produto convence, e ela não tinha resposta.
    'dias_ate_a_primeira_venda', round(coalesce((
      select avg(extract(epoch from (pv.primeira_venda - c.created_at)) / 86400)
      from por_vendedor pv join contas c on c.id = pv.user_id
      where pv.primeira_venda >= c.created_at
    ), 0), 1),

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

grant execute on function public.admin_estatisticas_de_vendas() to authenticated;
