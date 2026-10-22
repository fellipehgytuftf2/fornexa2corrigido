-- Ajusta o modelo de pagamento ao formato real do webhook da Applyfy.
--
-- A migração anterior foi escrita sem a documentação, que só é visível depois
-- de logar no painel. Agora que o formato é conhecido, duas suposições caem:
--
-- 1. A validade era deduzida do nome do plano ("basico" = 33 dias). O webhook
--    manda `subscription.intervalType` e `intervalCount`, então o ciclo real
--    vem no aviso e não precisa ser adivinhado. A data passa a ser calculada
--    por quem recebe e gravada no pagamento.
--
-- 2. A conta era encontrada só por e-mail. O webhook tem
--    `transaction.identifier`, um campo livre que volta como foi enviado.
--    Quando ele trouxer o id da conta, o encontro é exato — e o caso de pagar
--    com um e-mail e se cadastrar com outro deixa de existir.

alter table public.pagamentos
  add column if not exists expira_em timestamptz,
  add column if not exists identificador_externo text;

comment on column public.pagamentos.expira_em is
  'Quando o acesso vence. Nulo = compra única. Calculado do ciclo da assinatura.';

comment on column public.pagamentos.identificador_externo is
  'transaction.identifier da Applyfy: o id da conta, quando enviado no checkout.';

create index if not exists pagamentos_identificador_idx
  on public.pagamentos (identificador_externo)
  where identificador_externo is not null;

-- ---------------------------------------------------------------------------
-- aplicar_pagamento: acha a conta pelo identificador antes do e-mail
-- ---------------------------------------------------------------------------

create or replace function public.aplicar_pagamento(p_pagamento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pag public.pagamentos%rowtype;
  v_user_id uuid;
begin
  select * into v_pag from public.pagamentos where id = p_pagamento_id;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'pagamento não encontrado');
  end if;

  -- Caminho exato: o checkout devolveu o id da conta que iniciou a compra.
  if v_pag.identificador_externo is not null then
    begin
      select id into v_user_id
      from public.profiles
      where id = v_pag.identificador_externo::uuid;
    exception when invalid_text_representation then
      -- Veio algo que não é um id de conta. Ignora e cai no e-mail.
      v_user_id := null;
    end;
  end if;

  -- Caminho comum: quem comprou pela landing não tinha conta, então só o
  -- e-mail liga as duas pontas.
  if v_user_id is null then
    select id into v_user_id
    from public.profiles
    where lower(email) = lower(v_pag.email)
    limit 1;
  end if;

  if v_user_id is null then
    update public.pagamentos
    set observacao = 'aguardando cadastro com este e-mail'
    where id = p_pagamento_id;

    return jsonb_build_object('ok', true, 'aguardando_cadastro', true);
  end if;

  if v_pag.status = 'pago' then
    update public.profiles
    set
      plan = coalesce(v_pag.plano, plan),
      plan_status = 'ativo',
      plan_expira_em = v_pag.expira_em,
      plan_origem = v_pag.gateway,
      plan_atualizado_em = now()
    where id = v_user_id;

  elsif v_pag.status = 'reembolsado' then
    -- Dinheiro devolvido, acesso encerrado. Vale também para chargeback.
    update public.profiles
    set plan_status = 'reembolsado', plan_atualizado_em = now()
    where id = v_user_id;

  else
    -- Cobrança criada, cancelada ou recusada não mexe em acesso. Cancelamento
    -- de transação não é estorno: bloquear aqui derrubaria, no meio do mês
    -- pago, quem só teve uma tentativa de renovação falhar.
    update public.pagamentos
    set
      user_id = v_user_id,
      observacao = 'registrado, sem efeito no acesso: ' || v_pag.status
    where id = p_pagamento_id;

    return jsonb_build_object('ok', true, 'sem_efeito', true, 'status', v_pag.status);
  end if;

  update public.pagamentos
  set user_id = v_user_id, aplicado = true
  where id = p_pagamento_id;

  return jsonb_build_object('ok', true, 'user_id', v_user_id, 'status', v_pag.status);
end;
$$;

revoke all on function public.aplicar_pagamento(uuid) from public, anon, authenticated;
grant execute on function public.aplicar_pagamento(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- reivindicar_pagamentos: usa a validade que veio no pagamento
-- ---------------------------------------------------------------------------

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

  if found then
    new.plan := coalesce(v_pag.plano, new.plan);
    new.plan_status := 'ativo';
    new.plan_expira_em := v_pag.expira_em;
    new.plan_origem := v_pag.gateway;
    new.plan_atualizado_em := now();

    update public.pagamentos
    set user_id = new.id, aplicado = true
    where id = v_pag.id;
  end if;

  return new;
end;
$$;
