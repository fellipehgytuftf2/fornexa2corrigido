-- Desfaz a liberação por confiança.
--
-- A ideia era o fornecedor deixar despachar sem esperar pagamento para quem já
-- tivesse pago N pedidos. O dono decidiu contra: quem exige pagamento
-- antecipado exige sempre, sem exceção por histórico.
--
-- A regra volta a ser a de antes, com duas condições e nada mais. A chave PIX,
-- que veio na mesma migração, fica — ela resolve outro problema.

drop function if exists public.fornecedor_define_recebimento(text, integer);

alter table public.suppliers
  drop column if exists libera_apos_pedidos_pagos;


/** O fornecedor cuida da própria chave PIX. */
create or replace function public.fornecedor_define_recebimento(p_chave_pix text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
  v_chave text;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem mudar isto';
  end if;

  v_chave := nullif(trim(coalesce(p_chave_pix, '')), '');

  update public.suppliers
  set chave_pix = v_chave
  where id = v_fornecedor;

  return jsonb_build_object('ok', true, 'chave_pix', v_chave);
end;
$$;

grant execute on function public.fornecedor_define_recebimento(text) to authenticated;


/**
 * Quem pode despachar. Duas condições, como sempre foi.
 *
 *   1. o fornecedor não exige pagamento antecipado
 *   2. este pedido já teve recebimento confirmado
 */
create or replace function public.pedido_liberado_para_despacho(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not coalesce(s.exige_pagamento_antecipado, false)
      or o.recebimento_confirmado_em is not null
  from public.orders o
  left join public.suppliers s on s.id = o.supplier_id
  where o.id = p_order_id;
$$;

grant execute on function public.pedido_liberado_para_despacho(uuid) to authenticated, service_role;
