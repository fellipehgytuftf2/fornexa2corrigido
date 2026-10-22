-- Desempenho de cada afiliado cadastrado, pela conta dele.
--
-- O desempenho antigo (`admin_afiliados`) agrupa venda pelo `?code=` da URL.
-- O afiliado de agora não tem código: tem dois checkouts próprios, criados na
-- nossa Applyfy e colados no Admin. Então a venda é dele quando o checkout em
-- que ela aconteceu é um dos dois dele.
--
-- O webhook já guarda o endereço exato de cada compra em
-- `payload->>'checkoutUrl'`. A comparação é pelo identificador do checkout
-- (o trecho depois de /checkout/), não pelo endereço inteiro: a Applyfy
-- acrescenta sessão e UTMs diferentes a cada visita.
--
-- Mesmas contas do desempenho antigo, para as duas tabelas falarem a mesma
-- língua: ativo, perdido (reembolso ou cancelamento) e quem voltou nos
-- últimos 14 dias.

create or replace function public.admin_desempenho_dos_afiliados()
returns table (
  conta uuid,
  vendas integer,
  faturamento numeric,
  clientes_ativos integer,
  clientes_perdidos integer,
  usando_ainda integer,
  ultima_venda timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores podem ver os afiliados';
  end if;

  return query
  select
    a.conta,
    count(pg.id)::integer,
    coalesce(sum(pg.valor), 0),
    count(pg.id) filter (where pf.plan_status = 'ativo')::integer,
    count(pg.id) filter (where pf.plan_status in ('reembolsado', 'cancelado'))::integer,
    count(pg.id) filter (where u.last_sign_in_at > now() - interval '14 days')::integer,
    max(pg.criado_em)
  from public.afiliados a
  left join public.pagamentos pg
    on pg.status = 'pago'
   and substring(pg.payload->>'checkoutUrl' from '/checkout/([^/?#]+)') in (
         substring(a.checkout_basico from '/checkout/([^/?#]+)'),
         substring(a.checkout_premium from '/checkout/([^/?#]+)')
       )
  left join public.profiles pf on pf.id = pg.user_id
  left join auth.users u on u.id = pg.user_id
  where a.situacao = 'aprovado'
    and a.checkout_basico <> ''
    and a.checkout_premium <> ''
  group by a.conta;
end;
$$;

grant execute on function public.admin_desempenho_dos_afiliados() to authenticated;
