-- ============================================================================
-- `admin_fornecedores_da_conta` volta a ser só do admin
-- ============================================================================
--
-- Uma versão anterior da liberação do co-produtor abriu esta função junto com
-- o mapa de acesso. Ela foi aplicada, e a versão seguinte -- que já não a
-- mencionava -- não desfez nada: `create or replace` só mexe no que cita.
--
-- A tela não a oferece mais (o clique na linha some para o co-produtor), mas
-- esconder botão nunca foi o que protege: pelo console do navegador ela
-- responderia, e o que ela responde é quais fornecedores cada conta enxerga.
--
-- Fecha aqui, que é onde a trava mora de verdade.

CREATE OR REPLACE FUNCTION public.admin_fornecedores_da_conta(p_user_id uuid)
 RETURNS TABLE(supplier_id uuid, fornecedor text, pedidos integer, primeiro_pedido timestamp with time zone, ultimo_pedido timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_eh_admin boolean;
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  select (role = 'admin') into v_eh_admin
  from public.profiles where id = p_user_id;

  -- Conta de admin enxerga o cadastro inteiro, tenha pedido ou não.
  if coalesce(v_eh_admin, false) then
    return query
    select
      s.id,
      coalesce(s.company_name, s.name),
      (select count(*)::integer from public.orders o
        where o.supplier_id = s.id and o.user_id = p_user_id),
      null::timestamptz,
      null::timestamptz
    from public.suppliers s
    order by coalesce(s.company_name, s.name);

    return;
  end if;

  return query
  select
    s.id,
    coalesce(s.company_name, s.name),
    count(o.id)::integer,
    min(o.created_at),
    max(o.created_at)
  from public.orders o
  join public.suppliers s on s.id = o.supplier_id
  where o.user_id = p_user_id
  group by s.id, s.company_name, s.name
  order by max(o.created_at) desc;
end;
$function$;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Depois de rodar, esta consulta tem de devolver DUAS linhas -- só o mapa de
-- acesso e o desempenho dos afiliados aceitam co-produtor nesta área:
-- select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.prokind = 'f'
--   and proname in ('admin_mapa_de_acesso', 'admin_fornecedores_da_conta',
--                   'admin_define_plano', 'admin_excluir_conta',
--                   'admin_desempenho_dos_afiliados')
--   and pg_get_functiondef(p.oid) like '%coprodutor%';
