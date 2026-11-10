-- ============================================================================
-- A venda é do afiliado pelo ?code=, e não pelo checkout
-- ============================================================================
--
-- `admin_desempenho_dos_afiliados` casava pagamento com afiliado comparando o
-- ID DO CHECKOUT: pegava `/checkout/<id>` do endereço gravado no pagamento e
-- procurava esse mesmo id nos checkouts cadastrados do afiliado.
--
-- Isso parte de uma premissa falsa: a de que cada afiliado tem um checkout
-- próprio. Não tem. O link do afiliado é o MESMO checkout da FORNEXA com o
-- `?code=` dele no fim -- é o código, e não o checkout, que diz de quem é a
-- venda.
--
-- O QUE ISSO FAZIA NA TELA
--
-- Como o checkout do afiliado é o da casa, o `in (...)` casava com TODA venda
-- direta da FORNEXA. O primeiro afiliado cadastrado apareceu com 625 vendas e
-- R$ 117.629,89 -- que é o faturamento inteiro da casa, 342 no Premium e 283
-- no Básico, nenhuma delas indicada por ninguém.
--
-- Qualquer afiliado que salvasse os checkouts receberia o mesmo número.
--
-- NINGUÉM RECEBEU A MAIS POR CAUSA DISTO
--
-- A comissão é calculada e paga pela Applyfy, por fora. Esta tela só informa.
-- Nos 625 pagamentos a coluna `afiliado` está nula, ou seja: o banco sempre
-- soube que não houve indicação -- quem errava era só a conta desta função.
--
-- A COLUNA CERTA JÁ EXISTIA
--
-- `pagamentos.afiliado` é preenchida pelo webhook da Applyfy com exatamente o
-- `?code=` do endereço do checkout (ver `lerAfiliado`, em applyfy-webhook).
-- É com ela que a comparação passa a ser feita.

CREATE OR REPLACE FUNCTION public.admin_desempenho_dos_afiliados()
 RETURNS TABLE(conta uuid, vendas integer, faturamento numeric, clientes_ativos integer, clientes_perdidos integer, usando_ainda integer, ultima_venda timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'coprodutor')
  ) then
    raise exception 'apenas administradores e co-produtores';
  end if;

  return query
  select
    a.conta,
    count(pg.id)::integer,
    coalesce(sum(pg.valor), 0),
    count(pg.id) filter (where pf.plan_status = 'ativo')::integer,
    count(pg.id) filter (where pf.plan_status in ('reembolsado', 'cancelado'))::integer,
    count(pg.id) filter (where u.last_sign_in_at > now() - interval '14 days')::integer,
    max(pg.criado_em)
  from public.afiliados a
  left join public.pagamentos pg
    on pg.status = 'pago'
   and pg.afiliado is not null
   and (
         pg.afiliado = substring(a.checkout_basico from '[?&]code=([^&]+)')
         or pg.afiliado = substring(a.checkout_premium from '[?&]code=([^&]+)')
       )
  left join public.profiles pf on pf.id = pg.user_id
  left join auth.users u on u.id = pg.user_id
  where a.situacao = 'aprovado'
    and a.checkout_basico <> ''
    and a.checkout_premium <> ''
  group by a.conta;
end;
$function$;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Conferido antes de aplicar: com a correção, o único afiliado com os
--     checkouts salvos passa de 625 vendas / R$ 117.629,89 para 0 / R$ 0.
-- select * from public.admin_desempenho_dos_afiliados();

-- (b) De onde vinha o engano -- as 625 vendas não têm código nenhum:
-- select afiliado, count(*) from public.pagamentos
-- where status = 'pago' group by afiliado order by 2 desc;
