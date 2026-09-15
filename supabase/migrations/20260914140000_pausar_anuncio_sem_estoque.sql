-- Anúncio de produto que o fornecedor não tem pausa no Mercado Livre, e volta
-- quando o estoque é reposto.
--
-- POR QUE
--
-- Ligar o controle de estoque esconde do catálogo o produto zerado. Isso
-- protege quem ainda vai publicar — e não faz nada por quem já publicou. No dia
-- em que o controle da MS Digital foi ligado, 1693 anúncios ativos eram de
-- produto com estoque zero. Cada um podia vender a qualquer momento, e quem
-- descobre é o comprador; a punição do marketplace cai sobre o vendedor.
--
-- Um aviso na tela não resolve: vende igual enquanto ninguém olha. Anúncio
-- pausado não vende.
--
-- O QUE O FORNEXA TOCA, E O QUE NÃO TOCA
--
-- Só reativa o que ele mesmo pausou. `pausado_sem_estoque_em` é essa marca.
-- Anúncio que o vendedor pausou por conta própria nunca é reativado por aqui.
--
-- QUEM DISPARA
--
-- A função `ml-pausar-sem-estoque`, chamada com a senha guardada abaixo. O
-- agendamento periódico fica fora desta migração, de propósito: é decisão
-- separada, ligada à parte.


-- ----------------------------------------------------------------------------
-- A marca
-- ----------------------------------------------------------------------------

alter table public.user_products
  add column if not exists pausado_sem_estoque_em timestamptz,
  add column if not exists pausa_tentada_em timestamptz,
  add column if not exists pausa_falha text;

comment on column public.user_products.pausado_sem_estoque_em is
  'Quando o FORNEXA pausou o anúncio no Mercado Livre por falta de estoque. Só anúncios com esta marca são reativados pelo FORNEXA.';

comment on column public.user_products.pausa_tentada_em is
  'Última tentativa que falhou. Segura novas tentativas por algumas horas, para um anúncio encerrado não ser cobrado a cada rodada.';

comment on column public.user_products.pausa_falha is
  'O que o Mercado Livre respondeu na última tentativa que falhou.';


-- ----------------------------------------------------------------------------
-- Quem pausar, quem reativar
-- ----------------------------------------------------------------------------
-- Só o servidor enxerga: é uma lista de anúncios de todos os vendedores.

create or replace function public.anuncios_para_pausar(p_limite integer)
returns table (id uuid, user_id uuid, ml_item_id text)
language sql
stable
security definer
set search_path = public
as $$
  select up.id, up.user_id, up.ml_item_id::text
  from public.user_products up
  join public.catalog_products p on p.id = up.catalog_product_id
  join public.suppliers s on s.id = p.supplier_id
  where s.controla_estoque
    and coalesce(p.stock, 0) <= 0
    and up.status = 'active'
    and up.ml_item_id is not null
    and up.pausado_sem_estoque_em is null
    and (up.pausa_tentada_em is null or up.pausa_tentada_em < now() - interval '6 hours')
  order by up.user_id
  limit p_limite;
$$;

create or replace function public.anuncios_para_reativar(p_limite integer)
returns table (id uuid, user_id uuid, ml_item_id text)
language sql
stable
security definer
set search_path = public
as $$
  select up.id, up.user_id, up.ml_item_id::text
  from public.user_products up
  join public.catalog_products p on p.id = up.catalog_product_id
  join public.suppliers s on s.id = p.supplier_id
  where up.pausado_sem_estoque_em is not null
    and up.ml_item_id is not null
    and (not s.controla_estoque or coalesce(p.stock, 0) > 0)
    and (up.pausa_tentada_em is null or up.pausa_tentada_em < now() - interval '6 hours')
  order by up.user_id
  limit p_limite;
$$;

revoke all on function public.anuncios_para_pausar(integer) from public, anon, authenticated;
revoke all on function public.anuncios_para_reativar(integer) from public, anon, authenticated;
grant execute on function public.anuncios_para_pausar(integer) to service_role;
grant execute on function public.anuncios_para_reativar(integer) to service_role;


-- ----------------------------------------------------------------------------
-- O que o vendedor vê
-- ----------------------------------------------------------------------------
-- Pausa sem explicação parece defeito. Esta é a explicação — só dos anúncios
-- dele, e sem dizer quem é o fornecedor.

create or replace function public.meus_anuncios_sem_estoque()
returns table (user_product_id uuid, pausado boolean)
language sql
stable
security definer
set search_path = public
as $$
  select up.id, up.pausado_sem_estoque_em is not null
  from public.user_products up
  left join public.catalog_products p on p.id = up.catalog_product_id
  left join public.suppliers s on s.id = p.supplier_id
  where up.user_id = auth.uid()
    and (
      up.pausado_sem_estoque_em is not null
      or (coalesce(s.controla_estoque, false) and coalesce(p.stock, 0) <= 0)
    );
$$;

revoke all on function public.meus_anuncios_sem_estoque() from public, anon;
grant execute on function public.meus_anuncios_sem_estoque() to authenticated;


-- ----------------------------------------------------------------------------
-- A senha da função
-- ----------------------------------------------------------------------------
-- A função não pede login de usuário. Sem senha, qualquer um que soubesse o
-- endereço dispararia a varredura. Gerada aqui, numa tabela que só o servidor
-- lê, e nunca escrita em arquivo.

create table if not exists public.segredos_internos (
  nome text primary key,
  valor text not null
);

alter table public.segredos_internos enable row level security;
revoke all on public.segredos_internos from public, anon, authenticated;
grant select on public.segredos_internos to service_role;

insert into public.segredos_internos (nome, valor)
values (
  'pausar-sem-estoque',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
on conflict (nome) do nothing;
