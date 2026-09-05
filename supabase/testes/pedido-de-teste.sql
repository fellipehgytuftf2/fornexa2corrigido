-- ============================================================================
-- Pedido de teste
--
-- NÃO É MIGRAÇÃO. Fica fora de `migrations/` de propósito: é para rodar na mão
-- no SQL Editor quando se quer exercitar o fluxo de pedido, e nunca no deploy.
--
-- POR QUE ISTO EXISTE
--
-- O botão "Registrar venda" foi removido em 2026-08 porque criava pedidos com
-- compradores inventados e os mandava para o portal de um fornecedor REAL, que
-- quase separou e postou mercadoria para gente que não existe.
--
-- Testar continua sendo necessário. Só que agora contra o fornecedor de teste,
-- nunca contra Patrone ou MS Digital — tem gente de verdade olhando aquelas
-- telas.
--
-- ANTES DE RODAR
--
-- 1. Existir um fornecedor com "TESTE" no nome da empresa (Admin → Fornecedores)
-- 2. Ele ter acesso ao Portal criado
-- 3. Trocar o e-mail em `VENDEDOR` abaixo pelo da conta que vai testar
--
-- O e-mail importa: `abrir_repasse_do_pedido` só enxerga pedidos de quem está
-- logado. O admin vê todos os pedidos na tela, mas recebe "pedido não
-- encontrado" ao tentar pagar um que não é dele.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. LIMPAR o teste anterior
-- ----------------------------------------------------------------------------
-- O repasse sai primeiro: o pedido aponta para ele.

delete from public.repasses
where id in (
  select repasse_id from public.orders
  where product_name like 'PEDIDO DE TESTE%'
    and repasse_id is not null
);

delete from public.orders
where product_name like 'PEDIDO DE TESTE%';


-- ----------------------------------------------------------------------------
-- 2. CRIAR um pedido novo
-- ----------------------------------------------------------------------------
-- `product_image_url` recebe '' e não null: a coluna é NOT NULL, e o cartão
-- trata texto vazio mostrando o ícone de pacote.
--
-- R$ 10,00 de propósito. Se alguém resolver pagar o PIX de verdade para testar
-- ponta a ponta, é dinheiro pequeno indo para a própria conta.

with alvo as (
  select
    (select id from public.profiles
      where email = 'akira.vha@gmail.com') as vendedor,

    -- O fornecedor de teste, e só ele. `ilike '%TESTE%'` é a trava que impede
    -- este arquivo de criar pedido falso para fornecedor real por descuido.
    (select id from public.suppliers
      where company_name ilike '%TESTE%'
      order by created_at desc
      limit 1) as fornecedor
)
insert into public.orders (
  user_id, supplier_id,
  product_name, product_image_url,
  customer_name, customer_email, customer_phone, customer_address,
  supplier_price, sale_price, profit, quantidade,
  status, marketplace
)
select
  alvo.vendedor, alvo.fornecedor,
  'PEDIDO DE TESTE - Produto Fictício', '',
  'Comprador de Teste', 'teste@exemplo.com', '00000000000',
  'Rua de Teste, 1, Cidade de Teste, SP',
  10.00, 25.00, 15.00, 1,
  'pending', 'Mercado Livre'
from alvo
-- Sem os dois, não insere nada em vez de inserir um pedido órfão. `0 rows`
-- significa que o e-mail ou o fornecedor de teste não foram encontrados.
where alvo.vendedor is not null
  and alvo.fornecedor is not null;


-- ============================================================================
-- TRECHOS AVULSOS — rode só quando precisar
-- ============================================================================

-- Exercitar a trava de pagamento antecipado, que é como a MS Digital opera:
-- endereço e etiqueta ficam ocultos até o fornecedor confirmar o recebimento.
--
--   update public.suppliers
--   set exige_pagamento_antecipado = true
--   where company_name ilike '%TESTE%';

-- Simular a entrega. O Mercado Livre é quem faz isso na vida real, e o pedido
-- de teste não existe lá.
--
--   update public.orders
--   set status = 'delivered'
--   where product_name like 'PEDIDO DE TESTE%';

-- Refazer a confirmação de recebimento. `confirmar_repasse` sai cedo quando o
-- repasse já está pago, então é preciso reabri-lo para testar de novo.
--
--   update public.repasses
--   set status = 'aberto', pago_em = null, confirmado_por = null
--   where id in (
--     select repasse_id from public.orders
--     where product_name like 'PEDIDO DE TESTE%'
--   );

-- Ver em que pé está o teste, sem abrir a tela.
--
--   select
--     o.product_name,
--     o.status,
--     o.pago_ao_fornecedor_em,
--     o.recebimento_confirmado_em,
--     o.comprovante_path,
--     r.txid,
--     r.status as repasse
--   from public.orders o
--   left join public.repasses r on r.id = o.repasse_id
--   where o.product_name like 'PEDIDO DE TESTE%';
