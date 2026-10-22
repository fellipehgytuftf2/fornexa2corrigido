-- Ver e excluir conta que nunca pagou.
--
-- O PEDIDO
--
-- Do card "TEM CONTAS DE USUARIOS SUMINDO DO DAS CONTAS E ACESSOS": "se
-- possível excluir também as contas que não foram pagas". A primeira metade
-- do card (conta que sumia da busca) saiu na migração 20260923210000.
--
-- O QUE O LEVANTAMENTO MOSTROU (24/09/2026)
--
--   5795 contas em profiles
--    325 com plano ativo
--     23 dessas com premium ativo e NENHUM pagamento pago
--    200 ativas sem data de validade — não expiram nunca
--    381 pagamentos criados e nunca pagos
--
-- Parte das 23 é liberação feita na mão pelo suporte. Por isso a tela ganha o
-- recorte, e a exclusão continua sendo um clique por conta: apagar em lote o
-- que "parece" não pago apagaria cliente legítimo.
--
-- A TRAVA
--
-- `admin_excluir_conta` recusa qualquer conta que tenha pedido, anúncio
-- publicado ou pagamento pago. Conta com pedido carrega o histórico do
-- repasse e do lucro; apagar não é limpeza, é perder a contabilidade. O que
-- sobra para excluir é o que de fato nunca virou nada: cadastro que entrou,
-- não pagou e não usou.

-- ----------------------------------------------------------------------------
-- 1. O mapa passa a dizer quem nunca pagou
-- ----------------------------------------------------------------------------
-- O casamento é por id E por e-mail: pagamento antigo pode ter chegado do
-- gateway sem `user_id`, só com o e-mail de quem comprou.

create index if not exists pagamentos_user_id_idx on public.pagamentos (user_id);
create index if not exists pagamentos_email_idx on public.pagamentos (lower(email));

create or replace function public.admin_mapa_de_acesso_completo()
returns json
language sql
stable
security definer
set search_path = public
as $$
  -- `admin_mapa_de_acesso()` já recusa quem não é admin.
  select coalesce(json_agg(linha), '[]'::json)
  from (
    select to_jsonb(mapa) || jsonb_build_object(
      'nunca_pagou',
      not exists (
        select 1 from public.pagamentos pg
        where pg.status = 'pago'
          and (
            pg.user_id = mapa.user_id
            or lower(pg.email) = lower(mapa.email)
          )
      )
    ) as linha
    from public.admin_mapa_de_acesso() as mapa
  ) linhas;
$$;

comment on function public.admin_mapa_de_acesso_completo() is
  'O mapa de acesso em uma linha só de json, com `nunca_pagou` em cada conta. Existe porque o PostgREST corta a versão em tabela nas primeiras 1000 contas — ver migrações 20260923210000 e 20260924030000.';

revoke all on function public.admin_mapa_de_acesso_completo() from public, anon;
grant execute on function public.admin_mapa_de_acesso_completo() to authenticated;


-- ----------------------------------------------------------------------------
-- 2. Excluir, uma conta por vez, e só o que nunca virou nada
-- ----------------------------------------------------------------------------
-- Remover a conta de `auth.users` leva junto, em cascata, o que depende dela
-- — inclusive a linha de `profiles`. Por isso as travas vêm antes, e não
-- depois.

create or replace function public.admin_excluir_conta(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_pedidos integer;
  v_produtos integer;
  v_pagamentos integer;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores podem excluir contas';
  end if;

  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'erro', 'Você não pode excluir a sua própria conta.');
  end if;

  select p.email into v_email from public.profiles p where p.id = p_user_id;

  if v_email is null then
    return jsonb_build_object('ok', false, 'erro', 'Conta não encontrada.');
  end if;

  if exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'admin') then
    return jsonb_build_object('ok', false, 'erro', 'Conta de administrador não é excluída por aqui.');
  end if;

  if exists (select 1 from public.suppliers s where s.auth_user_id = p_user_id) then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Esta conta é o acesso de um fornecedor. Remova o acesso pelo cadastro do fornecedor.'
    );
  end if;

  select count(*) into v_pedidos from public.orders o where o.user_id = p_user_id;
  select count(*) into v_produtos from public.user_products up where up.user_id = p_user_id;

  select count(*) into v_pagamentos
  from public.pagamentos pg
  where pg.status = 'pago'
    and (pg.user_id = p_user_id or lower(pg.email) = lower(v_email));

  if v_pedidos > 0 or v_produtos > 0 or v_pagamentos > 0 then
    return jsonb_build_object(
      'ok', false,
      'erro', format(
        'Esta conta tem histórico: %s pedido(s), %s anúncio(s) e %s pagamento(s) pago(s). Apagar levaria o histórico junto — desative o plano em vez de excluir.',
        v_pedidos, v_produtos, v_pagamentos
      )
    );
  end if;

  delete from auth.users where id = p_user_id;

  return jsonb_build_object('ok', true, 'email', v_email);
end;
$$;

comment on function public.admin_excluir_conta(uuid) is
  'Exclui uma conta que nunca pagou, nunca vendeu e nunca publicou. Recusa qualquer conta com histórico.';

revoke all on function public.admin_excluir_conta(uuid) from public, anon;
grant execute on function public.admin_excluir_conta(uuid) to authenticated;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Quantas contas nunca pagaram, e quantas dessas dá para excluir:
-- select
--   count(*) filter (where nao_pagou) as nunca_pagaram,
--   count(*) filter (where nao_pagou and sem_historico) as excluiveis
-- from (
--   select
--     not exists (
--       select 1 from public.pagamentos pg
--       where pg.status = 'pago'
--         and (pg.user_id = p.id or lower(pg.email) = lower(p.email))
--     ) as nao_pagou,
--     not exists (select 1 from public.orders o where o.user_id = p.id)
--       and not exists (select 1 from public.user_products up where up.user_id = p.id)
--       as sem_historico
--   from public.profiles p
-- ) x;

-- (b) O mapa passou a trazer o campo novo (entrando com a sua conta admin):
-- select (public.admin_mapa_de_acesso_completo() -> 0) ? 'nunca_pagou';
