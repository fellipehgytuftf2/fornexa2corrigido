-- O endereço que vai na etiqueta.
--
-- A etiqueta e a DC-e saem com o endereço que o vendedor cadastrou no Mercado
-- Livre — o dele. Só que a caixa parte do galpão do fornecedor: o pacote sai de
-- São Paulo declarando origem no Rio.
--
-- Isso não é detalhe de aparência. O endereço do remetente é para onde a
-- devolução volta, e é o que o Correios confere na postagem. Errado, a
-- devolução vai parar na casa do vendedor, que não tem o que fazer com ela — e
-- o "parados no CD" que o FORNEXA controla deixa de bater com a realidade.
--
-- O conserto é no Mercado Livre, em Configurações → Meu perfil → Endereços,
-- e quem faz é o vendedor. O que faltava era ele TER o
-- endereço: o FORNEXA mostrava só a cidade do fornecedor, de propósito.
--
-- Então o fornecedor passa a cadastrar o endereço completo, e o vendedor
-- passa a vê-lo — mas só o de fornecedor cujos produtos ele já publicou. Quem
-- nunca anunciou nada continua sem ver endereço de ninguém.
--
-- ARMADILHA DE PRAZO: depois que a etiqueta é impressa, o Mercado Livre não
-- deixa mais mudar o endereço. Tem que ser configurado ANTES da primeira
-- etiqueta, e é isso que a tela precisa dizer.

alter table public.suppliers
  add column if not exists cep text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists bairro text,
  add column if not exists complemento text;

comment on column public.suppliers.cep is
  'Endereço de origem das etiquetas. O vendedor cadastra este endereço como remetente no marketplace.';


/** O fornecedor cadastra o endereço de onde as encomendas saem. */
create or replace function public.fornecedor_define_endereco(
  p_cep text,
  p_logradouro text,
  p_numero text,
  p_bairro text,
  p_complemento text,
  p_cidade text,
  p_estado text
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
  set cep = nullif(trim(coalesce(p_cep, '')), ''),
      logradouro = nullif(trim(coalesce(p_logradouro, '')), ''),
      numero = nullif(trim(coalesce(p_numero, '')), ''),
      bairro = nullif(trim(coalesce(p_bairro, '')), ''),
      complemento = nullif(trim(coalesce(p_complemento, '')), ''),
      city = coalesce(nullif(trim(coalesce(p_cidade, '')), ''), city),
      state = coalesce(nullif(trim(coalesce(p_estado, '')), ''), state)
  where id = v_fornecedor;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.fornecedor_define_endereco(
  text, text, text, text, text, text, text
) to authenticated;


/**
 * Os endereços que o vendedor precisa cadastrar no marketplace.
 *
 * Só de fornecedor cujos produtos ele já publicou. Publicar é o momento em que
 * ele se compromete com aquele fornecedor — e é também quando ele precisa do
 * endereço, antes da primeira venda gerar etiqueta. Antes disso, o catálogo
 * continua sem revelar quem é quem.
 *
 * Vem por função porque as políticas de `suppliers` não distinguem "fornecedor
 * de quem eu já publiquei" de "todos os outros".
 */
create or replace function public.enderecos_dos_meus_fornecedores()
returns table (
  supplier_id uuid,
  fornecedor text,
  cep text,
  logradouro text,
  numero text,
  bairro text,
  complemento text,
  cidade text,
  estado text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select distinct
    s.id,
    coalesce(nullif(s.company_name, ''), s.name),
    s.cep,
    s.logradouro,
    s.numero,
    s.bairro,
    s.complemento,
    s.city,
    s.state
  from public.suppliers s
  where exists (
    select 1
    from public.user_products up
    where up.supplier_id = s.id
      and up.user_id = auth.uid()
  );
end;
$$;

grant execute on function public.enderecos_dos_meus_fornecedores() to authenticated;
