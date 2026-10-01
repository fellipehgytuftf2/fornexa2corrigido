-- "Estou separando" barrado pelo gatilho, com a função dizendo que pode.
--
-- O QUE ELE RELATOU
--
-- "Estou separando ainda não funciona."
--
-- AS DUAS LISTAS QUE DISCORDAVAM
--
-- Quem move o pedido é `fornecedor_atualiza_status_pedido`, e ela aceita sair
-- de `pending` — foi ajustada para isso em 29/07, quando se descobriu que o
-- pedido nasce `pending` e nunca passa por `sent_to_supplier`.
--
-- O gatilho `fornecedor_valida_update_pedido`, que é a segunda barreira,
-- ficou para trás: a lista dele ainda exigia `sent_to_supplier`. Como nenhum
-- pedido tem esse status, toda tentativa de separar morria na segunda
-- barreira, depois de a primeira ter aprovado.
--
-- Eu repeti o erro ontem: ao liberar as marcas do fornecedor (reserva,
-- reembolso, código interno) copiei a lista de transições da versão antiga,
-- sem notar que ela já estava defasada.
--
-- POR QUE NÃO BASTAVA OLHAR A FUNÇÃO
--
-- As duas barreiras foram escritas para serem independentes de propósito — se
-- alguém recriar as policies antigas, o gatilho segura. O preço é este: elas
-- precisam ser mudadas juntas, e uma mentindo em silêncio sobre a outra é o
-- tipo de falha que só aparece com o fornecedor parado na bancada.

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

  -- Mesma lista de `fornecedor_atualiza_status_pedido`. `pending` entra
  -- porque é o status com que o pedido nasce e no qual ele permanece:
  -- `sent_to_supplier` existe no desenho e nunca é gravado por tela nenhuma.
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


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- No Portal: "Estou separando" num pedido de MS Digital move o cartão para a
-- aba Em separação. No banco, a contagem muda de lugar:
--
-- select status, count(*) from public.orders o
-- join public.suppliers s on s.id = o.supplier_id
-- where s.company_name ilike '%MS Digital%'
-- group by status;
