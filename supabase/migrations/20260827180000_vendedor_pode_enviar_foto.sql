-- O vendedor não conseguia acrescentar foto ao próprio anúncio.
--
--   "new row violates row-level security policy"
--
-- O bucket `product-images` nasceu para o Admin subir as fotos do catálogo, e
-- a permissão de gravar ficou só com ele. Depois a tela de publicar ganhou o
-- botão "Adicionar" — e ninguém deu ao vendedor o direito que o botão exige.
-- Do lado dele, o botão existia e simplesmente não funcionava.
--
-- Foto extra importa: anúncio com uma imagem só converte pior, e o vendedor é
-- quem sabe qual foto vende o produto dele.
--
-- A permissão é estreita de propósito. Só gravar, só neste bucket, e só dentro
-- da pasta `anuncio/` — que é para onde a tela envia. As fotos do catálogo,
-- que ficam na raiz do bucket, continuam sendo assunto do Admin: sem isto, um
-- vendedor poderia trocar a imagem de um produto do catálogo inteiro.

drop policy if exists "vendedor envia foto de anuncio" on storage.objects;

create policy "vendedor envia foto de anuncio"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = 'anuncio'
  );
