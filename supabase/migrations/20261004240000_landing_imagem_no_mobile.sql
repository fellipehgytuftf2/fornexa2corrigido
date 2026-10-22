-- A imagem do hero aparecendo no celular, em teste.
--
-- POR QUE
--
-- A coluna visual do hero é escondida abaixo de 1024px desde o começo. No
-- celular — de onde vem a maior parte do tráfego de anúncio — a primeira tela
-- é texto e botão, e a pessoa decide assinar sem nunca ter visto o produto. O
-- concorrente mostra; nós não.
--
-- POR QUE UMA MARCA SEPARADA DA IMAGEM NOVA
--
-- São duas perguntas diferentes: qual imagem mostrar, e se ela aparece no
-- celular. Juntas numa marca só, lançar uma obrigaria a lançar a outra — e
-- descobrir qual das duas piorou a conversão ficaria impossível.

insert into public.funcionalidades (chave, titulo, descricao)
values (
  'landing-imagem-no-mobile',
  'Landing: imagem do hero no celular',
  'Mostra a imagem principal da página inicial também no celular e no tablet, abaixo do texto. Hoje ela só aparece a partir de 1024px de largura.'
)
on conflict (chave) do nothing;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- select chave, titulo, para_todos from public.funcionalidades
-- where chave like 'landing-%';
