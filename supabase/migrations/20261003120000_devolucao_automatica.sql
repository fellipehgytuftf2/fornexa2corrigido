-- A devolução abre sozinha quando o Mercado Livre diz que o pacote voltou.
--
-- POR QUE
--
-- A devolução só existia se o vendedor abrisse na mão. Mas ele descobre o
-- retorno pelo e-mail do Mercado Livre — ou não descobre: em 30/09 um pacote
-- voltou duas vezes e o produto se perdeu porque ninguém reagiu a tempo.
--
-- O FORNEXA já recebe o aviso de envio do Mercado Livre e lê o estado dele.
-- Quando esse estado vira "não entregue" ou "voltando para o remetente", o
-- pacote está a caminho do galpão do fornecedor — e isso é uma devolução,
-- tenha alguém percebido ou não.
--
-- O QUE ISTO NÃO COBRE
--
-- Devolução que o comprador abre depois de receber (arrependimento, defeito,
-- produto errado). Essa vive no canal de reclamações do Mercado Livre, que o
-- FORNEXA ainda não assina. Continua manual.
--
-- POR QUE UMA FUNÇÃO SEPARADA DA `registrar_devolucao`
--
-- Aquela roda no nome do vendedor e exige `auth.uid()`. Esta roda no webhook,
-- onde não há usuário logado — quem chama é o servidor, com a chave de
-- serviço.

create or replace function public.abrir_devolucao_automatica(
  p_ml_order_id text,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.orders;
  v_catalogo uuid;
  v_nova uuid;
begin
  if p_motivo not in (
    'arrependimento', 'nao_entregue', 'defeito', 'produto_errado', 'cancelado_flex'
  ) then
    return jsonb_build_object('ok', false, 'erro', 'motivo inválido');
  end if;

  select * into v_pedido
  from public.orders
  where ml_order_id = p_ml_order_id
  limit 1;

  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'pedido não encontrado');
  end if;

  -- Já existe devolução deste pedido: o aviso do Mercado Livre repete, e cada
  -- repetição não pode virar uma devolução nova.
  if exists (
    select 1 from public.devolucoes d where d.order_id = v_pedido.id
  ) then
    return jsonb_build_object('ok', true, 'ja_existia', true);
  end if;

  select up.catalog_product_id into v_catalogo
  from public.user_products up
  where up.id = coalesce(v_pedido.user_product_id, v_pedido.product_id);

  insert into public.devolucoes (
    order_id, user_id, supplier_id, catalog_product_id, motivo, prazo_cd
  )
  values (
    v_pedido.id,
    v_pedido.user_id,
    v_pedido.supplier_id,
    v_catalogo,
    p_motivo,
    public.dias_uteis_depois(current_date, 2)
  )
  returning id into v_nova;

  -- O gatilho `pedir_codigo_da_devolucao` cuida do aviso ao vendedor: é o
  -- mesmo caminho da devolução aberta na mão, e manter um só evita que um dos
  -- dois deixe de avisar algum dia.

  return jsonb_build_object('ok', true, 'devolucao_id', v_nova);
end;
$$;

revoke all on function public.abrir_devolucao_automatica(text, text) from public, anon, authenticated;
grant execute on function public.abrir_devolucao_automatica(text, text) to service_role;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Devoluções abertas sozinhas (as manuais vêm com código de devolução
-- preenchido pelo vendedor na maioria das vezes):
-- select motivo, count(*) from public.devolucoes
-- where codigo_devolucao is null group by motivo;
