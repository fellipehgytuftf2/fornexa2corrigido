-- O vendedor vê quais anúncios dele estão vendendo no prejuízo.
--
-- POR QUE
--
-- A conta de publicar foi corrigida em 09/10 e resolve as próximas. Mas os
-- anúncios já no ar continuam vendendo com o preço escolhido pela conta
-- antiga — a que supunha 12% de comissão e frete zero abaixo de R$ 79. Cada
-- venda nova desses anúncios tira dinheiro do vendedor, e ele não sabe: o
-- prejuízo só aparece no Financeiro, depois, somado a tudo.
--
-- O admin já enxerga isso na lista de vendas no vermelho. Esta função leva a
-- mesma verdade para quem pode agir: o dono do anúncio.
--
-- O QUE ELE FAZ COM A INFORMAÇÃO
--
-- O preço não se muda pelo FORNEXA — é definido na publicação e alterado no
-- Mercado Livre. Então a tela mostra o produto, o quanto perde por venda, e o
-- botão que já existe para abrir o anúncio lá e corrigir.
--
-- SÓ COM CUSTO APURADO
--
-- Venda sem `custos_apurados_em` ainda não teve taxa e frete fechados pelo
-- Mercado Livre. Entrar aqui com a conta pela metade acusaria prejuízo onde
-- talvez não haja — e acusação errada é o jeito mais rápido de a pessoa parar
-- de acreditar no aviso.

create or replace function public.meus_anuncios_no_vermelho(p_dias integer default 90)
returns table (
  user_product_id uuid,
  produto text,
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
  if auth.uid() is null then
    raise exception 'é preciso estar logado';
  end if;

  return query
  select
    coalesce(o.user_product_id, o.product_id),
    o.product_name,
    count(*),
    sum(o.lucro_liquido)::numeric(10, 2),
    avg(o.lucro_liquido)::numeric(10, 2),
    avg(o.sale_price)::numeric(10, 2),
    avg(o.supplier_price)::numeric(10, 2),
    avg(o.taxa_marketplace / greatest(coalesce(o.quantidade, 1), 1))::numeric(10, 2),
    avg(o.custo_frete / greatest(coalesce(o.quantidade, 1), 1))::numeric(10, 2),
    max(o.created_at)
  from public.orders o
  where o.user_id = auth.uid()
    and o.custos_apurados_em is not null
    and o.lucro_liquido < 0
    and o.created_at > now() - make_interval(days => greatest(p_dias, 1))
  group by coalesce(o.user_product_id, o.product_id), o.product_name
  order by sum(o.lucro_liquido) asc;
end;
$$;

grant execute on function public.meus_anuncios_no_vermelho(integer) to authenticated;


-- ----------------------------------------------------------------------------
-- O aviso, uma vez, para quem está perdendo dinheiro agora
-- ----------------------------------------------------------------------------
-- Pessoal e com número: "seus anúncios" não move ninguém, "3 anúncios seus
-- perderam R$ 47" move.

do $$
declare
  r record;
begin
  for r in
    select
      o.user_id,
      count(distinct coalesce(o.user_product_id, o.product_id)) as anuncios,
      sum(o.lucro_liquido)::numeric(10, 2) as prejuizo
    from public.orders o
    where o.custos_apurados_em is not null
      and o.lucro_liquido < 0
      and o.created_at > now() - interval '90 days'
    group by o.user_id
  loop
    insert into public.avisos (
      titulo, corpo, link_rotulo, link_para, alvo_user_id, tipo, quantidade
    )
    select
      format('%s anúncio(s) seus estão vendendo no prejuízo', r.anuncios),
      format(
        'Nos últimos 90 dias, vendas suas fecharam %s no vermelho.%sO motivo é a conta: até hoje o FORNEXA estimava 12%% de taxa do Mercado Livre e nenhum frete abaixo de R$ 79. Medimos as vendas reais — a taxa fica entre 15%% e 19,5%%, e o frete aparece em todas as faixas, de R$ 7 a R$ 24 por unidade.%sA tela de publicar já usa os números certos. Os anúncios que já estão no ar continuam com o preço antigo: veja quais em Meus Anúncios e corrija o preço no Mercado Livre.',
        to_char(abs(r.prejuizo), 'FML999G999D99'),
        E'\n\n',
        E'\n\n'
      ),
      'Ver meus anúncios', '/dashboard/my-products',
      r.user_id, 'anuncio-no-vermelho', r.anuncios
    where not exists (
      select 1 from public.avisos a
      where a.alvo_user_id = r.user_id
        and a.tipo = 'anuncio-no-vermelho'
        and not exists (
          select 1 from public.avisos_lidos l
          where l.aviso_id = a.id and l.user_id = r.user_id
        )
    );
  end loop;
end;
$$;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Quantos foram avisados:
-- select count(*) from public.avisos where tipo = 'anuncio-no-vermelho';

-- Entrando como vendedor, o que ele vê:
-- select * from public.meus_anuncios_no_vermelho(90);
