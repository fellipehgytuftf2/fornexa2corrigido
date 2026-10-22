-- O fornecedor libera a própria etiqueta barrada, sem passar pelo dono.
--
-- POR QUE
--
-- A trava de remetente existe para o pacote não sair declarando o endereço do
-- vendedor — é para lá que a devolução volta. Mas ela pega bastante, e quase
-- todo dia o fornecedor manda o pedido para o dono liberar pelo painel de
-- admin. Duas pessoas e uma espera, para uma decisão que quem está no galpão
-- toma olhando a cidade de origem.
--
-- Agora ele libera no próprio Portal: um botão no pedido barrado, um clique,
-- pronto.
--
-- SÓ O QUE ESTÁ BARRADO
--
-- A liberação exige que o bloqueio tenha acontecido de verdade — existe
-- registro no log, gravado quando ele clicou em baixar a etiqueta e o Mercado
-- Livre devolveu uma origem diferente da cidade dele. Sem isso, o botão
-- liberaria pedido que nunca foi travado, e a trava deixaria de existir.
--
-- E SÓ O PEDIDO DELE
--
-- `current_supplier_id()` é a mesma porta do resto do Portal.

create or replace function public.fornecedor_libera_remetente(p_pedido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
  v_barrado boolean;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem liberar por aqui';
  end if;

  -- O pedido é dele e foi mesmo barrado pela trava de endereço.
  select exists (
    select 1
    from public.orders o
    where o.id = p_pedido_id
      and o.supplier_id = v_fornecedor
      and o.remetente_liberado_em is null
      and exists (
        select 1
        from public.log_integracao_ml l
        where l.contexto = 'supplier-order-label'
          and l.detalhes->>'pedido_id' = o.id::text
          and l.detalhes->>'bloqueado' = 'true'
      )
  ) into v_barrado;

  if not v_barrado then
    return jsonb_build_object('ok', false, 'erro', 'Este pedido não está travado pelo endereço.');
  end if;

  update public.orders
  set remetente_liberado_em = now(),
      updated_at = now()
  where id = p_pedido_id
    and supplier_id = v_fornecedor;

  -- Quem liberou fica registrado: na tela do dono, a mesma lista passa a
  -- distinguir o que ele liberou do que o fornecedor liberou sozinho.
  insert into public.log_integracao_ml (contexto, mensagem, detalhes)
  values (
    'supplier-order-label',
    'Remetente liberado pelo fornecedor',
    jsonb_build_object(
      'pedido_id', p_pedido_id::text,
      'liberado_por', 'fornecedor',
      'supplier_id', v_fornecedor::text
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.fornecedor_libera_remetente(uuid) from public, anon;
grant execute on function public.fornecedor_libera_remetente(uuid) to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Liberações feitas pelo fornecedor:
-- select criado_em, detalhes->>'pedido_id' as pedido
-- from public.log_integracao_ml
-- where mensagem = 'Remetente liberado pelo fornecedor'
-- order by criado_em desc limit 10;
