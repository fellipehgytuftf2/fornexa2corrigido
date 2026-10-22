-- O guarda de `orders` não conhecia as marcas do fornecedor.
--
-- O QUE ELE RELATOU
--
-- "Botão de Reservar e Reembolso continua sem funcionar."
-- "Local p colocar o cód interno, também não funciona — o cód some."
--
-- A MESMA CAUSA NOS TRÊS
--
-- Existe um gatilho em `orders` desde o primeiro dia do Portal: quando quem
-- altera a linha é o fornecedor dono do pedido, só `status`, `updated_at` e
-- `recebimento_confirmado_em` podem mudar. Qualquer outro campo levanta
-- exceção. Era a trava certa na época — impedia o fornecedor de mexer em
-- preço, comprador ou pagamento do vendedor.
--
-- Depois nasceram três marcas que são dele e de mais ninguém: `reservado_em`
-- (o que está na prateleira), `reembolsado_em` (o dinheiro devolvido) e
-- `codigo_interno` (o código que a equipe dele carimba na separação). As
-- funções foram escritas, os botões foram para a tela, e o gatilho barrou
-- todas elas em silêncio. O código "sumia" porque nunca chegou a ser gravado.
--
-- SECURITY DEFINER NÃO SALVA DESTE GATILHO
--
-- As funções rodam com os poderes do dono do banco, e por isso passam pelas
-- policies. Mas `auth.uid()` continua sendo o fornecedor logado — é claim do
-- token, não papel do Postgres —, então o gatilho reconhece o fornecedor e
-- barra do mesmo jeito. Não havia como descobrir isso pela tela: o erro subia
-- como "check_violation" dentro de uma função que o Portal chama por RPC.
--
-- O QUE CONTINUA BARRADO
--
-- Tudo o mais. Preço do produto, dados do comprador, comprovante, data de
-- pagamento do vendedor, repasse — nada disso é dele, e segue intocável.

create or replace function public.fornecedor_valida_update_pedido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_supplier_id uuid;
  v_antes jsonb;
  v_depois jsonb;
begin
  select s.id into v_supplier_id
  from public.suppliers s
  where s.auth_user_id = auth.uid();

  if v_supplier_id is null or old.supplier_id is distinct from v_supplier_id then
    return new;
  end if;

  -- O que é do fornecedor, mais as colunas calculadas, que não são
  -- comparáveis dentro de um gatilho BEFORE.
  v_antes := to_jsonb(old)
    - 'status' - 'updated_at' - 'recebimento_confirmado_em'
    - 'reservado_em' - 'reembolsado_em' - 'codigo_interno'
    - 'lucro_liquido' - 'receita_total';

  v_depois := to_jsonb(new)
    - 'status' - 'updated_at' - 'recebimento_confirmado_em'
    - 'reservado_em' - 'reembolsado_em' - 'codigo_interno'
    - 'lucro_liquido' - 'receita_total';

  if v_depois is distinct from v_antes then
    raise exception 'Fornecedor pode alterar apenas o status, a confirmação de recebimento e as próprias marcas (reserva, reembolso, código interno).'
      using errcode = 'check_violation';
  end if;

  if not (
    old.status = new.status
    or (old.status = 'sent_to_supplier' and new.status in ('separating', 'shipped'))
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

comment on function public.fornecedor_valida_update_pedido() is
  'Impede o fornecedor de alterar o que é do vendedor. Deixa passar o status, a confirmação de recebimento e as marcas da bancada dele: reserva, reembolso e código interno.';


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Entrando como fornecedor, no Portal: Reservar, Marcar reembolso e o campo do
-- código interno passam a gravar. No banco, depois de usar os três:
--
-- select count(*) filter (where reservado_em is not null)   as reservados,
--        count(*) filter (where reembolsado_em is not null) as reembolsados,
--        count(*) filter (where codigo_interno is not null) as com_codigo
-- from public.orders;
