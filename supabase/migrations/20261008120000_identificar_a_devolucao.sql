-- Identificar o pacote que chegou, com o que a etiqueta realmente traz.
--
-- O QUE A ETIQUETA DE DEVOLUÇÃO TEM
--
-- Foto de 08/10, pacote recebido no galpão: nome do comprador
-- ("Leciano Santana"), o Pack ID, e o nome da conta do vendedor no Mercado
-- Livre como destino ("Devanil Maria de Almeida Mendes"). Não tem número da
-- venda, não tem produto, não tem o rastreio da ida.
--
-- OS TRÊS DEFEITOS QUE ISSO EXPÔS
--
-- 1. A busca só aceita número. Ela limpa tudo que não é dígito e exige seis
--    deles, então rastreio com letra — "MIOLMMY4BVPWXOKYTKVCAVIS4E" — vira
--    dois dígitos, cai no corte e responde "nenhuma venda sua com esse
--    número". O fornecedor digitou o rastreio que está impresso no próprio
--    cartão ao lado e levou "não encontrado".
--
-- 2. O comprador não aparece em lugar nenhum da aba Devoluções, e é a ÚNICA
--    identificação que o pacote traz. "Se ele receber essas duas devoluções no
--    mesmo dia, eu não ia saber qual é qual."
--
-- 3. O campo "Nome na etiqueta" mostra o nome do perfil no FORNEXA. Na
--    etiqueta está o nome da conta do Mercado Livre, que é outro. Nome que não
--    bate atrapalha mais que a ausência dele.

-- ----------------------------------------------------------------------------
-- 1. A lista de devoluções passa a dizer de quem é o pacote
-- ----------------------------------------------------------------------------

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
  -- O nome impresso na etiqueta de devolução, dos dois lados dela.
  comprador text,
  conta_ml text
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

    -- Quem comprou: é o remetente da devolução, e o único nome que o pacote
    -- traz ligado a um pedido específico.
    o.customer_name,

    -- A conta do vendedor no Mercado Livre: é o nome que aparece como destino
    -- na etiqueta, e o que separa um vendedor do outro quando chegam dois
    -- pacotes no mesmo dia.
    c.account_name::text
  from public.devolucoes d
  join public.orders o on o.id = d.order_id
  left join public.profiles pr on pr.id = d.user_id
  left join public.ml_connections c on c.user_id = d.user_id
  where d.supplier_id = v_fornecedor
  order by d.avisada_em desc;
end;
$$;

grant execute on function public.fornecedor_minhas_devolucoes() to authenticated;


-- ----------------------------------------------------------------------------
-- 2. A busca aceita o que está impresso: número, rastreio ou nome
-- ----------------------------------------------------------------------------

drop function if exists public.fornecedor_busca_venda(text);

create or replace function public.fornecedor_busca_venda(p_numero text)
returns table (
  order_id uuid,
  produto text,
  quantidade integer,
  ml_order_id text,
  codigo_interno text,
  vendedor text,
  vendedor_whatsapp text,
  quem_recebe text,
  comprador text,
  conta_ml text,
  status text,
  devolucao_id uuid,
  devolucao_status text,
  devolucao_codigo text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fornecedor uuid;
  v_termo text;
  v_digitos text;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores';
  end if;

  v_termo := btrim(coalesce(p_numero, ''));
  v_digitos := regexp_replace(v_termo, '\D', '', 'g');

  -- Três buscas numa só, porque a etiqueta que chega no galpão pode trazer
  -- qualquer um dos três — e quem procura não deveria precisar saber em qual
  -- campo o que ele tem na mão se encaixa.
  --
  -- O corte mínimo é de três letras, e não de seis dígitos como antes: o
  -- antigo descartava rastreio ("MIOLMMY4BVPWXOKYTKVCAVIS4E" tem dois
  -- dígitos) e qualquer nome.
  if length(v_termo) < 3 then
    return;
  end if;

  return query
  select
    o.id,
    o.product_name,
    o.quantidade,
    o.ml_order_id::text,
    o.codigo_interno,
    coalesce(nullif(pr.empresa, ''), pr.name)::text,
    pr.whatsapp::text,
    coalesce(nullif(pr.quem_recebe, ''), pr.name)::text,
    o.customer_name,
    c.account_name::text,
    o.status::text,
    d.id,
    d.status::text,
    d.codigo_autorizacao
  from public.orders o
  left join public.profiles pr on pr.id = o.user_id
  left join public.ml_connections c on c.user_id = o.user_id
  left join lateral (
    select dv.id, dv.status, dv.codigo_autorizacao
    from public.devolucoes dv
    where dv.order_id = o.id
    order by dv.avisada_em desc
    limit 1
  ) d on true
  where o.supplier_id = v_fornecedor
    and (
      -- Número da venda, quando o que foi digitado tem dígitos suficientes.
      (length(v_digitos) >= 6 and o.ml_order_id::text like '%' || v_digitos || '%')
      -- Rastreio, comparado sem diferenciar maiúscula.
      or o.tracking_code ilike '%' || v_termo || '%'
      -- Nome do comprador, que é o que a etiqueta de devolução traz.
      or o.customer_name ilike '%' || v_termo || '%'
      -- Código que a equipe do fornecedor carimbou na separação.
      or o.codigo_interno ilike '%' || v_termo || '%'
    )
  order by o.created_at desc
  limit 10;
end;
$$;

revoke all on function public.fornecedor_busca_venda(text) from public, anon;
grant execute on function public.fornecedor_busca_venda(text) to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Entrando como fornecedor, no Portal, a busca de devolução tem de achar o
-- mesmo pedido pelos três caminhos:
--
--   MIOLMMY4BVPWXOKYTKVCAVIS4E   (rastreio — era o que falhava)
--   Leciano                      (nome do comprador)
--   2000018629480748             (número da venda)
