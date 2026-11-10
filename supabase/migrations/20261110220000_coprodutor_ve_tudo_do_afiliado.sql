-- ============================================================================
-- O co-produtor vê tudo dos afiliados
-- ============================================================================
--
-- Das cinco leituras da área de afiliados, quatro já estavam abertas a ele:
-- quem são, os links e preços de cada um, o desempenho e as vendas por
-- código. Faltava a última.
--
-- `admin_clientes_do_afiliado` devolve, para um afiliado, a lista de quem
-- comprou por ele: nome, e-mail, plano, situação, valor e último acesso.
--
-- POR QUE ELA TINHA FICADO DE FORA
--
-- Por ser a única da área que entrega dado pessoal de CLIENTE, um a um --
-- as outras falam de afiliado (que é parceiro) ou devolvem número agregado.
-- O corte foi meu, não pedido: na dúvida sobre o alcance do papel, a lista de
-- e-mails de quem comprou é o tipo de coisa que se abre de propósito, e não
-- por tabela.
--
-- Aberta agora porque é essa a decisão do dono: co-produtor enxerga tudo dos
-- afiliados.
--
-- O QUE CONTINUA FECHADO
--
-- Escrever. A tabela `afiliados` tem RLS de admin para qualquer alteração, e
-- o co-produtor nem lê a tabela direto -- tudo o que ele vê passa por estas
-- funções. Aprovar, pausar, trocar checkout, mudar preço, apagar e criar
-- afiliado seguem sendo do admin.

CREATE OR REPLACE FUNCTION public.admin_clientes_do_afiliado(p_afiliado text)
 RETURNS TABLE(email text, nome text, plano text, plan_status text, valor numeric, comprou_em timestamp with time zone, ultimo_acesso timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'coprodutor')
  ) then
    raise exception 'apenas administradores e co-produtores';
  end if;

  return query
  select
    pg.email,
    coalesce(pf.name, pg.nome),
    pf.plan,
    pf.plan_status,
    pg.valor,
    pg.criado_em,
    u.last_sign_in_at
  from public.pagamentos pg
  left join public.profiles pf on pf.id = pg.user_id
  left join auth.users u on u.id = pg.user_id
  where pg.afiliado = p_afiliado
    and pg.status = 'pago'
  order by pg.criado_em desc;
end;
$function$;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) As CINCO leituras de afiliado aceitam co-produtor:
-- select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.prokind = 'f'
--   and proname in ('admin_afiliados', 'admin_afiliados_cadastrados',
--                   'admin_desempenho_dos_afiliados', 'admin_clientes_do_afiliado')
--   and pg_get_functiondef(p.oid) like '%coprodutor%';

-- (b) E escrever continua sendo só do admin -- a política da tabela não mudou:
-- select polname, pg_get_expr(polqual, polrelid) from pg_policy
-- where polrelid = 'public.afiliados'::regclass;
