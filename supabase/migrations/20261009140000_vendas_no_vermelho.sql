-- Quem já está vendendo no prejuízo, e quanto.
--
-- POR QUE
--
-- A tela de publicar supunha 12% de comissão e frete zero abaixo de R$ 79. O
-- Mercado Livre cobra de 15% a 19,5% e cobra frete em todas as faixas. Quem
-- escolheu preço olhando aquela conta escolheu errado — e segue vendendo,
-- porque o prejuízo só aparece no Financeiro, depois, e só para quem procura.
--
-- Corrigir a conta resolve para as próximas vendas. Esta lista é para as que
-- já existem: diz quais produtos perdem dinheiro a cada venda e de quem são,
-- para avisar as pessoas antes que a próxima saia igual.
--
-- O QUE É "PREJUÍZO" AQUI
--
-- `lucro_liquido`, que o sistema calcula com os valores reais que o Mercado
-- Livre devolveu: quantidade x (venda − custo) − taxa − frete − embalagem.
-- Nada estimado.
--
-- SÓ O QUE TEM CUSTO APURADO
--
-- Venda sem `custos_apurados_em` ainda não teve taxa e frete fechados pelo
-- Mercado Livre. Entrar na lista com a conta pela metade mostraria lucro onde
-- ele não existe — exatamente o erro que esta lista veio denunciar.

create or replace function public.admin_vendas_no_vermelho(p_dias integer default 90)
returns table (
  produto text,
  vendedor text,
  vendedor_email text,
  vendas bigint,
  prejuizo_total numeric,
  prejuizo_medio numeric,
  preco_medio numeric,
  custo_medio numeric,
  taxa_media numeric,
  frete_medio numeric,
  ultima_venda timestamptz
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
  select
    o.product_name,
    coalesce(nullif(pr.empresa, ''), pr.name)::text,
    pr.email::text,
    count(*),
    sum(o.lucro_liquido)::numeric(10, 2),
    avg(o.lucro_liquido)::numeric(10, 2),
    avg(o.sale_price)::numeric(10, 2),
    avg(o.supplier_price)::numeric(10, 2),
    avg(o.taxa_marketplace / greatest(coalesce(o.quantidade, 1), 1))::numeric(10, 2),
    avg(o.custo_frete / greatest(coalesce(o.quantidade, 1), 1))::numeric(10, 2),
    max(o.created_at)
  from public.orders o
  left join public.profiles pr on pr.id = o.user_id
  where o.custos_apurados_em is not null
    and o.lucro_liquido < 0
    and o.created_at > now() - make_interval(days => greatest(p_dias, 1))
  group by o.product_name, pr.empresa, pr.name, pr.email
  order by sum(o.lucro_liquido) asc
  limit 50;
end;
$$;

grant execute on function public.admin_vendas_no_vermelho(integer) to authenticated;


/** O tamanho do buraco, em uma linha. */
create or replace function public.admin_resumo_do_vermelho(p_dias integer default 90)
returns table (
  vendas_apuradas bigint,
  vendas_no_vermelho bigint,
  prejuizo_total numeric,
  vendedores_atingidos bigint
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
  select
    count(*),
    count(*) filter (where o.lucro_liquido < 0),
    coalesce(sum(o.lucro_liquido) filter (where o.lucro_liquido < 0), 0)::numeric(10, 2),
    count(distinct o.user_id) filter (where o.lucro_liquido < 0)
  from public.orders o
  where o.custos_apurados_em is not null
    and o.created_at > now() - make_interval(days => greatest(p_dias, 1));
end;
$$;

grant execute on function public.admin_resumo_do_vermelho(integer) to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- select * from public.admin_resumo_do_vermelho(90);
-- select * from public.admin_vendas_no_vermelho(90) limit 10;
