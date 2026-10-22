-- A categoria do Mercado Livre aprendida por categoria do catálogo.
--
-- O QUE QUEBROU
--
-- Em 22/10/2026 o Mercado Livre parou de responder a pergunta "qual a
-- categoria deste produto": `domain_discovery` devolve `[]` para tudo — até
-- para "celular" —, e a busca e a árvore de categorias passaram a responder
-- 403 para a aplicação. Nenhum vendedor conseguiu publicar.
--
-- A primeira saída foi copiar a categoria de um anúncio já publicado DO MESMO
-- produto. Funciona, e resolveu a maioria — mas não serve para produto que
-- ninguém publicou ainda, que é justamente o produto novo do catálogo.
--
-- O QUE ISTO GUARDA
--
-- Uma categoria do Mercado Livre para cada categoria do catálogo
-- ("Utilidades P Lar", "Ferramentas", "Acessórios para Veículos"). São
-- poucas, e o próprio histórico diz qual é cada uma: produto de "Ferramentas"
-- já publicado por alguém carrega a categoria certa dentro do anúncio.
--
-- POR QUE NÃO É PERFEITO, E MESMO ASSIM VALE
--
-- Categoria de catálogo é mais larga que categoria do Mercado Livre: dentro de
-- "Utilidades P Lar" cabe panela e cabe vassoura, que lá são categorias
-- diferentes. O anúncio sai numa categoria aproximada, e o vendedor ajusta no
-- Mercado Livre se quiser.
--
-- É pior que a categoria exata e muito melhor que não publicar — que é onde
-- estávamos.

create table if not exists public.categorias_do_ml (
  categoria text primary key,
  ml_category_id text not null,

  -- Quantos anúncios sustentaram essa escolha. Um só é palpite; vinte é
  -- padrão. Guardado para a tela de admin poder mostrar confiança.
  anuncios integer not null default 1,

  atualizado_em timestamptz not null default now()
);

comment on table public.categorias_do_ml is
  'Categoria do Mercado Livre usada ao publicar produto de cada categoria do catálogo. Aprendida dos anúncios já publicados; serve de reserva quando a API deles não responde.';

alter table public.categorias_do_ml enable row level security;

-- Leitura liberada para quem está logado: a publicação consulta isto, e não
-- há nada aqui que não esteja num anúncio público.
drop policy if exists "categorias_do_ml_leitura" on public.categorias_do_ml;

create policy "categorias_do_ml_leitura"
  on public.categorias_do_ml
  for select
  to authenticated
  using (true);


/** Grava o que a função de publicação aprendeu de um anúncio real. */
create or replace function public.aprender_categoria_do_ml(
  p_categoria text,
  p_ml_category_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(p_categoria), '') = '' or coalesce(btrim(p_ml_category_id), '') = '' then
    return;
  end if;

  insert into public.categorias_do_ml (categoria, ml_category_id)
  values (btrim(p_categoria), btrim(p_ml_category_id))
  on conflict (categoria) do update
    set anuncios = public.categorias_do_ml.anuncios + 1,
        atualizado_em = now(),
        -- A categoria mais recente vence: se o Mercado Livre reorganizar a
        -- árvore, o aprendizado acompanha em vez de ficar preso no antigo.
        ml_category_id = excluded.ml_category_id;
end;
$$;

revoke all on function public.aprender_categoria_do_ml(text, text) from public, anon;
grant execute on function public.aprender_categoria_do_ml(text, text) to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- O que já foi aprendido:
-- select categoria, ml_category_id, anuncios, atualizado_em
-- from public.categorias_do_ml order by anuncios desc;
