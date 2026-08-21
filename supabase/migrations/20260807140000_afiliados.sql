-- Quem trouxe cada cliente.
--
-- A Applyfy já cuida do programa de afiliados: cadastra, rastreia e paga a
-- comissão. O que ela não mostra é o que acontece DEPOIS da venda — se o
-- cliente indicado ficou usando o sistema ou sumiu na primeira semana.
--
-- Esse dado está no FORNEXA e em nenhum outro lugar, e é ele que separa
-- afiliado que traz cliente de afiliado que traz reembolso.
--
-- O código do afiliado chega em `checkoutUrl`, no parâmetro `code`:
--
--   https://checkout.applyfy.com.br/checkout/xxx?session=...&offer=CMODXEW&code=AFILIADO123
--
-- Confirmado no disparo de teste da própria Applyfy, que usa o formato real.
--
-- RESSALVA: `code` pode ser o mesmo parâmetro usado para cupom de desconto —
-- não deu para confirmar sem uma venda com cupom. Se um dia aparecer código de
-- cupom nesta coluna, a correção é distinguir os dois aqui, e o dado bruto
-- continua em `payload` para refazer a conta.

alter table public.pagamentos
  add column if not exists afiliado text;

comment on column public.pagamentos.afiliado is
  'Código de quem indicou a venda, do parâmetro `code` do checkout. Nulo = venda direta.';

create index if not exists pagamentos_afiliado_idx
  on public.pagamentos (afiliado)
  where afiliado is not null;

-- Preenche o que já entrou. O aviso cru sempre foi guardado inteiro, então
-- nenhuma venda passada se perde.
update public.pagamentos
set afiliado = substring(payload->>'checkoutUrl' from 'code=([^&]+)')
where afiliado is null
  and payload->>'checkoutUrl' like '%code=%';

/**
 * Desempenho de cada afiliado.
 *
 * As colunas de venda respondem o que a Applyfy já responde. As de uso —
 * quantos indicados continuam ativos e quantos voltaram nas últimas duas
 * semanas — são as que só existem aqui, e são as que dizem se a indicação
 * valeu.
 */
create or replace function public.admin_afiliados()
returns table (
  afiliado text,
  vendas integer,
  faturamento numeric,
  clientes_com_conta integer,
  clientes_ativos integer,
  clientes_perdidos integer,
  usando_ainda integer,
  primeira_venda timestamptz,
  ultima_venda timestamptz
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
    raise exception 'apenas administradores podem ver os afiliados';
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
$$;

grant execute on function public.admin_afiliados() to authenticated;

/**
 * Os clientes que um afiliado trouxe, um a um.
 *
 * Serve para a pergunta que vem depois do número: quem exatamente entrou por
 * ele, e o que aconteceu com cada um.
 */
create or replace function public.admin_clientes_do_afiliado(p_afiliado text)
returns table (
  email text,
  nome text,
  plano text,
  plan_status text,
  valor numeric,
  comprou_em timestamptz,
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
    raise exception 'apenas administradores podem ver isto';
  end if;

  return query
  select
    pg.email,
    coalesce(pf.name, pg.nome),
    pf.plan,
    pf.plan_status,
    pg.valor,
    pg.criado_em,
    u.last_sign_in_at
  from public.pagamentos pg
  left join public.profiles pf on pf.id = pg.user_id
  left join auth.users u on u.id = pg.user_id
  where pg.afiliado = p_afiliado
    and pg.status = 'pago'
  order by pg.criado_em desc;
end;
$$;

grant execute on function public.admin_clientes_do_afiliado(text) to authenticated;
