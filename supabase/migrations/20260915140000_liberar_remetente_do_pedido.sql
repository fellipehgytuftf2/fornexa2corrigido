-- Liberação da trava do remetente, pedido a pedido.
--
-- POR QUE
--
-- A etiqueta é bloqueada quando o envio sairia declarando outra cidade como
-- remetente. A regra é certa para todos, e às vezes o dono decide que um caso
-- passa — vendedor em outra cidade do mesmo estado, venda que não pode esperar
-- a correção do endereço.
--
-- Afrouxar a regra (estado em vez de cidade) liberaria todo mundo. Esta coluna
-- libera só o pedido marcado, e fica registrado quem passou pela trava.
--
-- O QUE CUSTA
--
-- O remetente é para onde a devolução volta. Pedido liberado aqui devolve para
-- o endereço do vendedor, não para o galpão do fornecedor. Depois de impressa,
-- o Mercado Livre não deixa mudar.

alter table public.orders
  add column if not exists remetente_liberado_em timestamptz;

comment on column public.orders.remetente_liberado_em is
  'Liberação manual da trava de remetente. A etiqueta sai mesmo com a origem em outra cidade; a devolução volta ao endereço do vendedor.';
