-- ============================================================================
-- Portal do Fornecedor — o pedido chega direto ao fornecedor
--
-- Até aqui o pedido do Mercado Livre nascia como `pending` e só aparecia para
-- o fornecedor depois de o vendedor clicar em "Marcar enviado ao fornecedor",
-- um por um. O plano do produto sempre previu o contrário: "o pedido deveria
-- aparecer automaticamente no painel do fornecedor".
--
-- A aba "Novos" do portal passa a incluir `pending`, então a função e o
-- trigger precisam aceitar as transições que saem de `pending`.
--
-- Nada muda para o vendedor: ele continua podendo marcar o pedido como
-- enviado ao fornecedor, o que agora é registro interno e não mais o gatilho
-- de visibilidade.
--
-- LIMITAÇÃO CONHECIDA
-- `ml-sync-orders` busca /orders/search sem filtro de status e grava tudo como
-- `pending`, e não guardamos o status do pedido no Mercado Livre. Então
-- `pending` também abrange venda com pagamento ainda não aprovado, e o
-- fornecedor pode começar a separar algo que não se concretiza. Resolver isso
-- exige gravar o status do ML na sincronização — fica para depois.
-- ============================================================================

begin;

create or replace function public.fornecedor_atualiza_status_pedido(
  p_pedido_id uuid,
  p_novo_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_supplier_id uuid;
  v_status_atual text;
begin
  v_supplier_id := public.current_supplier_id();

  if v_supplier_id is null then
    raise exception 'Apenas fornecedores podem alterar o status por aqui.'
      using errcode = 'insufficient_privilege';
  end if;

  select o.status into v_status_atual
  from public.orders o
  where o.id = p_pedido_id
    and o.supplier_id = v_supplier_id
  for update;

  if v_status_atual is null then
    raise exception 'Pedido não encontrado para este fornecedor.'
      using errcode = 'no_data_found';
  end if;

  if not (
    (v_status_atual in ('pending', 'sent_to_supplier')
      and p_novo_status in ('separating', 'shipped'))
    or (v_status_atual = 'separating' and p_novo_status = 'shipped')
  ) then
    raise exception 'Transição de status não permitida: % para %',
      v_status_atual, p_novo_status
      using errcode = 'check_violation';
  end if;

  update public.orders
  set status = p_novo_status,
      updated_at = now()
  where id = p_pedido_id;
end;
$$;

-- O trigger continua sendo a segunda barreira: mesmo sem policy de UPDATE
-- para o fornecedor, ele garante que só o status muda e só nas transições
-- previstas, caso alguém recrie as policies antigas.
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

  if (to_jsonb(new) - 'status' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'Fornecedor pode alterar apenas o status do pedido.'
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

commit;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Quantos pedidos passam a ficar visíveis ao fornecedor por conta desta
-- mudança — ou seja, os que estão em `pending` com fornecedor vinculado.
-- select s.name as fornecedor, count(*) as pedidos_pending
-- from public.orders o
-- join public.suppliers s on s.id = o.supplier_id
-- where o.status = 'pending'
-- group by s.name
-- order by s.name;
