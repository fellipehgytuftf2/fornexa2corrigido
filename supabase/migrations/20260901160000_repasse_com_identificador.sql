-- Repasse com identificador próprio, para o PIX poder se confirmar sozinho.
--
-- Hoje o vendedor copia um código PIX e paga. Do outro lado, o fornecedor vê um
-- valor cair no extrato e precisa descobrir a que se refere, conferir, e clicar
-- em "Confirmar recebimento" para a etiqueta liberar. Enquanto ele não clica, a
-- mercadoria fica parada.
--
-- Para o dinheiro se anunciar sozinho, falta uma coisa: um número que vá junto
-- com o PIX e volte no aviso do banco. É o `txid` — ele viaja dentro do código
-- copia-e-cola e aparece no extrato.
--
-- Com ele, quando o banco do fornecedor avisar "caiu um PIX com o identificador
-- FNX7A3...", o FORNEXA sabe exatamente quais pedidos quitar e libera a etiqueta
-- na hora, sem ninguém clicar.
--
-- ESTA MIGRAÇÃO NÃO CONVERSA COM BANCO NENHUM AINDA.
--
-- Ela cria o repasse, o identificador e a porta de entrada da confirmação. Ligar
-- num banco específico (Mercado Pago, Asaas, Inter, Cora) é um tradutor por cima
-- disto, e cada um fala diferente. O que está aqui vale para todos.
--
-- E continua servindo mesmo sem banco nenhum: o identificador aparece no extrato
-- do fornecedor, então ele para de adivinhar a que se refere o valor que caiu.

create table if not exists public.repasses (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,

  valor numeric(12, 2) not null,

  -- Vai dentro do código PIX e volta no aviso do banco. O PIX aceita no máximo
  -- 25 caracteres, só letras e números — nada de traço, nada de acento.
  txid text not null unique,

  status text not null default 'aberto' check (status in ('aberto', 'pago', 'cancelado')),

  pago_em timestamptz,

  -- De onde veio a confirmação: 'manual' quando alguém clicou, ou o nome do
  -- banco quando ele avisou sozinho. Serve para saber, depois, se a automação
  -- está mesmo funcionando.
  confirmado_por text,

  criado_em timestamptz not null default now()
);

create index if not exists repasses_supplier_idx on public.repasses (supplier_id);
create index if not exists repasses_user_idx on public.repasses (user_id);

-- O pedido guarda de qual repasse faz parte. Uma coluna resolve; tabela de
-- ligação seria peso sem ganho, já que um pedido entra num repasse só.
alter table public.orders
  add column if not exists repasse_id uuid references public.repasses (id) on delete set null;

create index if not exists orders_repasse_idx on public.orders (repasse_id);

alter table public.repasses enable row level security;

drop policy if exists "ve os proprios repasses" on public.repasses;
create policy "ve os proprios repasses"
  on public.repasses
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.suppliers s
      where s.id = repasses.supplier_id and s.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

grant select on public.repasses to authenticated;


/**
 * Abre — ou reaproveita — o repasse de um fornecedor.
 *
 * Chamada quando o vendedor vai copiar o código PIX. Junta tudo que está em
 * aberto com aquele fornecedor num lote só e devolve o identificador.
 *
 * Reaproveitar importa: se ele copiar o código duas vezes sem pagar, tem que
 * sair o mesmo identificador. Dois códigos para a mesma dívida viram dois
 * pagamentos, e alguém paga duas vezes.
 */
create or replace function public.abrir_repasse(p_fornecedor uuid)
returns table (id uuid, txid text, valor numeric, pedidos integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repasse public.repasses;
  v_total numeric;
  v_quantos integer;
begin
  select
    coalesce(sum(o.supplier_price), 0),
    count(*)
  into v_total, v_quantos
  from public.orders o
  where o.user_id = auth.uid()
    and o.supplier_id = p_fornecedor
    and o.pago_ao_fornecedor_em is null;

  if v_quantos = 0 then
    raise exception 'não há pedidos em aberto com este fornecedor';
  end if;

  -- Já existe um lote aberto? Atualiza o valor, porque pode ter entrado venda
  -- nova desde a última vez que ele abriu a tela.
  select * into v_repasse
  from public.repasses r
  where r.user_id = auth.uid()
    and r.supplier_id = p_fornecedor
    and r.status = 'aberto'
  limit 1;

  if v_repasse.id is null then
    insert into public.repasses (user_id, supplier_id, valor, txid)
    values (
      auth.uid(),
      p_fornecedor,
      v_total,
      -- "FNX" na frente para o fornecedor reconhecer no extrato de onde veio.
      -- Os outros 22 saem do uuid, sem traços: 3 + 22 fecha exatamente os 25
      -- caracteres que o PIX aceita. Cortar não cria risco de repetição — 22
      -- caracteres de um uuid ainda são mais combinações do que este sistema
      -- verá em muitas vidas.
      'FNX' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 22))
    )
    returning * into v_repasse;
  else
    update public.repasses
    set valor = v_total
    where repasses.id = v_repasse.id
    returning * into v_repasse;
  end if;

  update public.orders o
  set repasse_id = v_repasse.id
  where o.user_id = auth.uid()
    and o.supplier_id = p_fornecedor
    and o.pago_ao_fornecedor_em is null;

  return query
  select v_repasse.id, v_repasse.txid, v_total, v_quantos;
end;
$$;

grant execute on function public.abrir_repasse(uuid) to authenticated;


/**
 * O repasse foi pago — quita os pedidos e libera as etiquetas.
 *
 * As duas marcas são feitas juntas de propósito: `pago_ao_fornecedor_em` é a
 * conta do vendedor, `recebimento_confirmado_em` é o que destrava endereço e
 * etiqueta no Portal. Separá-las obrigaria o fornecedor a clicar num dinheiro
 * que o banco dele já confirmou.
 *
 * `p_origem` guarda quem confirmou: 'manual' ou o nome do banco.
 */
create or replace function public.confirmar_repasse(
  p_txid text,
  p_origem text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repasse public.repasses;
  v_pedidos integer;
begin
  select * into v_repasse
  from public.repasses r
  where r.txid = p_txid;

  if v_repasse.id is null then
    raise exception 'repasse não encontrado';
  end if;

  -- Aviso repetido do banco é normal, e não pode quitar duas vezes nem
  -- reescrever a data do pagamento original.
  if v_repasse.status = 'pago' then
    return jsonb_build_object('ok', true, 'ja_estava_pago', true);
  end if;

  update public.repasses
  set status = 'pago',
      pago_em = now(),
      confirmado_por = coalesce(nullif(trim(p_origem), ''), 'manual')
  where repasses.id = v_repasse.id;

  update public.orders o
  set pago_ao_fornecedor_em = now(),
      recebimento_confirmado_em = now()
  where o.repasse_id = v_repasse.id
    and o.pago_ao_fornecedor_em is null;

  get diagnostics v_pedidos = row_count;

  return jsonb_build_object('ok', true, 'pedidos', v_pedidos, 'valor', v_repasse.valor);
end;
$$;

grant execute on function public.confirmar_repasse(text, text) to authenticated, service_role;
