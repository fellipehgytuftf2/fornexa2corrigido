-- Limpa o recado de "aguardando cadastro" quando o cadastro acontece.
--
-- `aplicar_pagamento` escreve essa observação quando o pagamento chega antes
-- de a conta existir — que é o fluxo normal de quem compra pela landing. Quando
-- a pessoa finalmente se cadastra, o gatilho reivindica o pagamento e marca
-- `aplicado`, mas a observação antiga ficava intacta.
--
-- O resultado é uma linha que se contradiz: `aplicado = true` ao lado de
-- "aguardando cadastro com este e-mail". Não quebra nada, e foi exatamente o
-- que fez a primeira venda real parecer um problema quando não era. Recado
-- desatualizado em tela de conferência custa tempo e confiança na hora errada.

create or replace function public.reivindicar_pagamentos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pag public.pagamentos%rowtype;
begin
  select * into v_pag
  from public.pagamentos
  where lower(email) = lower(new.email)
    and status = 'pago'
    and aplicado = false
  order by criado_em desc
  limit 1;

  if not found then
    return null;
  end if;

  update public.profiles
  set
    plan = coalesce(v_pag.plano, plan),
    plan_status = 'ativo',
    plan_expira_em = v_pag.expira_em,
    plan_origem = v_pag.gateway,
    plan_atualizado_em = now()
  where id = new.id;

  update public.pagamentos
  set
    user_id = new.id,
    aplicado = true,
    observacao = 'liberado no cadastro em ' || to_char(now(), 'DD/MM/YYYY HH24:MI')
  where id = v_pag.id;

  return null;
end;
$$;

-- Corrige as linhas que já ficaram com o recado errado, inclusive a da
-- primeira venda real.
update public.pagamentos
set observacao = 'liberado no cadastro'
where aplicado = true
  and observacao = 'aguardando cadastro com este e-mail';
