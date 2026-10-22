-- O FORNEXA emite a DC-e sozinho, quando a venda chega.
--
-- POR QUE
--
-- Desde 06/04/2026 não se transporta mercadoria sem documento eletrônico. Sem
-- a DC-e o envio fica parado em `invoice_pending` e a etiqueta simplesmente não
-- existe — o fornecedor não tem o que imprimir, por mais que o pagamento já
-- tenha sido feito.
--
-- E há relógio: passados 3 dias corridos, o Mercado Livre cancela o pedido.
--
-- Até agora isso dependia de o vendedor SABER que a DC-e existe, LEMBRAR de
-- emitir e fazer isso dentro do prazo. Três coisas que a maioria nunca ouviu
-- falar. Esquecer não custava um aviso: custava a venda cancelada, com a
-- mercadoria já separada no galpão do fornecedor.
--
-- O QUE INCOMODA NISSO, E POR QUE MESMO ASSIM
--
-- O sistema passa a assinar um documento fiscal em nome de outra pessoa, sem
-- ela clicar nada. Não é bonito e não adianta fingir que é.
--
-- O que faz valer: é um documento que o vendedor é OBRIGADO a emitir de
-- qualquer jeito, sobre a venda dele. Não se decide nada no lugar dele — se
-- aperta um botão que ele teria que apertar. Ele vê que foi apertado, no
-- próprio pedido, e pode desligar.

alter table public.orders
  add column if not exists dce_emitida_em timestamptz,
  add column if not exists dce_emitida_pelo_sistema boolean not null default false;

comment on column public.orders.dce_emitida_em is
  'Quando a Declaração de Conteúdo eletrônica desta venda foi emitida no Mercado Livre.';

comment on column public.orders.dce_emitida_pelo_sistema is
  'true quando quem emitiu foi o FORNEXA, e não uma pessoa clicando no botão. O vendedor precisa saber disso: o documento sai no nome dele.';


-- Ligada por padrão, e é uma decisão, não um descuido.
--
-- Desligada por padrão pareceria mais respeitoso, e seria pior: quem não
-- entende o que é DC-e — a maioria — não ligaria, e continuaria perdendo venda
-- por prazo. O padrão precisa proteger quem não sabe que precisa de proteção.
alter table public.profiles
  add column if not exists dce_automatica boolean not null default true;

comment on column public.profiles.dce_automatica is
  'Quando falsa, o vendedor emite a DC-e na mão, pelo botão em Pedidos. Ligada por padrão.';
