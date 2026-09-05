-- Confirmar recebimento não gravava nada quando o vendedor já tinha declarado.
--
-- `confirmar_repasse` carimbava os pedidos assim:
--
--   where o.repasse_id = ... and o.pago_ao_fornecedor_em is null
--
-- O filtro nasceu quando o aviso do banco podia chegar antes de o vendedor
-- declarar: nesse caso, confirmar o repasse era também registrar o pagamento.
--
-- Depois o fluxo mudou. O fornecedor só passa a ver o pagamento DEPOIS da
-- declaração do vendedor — então, na hora de confirmar, `pago_ao_fornecedor_em`
-- está sempre preenchido, e o filtro excluía justamente o pedido que se queria
-- confirmar. O repasse virava 'pago', a tela dizia "recebimento confirmado", e
-- `recebimento_confirmado_em` continuava nulo: o carimbo do fornecedor, que é o
-- único registro que não depende da palavra de quem deve, nunca era gravado.
--
-- O filtro sai. O `coalesce` no lugar dele guarda a data original — reconfirmar
-- não reescreve quando o dinheiro saiu.

create or replace function public.confirmar_repasse(
  p_txid text,
  p_origem text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repasse public.repasses;
  v_pedidos integer;
begin
  select * into v_repasse
  from public.repasses r
  where r.txid = p_txid;

  if v_repasse.id is null then
    raise exception 'repasse não encontrado';
  end if;

  -- Aviso repetido do banco é normal, e não pode quitar duas vezes nem
  -- reescrever a data do pagamento original.
  if v_repasse.status = 'pago' then
    return jsonb_build_object('ok', true, 'ja_estava_pago', true);
  end if;

  update public.repasses
  set status = 'pago',
      pago_em = now(),
      confirmado_por = coalesce(nullif(trim(p_origem), ''), 'manual')
  where repasses.id = v_repasse.id;

  update public.orders o
  set pago_ao_fornecedor_em = coalesce(o.pago_ao_fornecedor_em, now()),
      recebimento_confirmado_em = coalesce(o.recebimento_confirmado_em, now())
  where o.repasse_id = v_repasse.id;

  get diagnostics v_pedidos = row_count;

  return jsonb_build_object('ok', true, 'pedidos', v_pedidos, 'valor', v_repasse.valor);
end;
$$;

grant execute on function public.confirmar_repasse(text, text) to service_role;
revoke execute on function public.confirmar_repasse(text, text) from authenticated;
