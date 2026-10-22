-- Desfazer o pagamento desfaz o pagamento inteiro.
--
-- O QUE ESTAVA ERRADO
--
-- "Desmarcar pagamento" limpava só `pago_ao_fornecedor_em`, direto na tabela.
-- Mas confirmar um repasse escreve em três lugares: o status do lote, a data do
-- pagamento e `recebimento_confirmado_em` — a confirmação do fornecedor.
--
-- Resultado: o vendedor desmarcava, e no Portal continuava "Pagamento
-- confirmado em 08/09" com o botão de desfazer do outro lado. Pior que a
-- aparência: `recebimento_confirmado_em` é o que libera despacho quando o
-- fornecedor exige pagamento antecipado. O pedido seguia liberado por um
-- pagamento que o vendedor acabava de dizer que não houve.
--
-- POR QUE DESFAZER TAMBÉM A CONFIRMAÇÃO DO FORNECEDOR
--
-- A confirmação dele é sobre um pagamento específico. Retirado o pagamento,
-- ela perde o objeto — não é apagar o julgamento dele, é apagar a coisa
-- julgada. E o fornecedor vê a mudança na hora, com a etiqueta travando de
-- novo, que é exatamente o que precisa acontecer se o dinheiro não entrou.
--
-- POR QUE POR FUNÇÃO
--
-- Eram três escritas que precisam acontecer juntas, e a tela fazia uma só.
-- Regra de dinheiro em três tabelas não se escreve do navegador.

create or replace function public.desfazer_pagamento_do_pedido(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.orders%rowtype;
begin
  select * into v_pedido
  from public.orders o
  where o.id = p_order_id
    and o.user_id = auth.uid();

  if v_pedido.id is null then
    raise exception 'pedido não encontrado';
  end if;

  update public.orders
  set pago_ao_fornecedor_em = null,
      recebimento_confirmado_em = null
  where id = v_pedido.id;

  -- O lote volta a ficar aberto, para o próximo pagamento nascer no mesmo
  -- identificador em vez de deixar um lote quitado sem pagamento nenhum.
  if v_pedido.repasse_id is not null then
    update public.repasses
    set status = 'aberto',
        pago_em = null,
        confirmado_por = null
    where id = v_pedido.repasse_id;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.desfazer_pagamento_do_pedido(uuid) to authenticated;
