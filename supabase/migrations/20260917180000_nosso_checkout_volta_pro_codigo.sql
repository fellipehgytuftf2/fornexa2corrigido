-- Desfaz `configuracoes_checkout`.
--
-- Ela nasceu de um mal-entendido de um dia atrás: a ideia era deixar o nosso
-- checkout editável por tela. Não é o que se quer. O checkout da empresa é
-- decisão de código — muda com deploy, com revisão, com histórico — e não um
-- campo de texto que qualquer admin logado troca sem querer e derruba a venda
-- de todo mundo que chega pela landing.
--
-- Ele volta para `VITE_CHECKOUT_BASICO` / `VITE_CHECKOUT_PREMIUM`.
--
-- O que se configura por tela é só o checkout DE CADA AFILIADO, na tabela
-- `afiliados` — esse sim muda toda semana, conforme entra e sai parceiro, e
-- não faz sentido pedir deploy para cada um.

drop table if exists public.configuracoes_checkout;
