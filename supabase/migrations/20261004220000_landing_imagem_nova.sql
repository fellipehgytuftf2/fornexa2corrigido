-- A imagem nova do hero da landing, em teste.
--
-- POR QUE EM TESTE
--
-- A landing é a primeira coisa que um comprador vê, e a única página que o
-- tráfego pago alcança. Trocar a imagem principal dela direto em produção é
-- mexer na vitrine com a loja cheia — e se ficar ruim, o prejuízo chega antes
-- do aviso.
--
-- COMO FUNCIONA NUMA PÁGINA PÚBLICA
--
-- A marca de teste depende de sessão, e visitante não tem. Isso faz o recorte
-- sozinho: quem chega pela internet continua vendo a imagem atual, e a conta
-- admin, navegando logada, vê a nova. Lançar continua sendo um clique em
-- Admin → Funcionalidades em teste.

insert into public.funcionalidades (chave, titulo, descricao)
values (
  'landing-imagem-nova',
  'Landing: imagem nova do hero',
  'Troca a imagem principal da página inicial pelo notebook com as caixas da Shopee e do Mercado Livre. Visitante não logado continua vendo a atual enquanto não for lançada.'
)
on conflict (chave) do nothing;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- select chave, para_todos from public.funcionalidades
-- where chave = 'landing-imagem-nova';
