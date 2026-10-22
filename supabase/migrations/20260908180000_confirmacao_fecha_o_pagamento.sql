-- Confirmado pelo fornecedor, o pagamento está fechado.
--
-- POR QUE
--
-- Enquanto os dois lados podiam mexer depois da confirmação, existia isto: o
-- fornecedor confere o comprovante, confirma, e o vendedor troca o arquivo em
-- seguida. O que ficou guardado não é o que foi conferido — e ninguém percebe,
-- porque a tela continua dizendo "confirmado".
--
-- Desmarcar o pagamento depois da confirmação tem o mesmo problema pelo outro
-- lado: retira o dinheiro de um acerto que a outra parte já deu por encerrado.
--
-- Confirmar é o fim da conversa sobre aquele dinheiro. Depois dela o
-- comprovante continua à vista dos dois — só ninguém mexe mais.
--
-- E SE ALGUÉM CONFIRMAR POR ENGANO
--
-- Aí é caso de suporte, e é de propósito. Uma porta de desfazer aberta aos dois
-- lados é o que permitia o problema acima; fechada, o engano raro vira uma
-- conversa, que é o custo certo a pagar. O admin desfaz pelo banco.

/**
 * O vendedor desfaz o pagamento — enquanto o fornecedor não tiver confirmado.
 */
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

  if v_pedido.recebimento_confirmado_em is not null then
    return jsonb_build_object(
      'ok', false,
      'erro', 'O fornecedor já confirmou que recebeu este pagamento. Fale com ele antes de mudar qualquer coisa.'
    );
  end if;

  update public.orders
  set pago_ao_fornecedor_em = null,
      recebimento_confirmado_em = null
  where id = v_pedido.id;

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


/**
 * O fornecedor confirma o recebimento — e confirmar não tem volta.
 *
 * O parâmetro `p_confirmado` continua existindo para não quebrar quem chama a
 * função, mas desfazer passa a ser recusado: a confirmação é o que libera
 * mercadoria do outro lado, e voltar atrás depois disso deixa os dois lados
 * contando histórias diferentes sobre o mesmo dinheiro.
 */
create or replace function public.fornecedor_confirma_recebimento(
  p_order_id uuid,
  p_confirmado boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
  v_pedido public.orders%rowtype;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem confirmar recebimento';
  end if;

  select * into v_pedido
  from public.orders
  where id = p_order_id;

  if v_pedido.id is null then
    raise exception 'pedido não encontrado';
  end if;

  if v_pedido.supplier_id <> v_fornecedor then
    raise exception 'este pedido não é seu';
  end if;

  if not p_confirmado then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Confirmação de recebimento não pode ser desfeita. Se houve engano, fale com o suporte do FORNEXA.'
    );
  end if;

  update public.orders
  set recebimento_confirmado_em = coalesce(recebimento_confirmado_em, now())
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'confirmado', true);
end;
$$;

grant execute on function public.fornecedor_confirma_recebimento(uuid, boolean) to authenticated;


/**
 * O comprovante não muda depois de conferido.
 *
 * A troca do arquivo é um UPDATE direto do vendedor em `orders`. Sem esta
 * trava, ele conferia um comprovante e guardava outro — e a tela seguiria
 * dizendo "confirmado" sobre um arquivo que ninguém viu.
 */
create or replace function public.comprovante_nao_muda_apos_confirmacao()
returns trigger
language plpgsql
as $$
begin
  if old.recebimento_confirmado_em is not null
     and new.comprovante_path is distinct from old.comprovante_path then
    raise exception 'O fornecedor já confirmou este pagamento. O comprovante não pode mais ser trocado.';
  end if;

  return new;
end;
$$;

drop trigger if exists comprovante_travado_apos_confirmacao on public.orders;

create trigger comprovante_travado_apos_confirmacao
before update on public.orders
for each row
execute function public.comprovante_nao_muda_apos_confirmacao();
