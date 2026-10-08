-- O código de autorização é do DIA, não da devolução.
--
-- O QUE EU ENTENDI ERRADO
--
-- Modelei `codigo_autorizacao` como uma coluna dentro de cada devolução, como
-- se o Mercado Livre emitisse um código por pacote. Não é isso:
--
--   "O código é gerado diariamente. Não é um código por devolução, nem por
--    item devolvido. É válido pro dia todo. Se esse vendedor tem duas
--    devoluções naquele dia, o código do dia serve pras duas. A gente escaneia
--    o QR do entregador e coloca o código que ele enviou."
--
-- O ESTRAGO QUE ISSO FAZIA
--
-- O vendedor colava o código numa devolução, e a outra do mesmo dia continuava
-- "esperando código". O fornecedor via pendência onde não havia, e ficava sem
-- saber se podia receber o segundo pacote do mesmo motorista.
--
-- O QUE MUDA
--
-- O código passa a morar numa tabela por vendedor e por dia. Uma colagem vale
-- para todas as devoluções daquele vendedor naquele dia — uma, duas ou dez.
--
-- O QUE NÃO SE PERDE
--
-- Os códigos já colados nas devoluções continuam onde estão e continuam
-- aparecendo. Apagar o que o vendedor já informou para encaixar no modelo novo
-- seria trocar um incômodo por um prejuízo.

create table if not exists public.codigos_de_devolucao (
  user_id uuid not null references auth.users (id) on delete cascade,

  -- O dia a que o código pertence, no fuso de quem usa. O motorista chega
  -- durante o dia útil, e é esse dia que importa — não o instante UTC.
  dia date not null,

  codigo text not null check (length(btrim(codigo)) between 4 and 40),

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  primary key (user_id, dia)
);

comment on table public.codigos_de_devolucao is
  'Código de autorização que o Mercado Livre gera por vendedor e por dia. Libera todas as devoluções daquele vendedor naquele dia.';

alter table public.codigos_de_devolucao enable row level security;
-- Sem policy: passa pelas funções abaixo, como o resto do sistema.


-- ----------------------------------------------------------------------------
-- O vendedor informa o código do dia
-- ----------------------------------------------------------------------------

create or replace function public.vendedor_define_codigo_do_dia(
  p_codigo text,
  p_dia date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limpo text;
  v_dia date;
begin
  if auth.uid() is null then
    raise exception 'é preciso estar logado';
  end if;

  -- Maiúsculas e sem espaço: o código é lido em voz alta para o motorista, e
  -- "e94eb6c0" e "E94EB6C0" são a mesma coisa para ele e coisas diferentes
  -- para uma comparação de texto.
  v_limpo := upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'));

  if length(v_limpo) < 4 then
    return jsonb_build_object('ok', false, 'erro', 'Código muito curto.');
  end if;

  -- O dia é do fuso de São Paulo, e não UTC: às 22h de Brasília o UTC já virou
  -- o dia seguinte, e o código seria guardado no dia errado — justo no horário
  -- em que o vendedor termina de responder as mensagens do dia.
  v_dia := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);

  insert into public.codigos_de_devolucao (user_id, dia, codigo)
  values (auth.uid(), v_dia, v_limpo)
  on conflict (user_id, dia) do update
    set codigo = excluded.codigo,
        atualizado_em = now();

  return jsonb_build_object('ok', true, 'dia', v_dia, 'codigo', v_limpo);
end;
$$;

revoke all on function public.vendedor_define_codigo_do_dia(text, date) from public, anon;
grant execute on function public.vendedor_define_codigo_do_dia(text, date) to authenticated;


/** O código que eu informei hoje, para a tela abrir já preenchida. */
create or replace function public.meu_codigo_do_dia()
returns table (dia date, codigo text, atualizado_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.dia, c.codigo, c.atualizado_em
  from public.codigos_de_devolucao c
  where c.user_id = auth.uid()
    and c.dia = (now() at time zone 'America/Sao_Paulo')::date;
$$;

grant execute on function public.meu_codigo_do_dia() to authenticated;


-- ----------------------------------------------------------------------------
-- O fornecedor vê o código do dia de cada vendedor
-- ----------------------------------------------------------------------------
-- Junto do código antigo, que continua valendo para as devoluções que já o
-- têm. Na tela, o do dia manda — é o que o motorista vai pedir hoje.

drop function if exists public.fornecedor_minhas_devolucoes();

create or replace function public.fornecedor_minhas_devolucoes()
returns table (
  id uuid,
  order_id uuid,
  produto text,
  imagem text,
  rastreio text,
  motivo text,
  codigo_devolucao text,
  status text,
  avisada_em timestamptz,
  prazo_cd date,
  codigo_autorizacao text,
  tentativas integer,
  ultima_tentativa_em timestamptz,
  ml_order_id text,
  vendedor text,
  vendedor_whatsapp text,
  quem_recebe text,
  codigo_interno text,
  pago_em timestamptz,
  reembolsado_em timestamptz,
  comprador text,
  conta_ml text,
  -- O código de hoje daquele vendedor, e quando ele informou.
  codigo_do_dia text,
  codigo_do_dia_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
  v_hoje date;
begin
  select s.id into v_fornecedor
  from public.suppliers s
  where s.auth_user_id = auth.uid();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores podem ver isto';
  end if;

  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;

  return query
  select
    d.id,
    o.id,
    o.product_name,
    o.product_image_url,
    o.tracking_code,
    d.motivo,
    d.codigo_devolucao,
    d.status,
    d.avisada_em,
    d.prazo_cd,
    d.codigo_autorizacao,
    d.tentativas,
    d.ultima_tentativa_em,
    o.ml_order_id::text,
    coalesce(nullif(pr.empresa, ''), pr.name)::text,
    pr.whatsapp::text,
    coalesce(nullif(pr.quem_recebe, ''), pr.name)::text,
    o.codigo_interno,
    o.pago_ao_fornecedor_em,
    o.reembolsado_em,
    o.customer_name,
    c.account_name::text,
    cod.codigo,
    cod.atualizado_em
  from public.devolucoes d
  join public.orders o on o.id = d.order_id
  left join public.profiles pr on pr.id = d.user_id
  left join public.ml_connections c on c.user_id = d.user_id
  left join public.codigos_de_devolucao cod
    on cod.user_id = d.user_id and cod.dia = v_hoje
  where d.supplier_id = v_fornecedor
  order by d.avisada_em desc;
end;
$$;

grant execute on function public.fornecedor_minhas_devolucoes() to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) O vendedor informa o código de hoje (logado como ele):
-- select public.vendedor_define_codigo_do_dia('E94EB6C0');

-- (b) No Portal, TODAS as devoluções daquele vendedor passam a mostrar esse
--     código — não só uma.

-- (c) Quem já informou hoje:
-- select p.email, c.dia, c.codigo, c.atualizado_em
-- from public.codigos_de_devolucao c
-- join public.profiles p on p.id = c.user_id
-- order by c.atualizado_em desc limit 20;
