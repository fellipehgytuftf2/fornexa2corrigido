-- O vendedor declara que configurou o remetente, antes de poder publicar.
--
-- POR QUE ISTO EXISTE
--
-- A etiqueta sai com o endereço que o vendedor cadastrou no Mercado Livre. Em
-- dropshipping esse endereço precisa ser o do fornecedor, senão a devolução
-- volta para a casa de quem não tem o que fazer com ela.
--
-- Conferir de verdade só é possível depois da primeira venda: é o envio que
-- revela a origem, e o Mercado Livre mascara o resto (ver `ml-endereco-de-envio`).
-- Só que aí é tarde — o endereço daquele envio já está congelado, e o pedido
-- está pago com o prazo de cancelamento correndo.
--
-- Então o momento certo de cobrar é a publicação: o vendedor está mexendo na
-- loja, sem pedido pendurado, e a conta do Mercado Livre já está aberta.
--
-- O QUE ISTO É, E O QUE NÃO É
--
-- Não é prova. O CEP aparece na tela para copiar, e o vendedor pode digitá-lo
-- sem sair do lugar. É um passo obrigatório que o obriga a saber que essa
-- configuração existe — hoje a maioria não sabe — e que deixa registrado quem
-- declarou o quê e quando.
--
-- A prova vem na primeira venda, quando o envio revela a origem real. Bateu,
-- `confirmada_em` é preenchida e nunca mais se pergunta. Não bateu, a etiqueta
-- trava e o vendedor descobre que declarou uma coisa e configurou outra.

create table if not exists public.origem_declarada (
  user_id uuid primary key references auth.users(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  cep text not null,
  declarada_em timestamptz not null default now(),

  -- Preenchida quando um envio real confirma a origem. Enquanto for nula, a
  -- declaração é só palavra do vendedor.
  confirmada_em timestamptz,

  -- Preenchida quando um envio real desmente a declaração, com a cidade de
  -- onde o pacote realmente saiu. É o que a tela mostra para o vendedor
  -- entender que não é implicância: o pacote saiu de outro lugar.
  desmentida_em timestamptz,
  origem_no_envio text
);

comment on table public.origem_declarada is
  'Declaração do vendedor de que configurou o endereço do fornecedor como remetente no marketplace. Cobrada na publicação, verificada na primeira venda.';

alter table public.origem_declarada enable row level security;

-- O vendedor lê a própria declaração. Escrever é só pela função abaixo, que
-- confere o CEP contra o do fornecedor.
drop policy if exists "vendedor le a propria declaracao" on public.origem_declarada;
create policy "vendedor le a propria declaracao"
  on public.origem_declarada
  for select
  to authenticated
  using (user_id = auth.uid());


/**
 * O vendedor declara o CEP que configurou como remetente.
 *
 * O CEP precisa bater com o de algum fornecedor de quem ele já publicou — ou,
 * na primeira publicação, com o do fornecedor do produto que está publicando
 * agora. Digitar qualquer número não passa: erra o CEP, erra a configuração.
 */
create or replace function public.declarar_origem(
  p_supplier_id uuid,
  p_cep text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cep text;
  v_cep_do_fornecedor text;
begin
  if auth.uid() is null then
    raise exception 'faça login novamente';
  end if;

  v_cep := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g');

  if length(v_cep) <> 8 then
    return jsonb_build_object('ok', false, 'erro', 'O CEP precisa ter 8 dígitos.');
  end if;

  select regexp_replace(coalesce(s.cep, ''), '\D', '', 'g')
  into v_cep_do_fornecedor
  from public.suppliers s
  where s.id = p_supplier_id;

  if v_cep_do_fornecedor is null or v_cep_do_fornecedor = '' then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Este fornecedor ainda não cadastrou o endereço no Portal dele.'
    );
  end if;

  if v_cep <> v_cep_do_fornecedor then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Este não é o CEP do fornecedor. Confira o endereço mostrado acima.'
    );
  end if;

  insert into public.origem_declarada (user_id, supplier_id, cep)
  values (auth.uid(), p_supplier_id, v_cep)
  on conflict (user_id) do update
  set supplier_id = excluded.supplier_id,
      cep = excluded.cep,
      declarada_em = now(),
      -- Redeclarar apaga o desmentido: o vendedor está afirmando que arrumou,
      -- e a próxima venda dirá se é verdade.
      desmentida_em = null,
      origem_no_envio = null,
      confirmada_em = null;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.declarar_origem(uuid, text) to authenticated;
