-- Horário de corte e avisos do fornecedor.
--
-- A MS Digital opera com dois cortes: 13h para etiqueta normal (Correios e
-- coleta) e 11h para Flex. Passou do horário, o pedido só sai no dia seguinte.
-- E quem for despachar Flex precisa ter cadastro na transportadora J3 antes —
-- não é algo que se resolva na hora do despacho.
--
-- Nada disso existia no sistema. Ficava no WhatsApp, e todo vendedor novo
-- descobria errando: mandava o pedido às 14h achando que sairia no mesmo dia, e
-- o comprador recebia um dia depois do prometido no anúncio.
--
-- Duas colunas de horário, e um texto livre para o resto. O texto é
-- deliberadamente aberto: cada fornecedor tem uma regra que ninguém previu, e
-- criar uma coluna por regra é como o cadastro incha até ninguém preencher.

alter table public.suppliers
  add column if not exists horario_corte time;

comment on column public.suppliers.horario_corte is
  'Até que horas o pedido ainda sai no mesmo dia, por etiqueta normal. Nulo = o fornecedor não trabalha com corte.';

alter table public.suppliers
  add column if not exists horario_corte_flex time;

comment on column public.suppliers.horario_corte_flex is
  'Corte do Flex, quase sempre mais cedo que o normal. Nulo = não faz Flex.';

alter table public.suppliers
  add column if not exists avisos text;

comment on column public.suppliers.avisos is
  'Regras que o vendedor precisa saber antes de vender: cadastro em transportadora, dias sem expediente, pedido mínimo. Texto livre porque cada fornecedor tem a sua.';


/**
 * O fornecedor define como opera.
 *
 * Horários e avisos andam juntos porque respondem a mesma pergunta do
 * vendedor: até quando eu mando, e o que preciso saber antes.
 */
create or replace function public.fornecedor_define_operacao(
  p_corte time,
  p_corte_flex time,
  p_avisos text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem mudar isto';
  end if;

  update public.suppliers
  set horario_corte = p_corte,
      horario_corte_flex = p_corte_flex,
      avisos = nullif(trim(coalesce(p_avisos, '')), '')
  where id = v_fornecedor;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.fornecedor_define_operacao(time, time, text) to authenticated;
