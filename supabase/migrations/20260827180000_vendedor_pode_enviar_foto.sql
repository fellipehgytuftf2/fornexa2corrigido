-- Qualquer conta logada pode enviar foto.
--
--   "new row violates row-level security policy"
--
-- O bucket `product-images` nasceu para o Admin subir as fotos do catálogo, e
-- a permissão de gravar ficou só com ele. Depois a tela de publicar ganhou o
-- botão "Adicionar" — e ninguém deu aos vendedores o direito que o botão
-- exige. Do lado deles, o botão existia e simplesmente não funcionava.
--
-- Foto extra importa: anúncio com uma imagem só converte pior, e quem sabe
-- qual foto vende o produto é quem está vendendo.
--
-- SOBRE O RISCO
--
-- A permissão é de INSERT apenas. Não vem UPDATE nem DELETE junto, e a tela
-- envia com `upsert: false` — então ninguém sobrescreve nem apaga arquivo de
-- ninguém. O que se pode fazer é acrescentar arquivo novo, com nome sorteado.
--
-- Trocar a foto de um produto do catálogo, que era a preocupação real,
-- continua exigindo UPDATE, que ninguém tem.

drop policy if exists "vendedor envia foto de anuncio" on storage.objects;
drop policy if exists "conta logada envia foto" on storage.objects;

create policy "conta logada envia foto"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'product-images');
