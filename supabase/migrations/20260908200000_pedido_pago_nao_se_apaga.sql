-- Pedido com dinheiro andado não se apaga.
--
-- O botão "Excluir" continuava ao lado de um pedido pago e confirmado. Um
-- clique levava embora o registro do pagamento, o caminho do comprovante e a
-- confirmação do fornecedor — tudo o que sobrava para provar que aquele
-- dinheiro saiu e chegou.
--
-- E o estrago não é só do vendedor: o fornecedor confirmou o recebimento
-- daquele pedido, e o pedido some da tela dele sem explicação.
--
-- Excluir existe para pedido que nasceu errado e nunca andou. Depois que o
-- dinheiro entra na história, o que se faz é cancelar, não apagar.
--
-- POR GATILHO, E NÃO POR POLICY
--
-- A exclusão é um DELETE direto do vendedor, com RLS decidindo se a linha é
-- dele. RLS responde "é seu?", não "pode sumir?". Esta segunda pergunta é de
-- regra de negócio, e regra de negócio que só existe na tela é sugestão.

create or replace function public.pedido_pago_nao_se_apaga()
returns trigger
language plpgsql
as $$
begin
  if old.recebimento_confirmado_em is not null then
    raise exception 'O fornecedor já confirmou o recebimento deste pedido. Ele não pode ser excluído.';
  end if;

  if old.pago_ao_fornecedor_em is not null then
    raise exception 'Este pedido já consta como pago ao fornecedor. Desmarque o pagamento antes de excluir.';
  end if;

  return old;
end;
$$;

drop trigger if exists pedido_pago_travado on public.orders;

create trigger pedido_pago_travado
before delete on public.orders
for each row
execute function public.pedido_pago_nao_se_apaga();
