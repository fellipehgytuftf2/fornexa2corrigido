-- A liberação da trava de remetente passa a ser botão, não SQL.
--
-- POR QUE
--
-- Toda vez que um vendedor pedia a etiqueta e a trava de endereço pegava, o
-- dono precisava pedir para alguém rodar um `update` no banco. Duas pessoas
-- para uma decisão que é só dele, e que ele toma em segundos olhando de onde o
-- pacote sairia.
--
-- O QUE A LISTA MOSTRA
--
-- Só pedido que a trava REALMENTE barrou — o registro de bloqueio existe no
-- log, com a cidade que sairia na etiqueta e a cidade do fornecedor. Listar
-- "pedidos que poderiam ser barrados" seria adivinhação: o sistema só sabe a
-- origem depois de perguntar ao Mercado Livre, e ele pergunta na hora em que o
-- fornecedor clica em Baixar etiqueta.
--
-- O QUE CUSTA LIBERAR
--
-- O remetente é para onde a devolução volta. Liberado, o pacote sai declarando
-- o endereço do vendedor, e devolução bate na casa dele em vez do galpão.
-- Depois de impressa, o Mercado Livre não deixa mais mudar.


create or replace function public.admin_pedidos_travados_no_remetente()
returns table (
  pedido_id uuid,
  criado_em timestamptz,
  status text,
  vendedor text,
  email text,
  fornecedor text,
  origem_no_ml text,
  cidade_do_fornecedor text,
  liberado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  return query
  with barrado as (
    -- O último bloqueio de cada pedido: se o vendedor corrigiu o endereço e
    -- tentou de novo, é a tentativa mais recente que vale.
    select distinct on (l.detalhes->>'pedido_id')
      (l.detalhes->>'pedido_id')::uuid as pedido,
      l.detalhes->>'origem_no_ml' as origem,
      l.detalhes->>'cidade_do_fornecedor' as cidade
    from public.log_integracao_ml l
    where l.contexto = 'supplier-order-label'
      and l.detalhes->>'bloqueado' = 'true'
      and l.detalhes->>'pedido_id' is not null
    order by l.detalhes->>'pedido_id', l.id desc
  )
  select
    o.id,
    o.created_at,
    o.status::text,
    coalesce(nullif(pr.name, ''), u.email::text)::text,
    u.email::text,
    coalesce(nullif(s.company_name, ''), s.name)::text,
    b.origem,
    b.cidade,
    o.remetente_liberado_em
  from barrado b
  join public.orders o on o.id = b.pedido
  join auth.users u on u.id = o.user_id
  left join public.profiles pr on pr.id = o.user_id
  left join public.suppliers s on s.id = o.supplier_id
  -- Pedido que já saiu não tem mais etiqueta para liberar.
  where o.status not in ('shipped', 'delivered', 'cancelled')
  order by o.created_at desc;
end;
$$;

grant execute on function public.admin_pedidos_travados_no_remetente() to authenticated;


/**
 * Libera, ou volta a travar, a trava de remetente de um pedido.
 *
 * Volta a travar existe porque liberar por engano é possível, e enquanto a
 * etiqueta não foi impressa dá tempo de desfazer.
 */
create or replace function public.admin_liberar_remetente(
  p_pedido_id uuid,
  p_liberar boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_encontrado boolean;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  update public.orders
  set remetente_liberado_em = case when p_liberar then now() else null end
  where id = p_pedido_id
  returning true into v_encontrado;

  if not coalesce(v_encontrado, false) then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;

  return jsonb_build_object('ok', true, 'liberado', p_liberar);
end;
$$;

grant execute on function public.admin_liberar_remetente(uuid, boolean) to authenticated;
