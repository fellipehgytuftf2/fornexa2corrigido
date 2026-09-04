-- Duas mudanças que encurtam o caminho entre a venda e o despacho.
--
-- HOJE, para pagar R$ 17 ao fornecedor, o vendedor procura o WhatsApp dele,
-- pergunta a chave PIX, espera responder, digita a chave, digita o valor, paga,
-- manda comprovante, e ainda espera o fornecedor confirmar para a etiqueta
-- liberar. Oito passos por pedido. Com dez vendas no dia, oitenta.
--
-- 1. A CHAVE PIX FICA GUARDADA
--
-- O fornecedor cadastra a dele uma vez, no próprio Portal. Com a chave, o
-- FORNEXA monta o código PIX copia-e-cola já com o valor certo — o vendedor
-- cola no banco e paga. Some a busca pelo contato, a pergunta, e o erro de
-- digitação.
--
-- Quem digita é o fornecedor, nunca o admin: chave errada digitada por
-- terceiro manda dinheiro para estranho, e a responsabilidade tem que ser de
-- quem recebe.
--
-- Nenhum dinheiro passa pelo FORNEXA. O código é só texto; o PIX sai do banco
-- do vendedor direto para o do fornecedor.
--
-- 2. VENDEDOR CONHECIDO DEIXA DE ESPERAR
--
-- O pagamento antecipado existe porque fornecedor não confia em quem acabou de
-- chegar. Justo. Mas depois do quinto pedido pago em dia, essa desconfiança
-- vira só atraso — mercadoria parada esperando um PIX de quem sempre pagou.
--
-- O fornecedor escolhe o número. A partir dele, o vendedor despacha na hora e
-- acerta depois, como funciona no atacado de verdade.

alter table public.suppliers
  add column if not exists chave_pix text;

comment on column public.suppliers.chave_pix is
  'Chave PIX do fornecedor, digitada por ele no Portal. Usada para montar o código copia-e-cola do repasse.';

alter table public.suppliers
  add column if not exists libera_apos_pedidos_pagos integer;

comment on column public.suppliers.libera_apos_pedidos_pagos is
  'A partir de quantos pedidos pagos o vendedor despacha sem esperar o pagamento. Nulo = nunca libera antes.';


/**
 * O fornecedor cuida dos próprios dados de recebimento.
 *
 * Chave e regra de confiança andam juntas porque são a mesma decisão: como e
 * quando ele aceita receber.
 */
create or replace function public.fornecedor_define_recebimento(
  p_chave_pix text,
  p_libera_apos integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
  v_chave text;
  v_libera integer;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem mudar isto';
  end if;

  v_chave := nullif(trim(coalesce(p_chave_pix, '')), '');

  -- Zero e negativo viram nulo: "libera depois de 0 pedidos" seria o mesmo que
  -- não exigir pagamento nenhum, e essa decisão tem chave própria.
  v_libera := case
    when coalesce(p_libera_apos, 0) > 0 then p_libera_apos
    else null
  end;

  update public.suppliers
  set chave_pix = v_chave,
      libera_apos_pedidos_pagos = v_libera
  where id = v_fornecedor;

  return jsonb_build_object('ok', true, 'chave_pix', v_chave, 'libera_apos', v_libera);
end;
$$;

grant execute on function public.fornecedor_define_recebimento(text, integer) to authenticated;


/**
 * Quem pode despachar — agora com o histórico do vendedor no meio.
 *
 * A ordem das três condições é a ordem de custo: as duas primeiras respondem
 * sem contar nada, e só a terceira vai ao histórico.
 *
 *   1. o fornecedor não exige pagamento antecipado
 *   2. este pedido já teve recebimento confirmado
 *   3. este vendedor já pagou o suficiente para ser confiável
 *
 * A contagem olha para pedidos ANTERIORES pagos entre estes dois — não conta o
 * pedido atual, e não conta pedido de outro fornecedor. Confiança é uma coisa
 * entre duas partes.
 */
create or replace function public.pedido_liberado_para_despacho(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not coalesce(s.exige_pagamento_antecipado, false)
    or o.recebimento_confirmado_em is not null
    or (
      s.libera_apos_pedidos_pagos is not null
      and (
        select count(*)
        from public.orders anteriores
        where anteriores.user_id = o.user_id
          and anteriores.supplier_id = o.supplier_id
          and anteriores.id <> o.id
          and anteriores.pago_ao_fornecedor_em is not null
      ) >= s.libera_apos_pedidos_pagos
    )
  from public.orders o
  left join public.suppliers s on s.id = o.supplier_id
  where o.id = p_order_id;
$$;

grant execute on function public.pedido_liberado_para_despacho(uuid) to authenticated, service_role;
