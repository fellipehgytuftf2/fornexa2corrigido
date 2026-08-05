-- Conserta o gatilho que passou a barrar TODA alteração do fornecedor.
--
-- A CAUSA, que não é óbvia:
--
-- `fornecedor_valida_update_pedido` é BEFORE UPDATE e compara o registro
-- inteiro campo a campo, subtraindo os campos que o fornecedor pode mexer.
-- Funcionava bem até `orders` ganhar colunas GENERATED ALWAYS ... STORED
-- (`lucro_liquido` e `receita_total`, criadas em 20260803180000).
--
-- O Postgres calcula coluna gerada DEPOIS dos gatilhos BEFORE. Dentro do
-- gatilho, portanto, `NEW.lucro_liquido` é nulo enquanto `OLD.lucro_liquido`
-- tem valor. A comparação enxerga isso como se o fornecedor tivesse alterado o
-- lucro, e recusa qualquer UPDATE — inclusive os legítimos.
--
-- O sintoma foi o fornecedor não conseguir confirmar recebimento, mas o
-- estrago era maior: desde aquela migração ele também não conseguia marcar
-- pedido como em separação nem como enviado. O portal inteiro travou do lado
-- da escrita.
--
-- ATENÇÃO PARA O FUTURO: toda coluna gerada nova em `orders` precisa entrar na
-- subtração abaixo, senão este gatilho volta a barrar tudo. A comparação de
-- registro inteiro é proposital — pega coluna nova sem ninguém lembrar de
-- atualizar a regra —, e o preço é justamente este cuidado com colunas
-- calculadas.

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

  -- Campos que o fornecedor pode mexer, mais as colunas calculadas, que não
  -- são comparáveis dentro de um gatilho BEFORE.
  v_antes := to_jsonb(old)
    - 'status' - 'updated_at' - 'recebimento_confirmado_em'
    - 'lucro_liquido' - 'receita_total';

  v_depois := to_jsonb(new)
    - 'status' - 'updated_at' - 'recebimento_confirmado_em'
    - 'lucro_liquido' - 'receita_total';

  if v_depois is distinct from v_antes then
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
