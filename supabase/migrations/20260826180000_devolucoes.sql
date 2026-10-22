-- Devoluções: avisar o fornecedor e acompanhar até o produto voltar.
--
-- Regra da MS Digital, e é a mais apertada que já vimos: da confirmação da
-- entrega da devolução, o fornecedor tem 2 DIAS ÚTEIS para receber o produto no
-- CD. Perdeu a janela, perdeu o produto — e o vendedor já pagou por ele.
--
-- Hoje o FORNEXA não sabe nada disso. O pedido termina em "Entregue" e o que
-- acontece depois vive no WhatsApp de cada um. O próprio fornecedor escreve nas
-- regras: "o vendedor deve ter o controle de suas devoluções".
--
-- Aqui é onde esse controle passa a existir.

create table if not exists public.devolucoes (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null references public.orders (id) on delete cascade,

  -- Copiados do pedido em vez de lidos por junção toda vez. O pedido pode ser
  -- cancelado ou o produto sair do catálogo, e a devolução precisa continuar
  -- respondendo de quem era e do que era.
  user_id uuid not null,
  supplier_id uuid,
  catalog_product_id uuid,

  motivo text not null check (
    motivo in ('arrependimento', 'nao_entregue', 'defeito', 'produto_errado')
  ),

  codigo_devolucao text,

  status text not null default 'avisada' check (
    status in ('avisada', 'recebida', 'avariada', 'nao_chegou', 'revendida')
  ),

  avisada_em timestamptz not null default now(),

  -- O relógio dos 2 dias úteis, já resolvido na hora do aviso. Guardar a data
  -- pronta evita recalcular feriado e fim de semana em toda tela que mostrar.
  prazo_cd date,

  recebida_em timestamptz,
  observacao_fornecedor text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists devolucoes_user_idx on public.devolucoes (user_id);
create index if not exists devolucoes_supplier_idx on public.devolucoes (supplier_id);

-- Uma devolução aberta por pedido. Duas linhas para o mesmo pedido seriam duas
-- cobranças do mesmo produto ao fornecedor.
create unique index if not exists devolucoes_pedido_aberto_unico
  on public.devolucoes (order_id)
  where status in ('avisada', 'recebida', 'avariada');


/**
 * Dias úteis à frente, pulando sábado e domingo.
 *
 * Feriado nacional fica de fora de propósito: manter tabela de feriado é
 * trabalho recorrente que ninguém lembra de fazer, e um prazo um dia mais curto
 * do que o real erra para o lado seguro — o vendedor corre antes, não depois.
 */
create or replace function public.dias_uteis_depois(p_data date, p_dias integer)
returns date
language plpgsql
immutable
as $$
declare
  v_data date := p_data;
  v_faltam integer := greatest(0, coalesce(p_dias, 0));
begin
  while v_faltam > 0 loop
    v_data := v_data + 1;

    if extract(isodow from v_data) < 6 then
      v_faltam := v_faltam - 1;
    end if;
  end loop;

  return v_data;
end;
$$;


alter table public.devolucoes enable row level security;

drop policy if exists "vendedor le proprias devolucoes" on public.devolucoes;
create policy "vendedor le proprias devolucoes"
  on public.devolucoes
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.suppliers s
      where s.id = devolucoes.supplier_id and s.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

grant select on public.devolucoes to authenticated;


/**
 * O vendedor avisa que uma devolução está a caminho.
 *
 * Só cria a linha. A mensagem para o fornecedor é montada na tela, com este
 * mesmo dado — o formato é o que a MS Digital pediu, e mandar pelo WhatsApp
 * continua sendo do vendedor.
 */
create or replace function public.registrar_devolucao(
  p_order_id uuid,
  p_motivo text,
  p_codigo text default null
)
returns public.devolucoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.orders;
  v_catalogo uuid;
  v_nova public.devolucoes;
begin
  select * into v_pedido
  from public.orders
  where id = p_order_id and user_id = auth.uid();

  if v_pedido.id is null then
    raise exception 'pedido não encontrado';
  end if;

  select up.catalog_product_id into v_catalogo
  from public.user_products up
  where up.id = coalesce(v_pedido.user_product_id, v_pedido.product_id);

  insert into public.devolucoes (
    order_id, user_id, supplier_id, catalog_product_id,
    motivo, codigo_devolucao, prazo_cd
  )
  values (
    v_pedido.id,
    v_pedido.user_id,
    v_pedido.supplier_id,
    v_catalogo,
    p_motivo,
    nullif(trim(coalesce(p_codigo, '')), ''),
    public.dias_uteis_depois(current_date, 2)
  )
  returning * into v_nova;

  return v_nova;
end;
$$;

grant execute on function public.registrar_devolucao(uuid, text, text) to authenticated;


/**
 * O fornecedor diz o que chegou no CD.
 *
 * A situação da embalagem é o que decide se o produto pode ser vendido de novo
 * — as regras dizem que muito comprador rasga ou descarta a embalagem. Por isso
 * é ele quem responde, e não o vendedor: quem abre a caixa é quem sabe.
 */
create or replace function public.fornecedor_recebe_devolucao(
  p_devolucao uuid,
  p_situacao text,
  p_observacao text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
begin
  if p_situacao not in ('recebida', 'avariada', 'nao_chegou') then
    raise exception 'situação inválida';
  end if;

  select s.id into v_fornecedor
  from public.suppliers s
  where s.auth_user_id = auth.uid();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem confirmar recebimento';
  end if;

  update public.devolucoes
  set
    status = p_situacao,
    recebida_em = case when p_situacao = 'nao_chegou' then null else now() end,
    observacao_fornecedor = nullif(trim(coalesce(p_observacao, '')), ''),
    updated_at = now()
  where id = p_devolucao
    and supplier_id = v_fornecedor;

  if not found then
    raise exception 'devolução não encontrada ou não é deste fornecedor';
  end if;

  return p_situacao;
end;
$$;

grant execute on function public.fornecedor_recebe_devolucao(uuid, text, text) to authenticated;


/**
 * As devoluções que o fornecedor tem para receber.
 *
 * Traz o nome do produto e o rastreio do pedido porque é assim que ele procura
 * o pacote na bancada — pelo código, não pelo id do sistema.
 */
create or replace function public.fornecedor_minhas_devolucoes()
returns table (
  id uuid,
  produto text,
  imagem text,
  rastreio text,
  motivo text,
  codigo_devolucao text,
  status text,
  avisada_em timestamptz,
  prazo_cd date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
begin
  select s.id into v_fornecedor
  from public.suppliers s
  where s.auth_user_id = auth.uid();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem ver isto';
  end if;

  return query
  select
    d.id,
    o.product_name,
    o.product_image_url,
    o.tracking_code,
    d.motivo,
    d.codigo_devolucao,
    d.status,
    d.avisada_em,
    d.prazo_cd
  from public.devolucoes d
  join public.orders o on o.id = d.order_id
  where d.supplier_id = v_fornecedor
  order by d.avisada_em desc;
end;
$$;

grant execute on function public.fornecedor_minhas_devolucoes() to authenticated;
