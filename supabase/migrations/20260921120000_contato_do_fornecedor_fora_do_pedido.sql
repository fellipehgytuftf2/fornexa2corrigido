-- O contato do fornecedor sai de dentro do pedido.
--
-- POR QUE
--
-- Um vendedor chegou no WhatsApp do fornecedor e foi perguntar direto sobre
-- estoque e produtos novos. O fornecedor mandou print para o dono. Ninguém
-- passou o número: ele saía do próprio FORNEXA.
--
-- Eram dois caminhos, e os dois já foram fechados no código:
--
--   1. A tela de Pedidos buscava `suppliers.whatsapp` e montava um botão
--      "Abrir WhatsApp" que conversava direto com o fornecedor. Era o caminho
--      fácil — não precisava nem de curiosidade.
--   2. Cada pedido guarda uma CÓPIA do contato em `orders.supplier_whatsapp`
--      e `orders.supplier_email`, congelada no dia da venda. A linha de
--      `orders` é do vendedor, e tudo que está nela ele consegue ler.
--
-- O código parou de gravar a cópia. Esta migração limpa a que já existe —
-- sem ela, todo pedido antigo continua carregando o número.
--
-- O QUE NÃO MUDA
--
-- As colunas continuam existindo, vazias. Apagá-las quebraria os `select` que
-- ainda as listam e não esconderia nada a mais. O Admin segue vendo o contato
-- em Gestão do Catálogo, que lê a tabela `suppliers` direto — é lá que ele
-- deve viver.

update public.orders
   set supplier_whatsapp = '',
       supplier_email = ''
 where coalesce(supplier_whatsapp, '') <> ''
    or coalesce(supplier_email, '') <> '';


-- ============================================================================
-- VERIFICAÇÃO — rode depois e confira os resultados
-- ============================================================================

-- (a) Não pode sobrar nenhum pedido com contato do fornecedor. Precisa vir 0.
-- select count(*)
-- from public.orders
-- where coalesce(supplier_whatsapp, '') <> ''
--    or coalesce(supplier_email, '') <> '';

-- (b) FALTA CONFERIR — quem pode ler a tabela `suppliers`?
--
-- A limpeza acima fecha a cópia dentro do pedido, e o código fechou a tela.
-- Falta saber se um vendedor comum ainda alcança `suppliers.whatsapp` fazendo
-- a consulta na mão (o Supabase aceita qualquer select que a policy permitir,
-- não só os que nossas telas fazem).
--
-- Se aparecer aqui uma policy de SELECT para `authenticated` com `qual` amplo
-- (true, ou "tem plano ativo"), o número continua a uma consulta de distância
-- e vale um segundo passo: expor `suppliers` ao vendedor por uma view ou
-- função com só as colunas que ele precisa — nome, cidade, prazo, chave PIX,
-- horário de corte, avisos.
--
-- select policyname, cmd, roles, qual
-- from pg_policies
-- where schemaname = 'public' and tablename = 'suppliers'
-- order by policyname;
