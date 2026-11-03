-- ============================================================================
-- Editar anúncio já publicado
-- ============================================================================
--
-- A função ml-editar-anuncio altera preço, título, descrição, fotos e pausa do
-- anúncio no Mercado Livre, e mantém a cópia em `user_products` em dia.
--
-- PAUSA DO VENDEDOR
--
-- `user_products.status` recusa 'paused' (ver o comentário em
-- ml-pausar-sem-estoque), e mexer nessa trava mexe em tudo que lê o status. A
-- pausa feita pelo vendedor ganha coluna própria, separada da pausa por falta
-- de estoque, que já tem a dela: as duas têm causas e saídas diferentes.

alter table public.user_products
  add column if not exists pausado_pelo_vendedor boolean not null default false;

comment on column public.user_products.pausado_pelo_vendedor is
  'O vendedor pausou o anúncio pela tela de edição. Volta a false quando ele reativa.';


-- ----------------------------------------------------------------------------
-- Nasce desligada
-- ----------------------------------------------------------------------------
-- Só a conta admin enxerga o botão Editar até a liberação em
-- Admin → Funcionalidades em teste.

insert into public.funcionalidades (chave, titulo, descricao)
values (
  'editar-anuncio',
  'Editar anúncio publicado',
  'Botão Editar em Meus Anúncios: muda preço, título (enquanto não houver venda), descrição, fotos e pausa do anúncio direto no Mercado Livre.'
)
on conflict (chave) do nothing;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) A coluna existe:
-- select column_name, data_type, column_default from information_schema.columns
-- where table_name = 'user_products' and column_name = 'pausado_pelo_vendedor';

-- (b) A funcionalidade existe e está fechada:
-- select chave, para_todos from public.funcionalidades where chave = 'editar-anuncio';

-- (c) Alterações recusadas pelo Mercado Livre:
-- select criado_em, mensagem, detalhes from public.log_integracao_ml
-- where contexto = 'ml-editar-anuncio' order by criado_em desc limit 20;
