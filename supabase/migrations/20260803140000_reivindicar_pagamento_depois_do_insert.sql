-- Corrige o gatilho que reivindica pagamento pendente no cadastro.
--
-- Ele era BEFORE INSERT, para poder preencher os campos de plano direto em NEW.
-- Só que o mesmo gatilho também grava `pagamentos.user_id`, e nesse momento a
-- linha do perfil ainda não existe — a chave estrangeira de `pagamentos` para
-- `profiles` barrava a operação inteira:
--
--   insert or update on table "pagamentos" violates foreign key constraint
--   "pagamentos_user_id_fkey"
--
-- O efeito era pior do que parece. Só falhava quando havia pagamento esperando,
-- que é precisamente o fluxo desenhado: pagar primeiro, criar a conta depois.
-- Cadastro sem pagamento pendente seguia funcionando, então a falha ficaria
-- escondida até o primeiro cliente real — que simplesmente não conseguiria
-- criar conta.
--
-- A correção passa tudo para AFTER INSERT. O perfil já existe, a chave
-- estrangeira encontra o que precisa, e os campos de plano viram um UPDATE em
-- vez de atribuição em NEW.

create or replace function public.reivindicar_pagamentos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pag public.pagamentos%rowtype;
begin
  -- O pagamento mais recente vale: se a pessoa comprou básico e depois premium,
  -- o que ela tem é o premium.
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
  set user_id = new.id, aplicado = true
  where id = v_pag.id;

  return null;
end;
$$;

drop trigger if exists profiles_reivindica_pagamento on public.profiles;

create trigger profiles_reivindica_pagamento
  after insert on public.profiles
  for each row
  execute function public.reivindicar_pagamentos();
