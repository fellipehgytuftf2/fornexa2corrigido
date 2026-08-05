-- O gatilho de proteção precisa conhecer a coluna de confirmação.
--
-- `fornecedor_valida_update_pedido` existe desde a Fase 2 como segunda
-- barreira: mesmo que alguém recrie as policies antigas, o fornecedor só
-- consegue mexer em `status` e `updated_at`. Ele compara o registro inteiro
-- campo a campo, subtraindo apenas esses dois.
--
-- Quando `recebimento_confirmado_em` nasceu, o gatilho passou a barrar a
-- própria função que a preenche — nem `security definer` escapa, porque
-- `auth.uid()` continua sendo o do fornecedor dentro dela. O sintoma era
-- "Fornecedor pode alterar apenas o status do pedido." ao clicar em Confirmar
-- recebimento.
--
-- Liberar este campo não abre brecha: é exatamente o dado que o fornecedor
-- deve controlar, e ele segue sem policy de UPDATE em `orders` — a escrita
-- continua passando obrigatoriamente pelas funções.

create or replace function public.fornecedor_valida_update_pedido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_supplier_id uuid;
begin
  select s.id into v_supplier_id
  from public.suppliers s
  where s.auth_user_id = auth.uid();

  if v_supplier_id is null or old.supplier_id is distinct from v_supplier_id then
    return new;
  end if;

  -- Três campos, não mais dois: o carimbo de recebimento é do fornecedor.
  if (to_jsonb(new) - 'status' - 'updated_at' - 'recebimento_confirmado_em')
     is distinct from
     (to_jsonb(old) - 'status' - 'updated_at' - 'recebimento_confirmado_em') then
    raise exception 'Fornecedor pode alterar apenas o status e a confirmação de recebimento.'
      using errcode = 'check_violation';
  end if;

  if not (
    old.status = new.status
    or (old.status in ('pending', 'sent_to_supplier')
        and new.status in ('separating', 'shipped'))
    or (old.status = 'separating' and new.status = 'shipped')
  ) then
    raise exception 'Transição de status não permitida para fornecedor: % para %',
      old.status, new.status
      using errcode = 'check_violation';
  end if;

  new.updated_at := now();

  return new;
end;
$$;
