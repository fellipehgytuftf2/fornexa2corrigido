-- "Quem recebe" vazio passa a valer como o nome do perfil.
--
-- POR QUE
--
-- O campo nasceu separado porque o nome impresso na etiqueta de devolução é o
-- do endereço no Mercado Livre, que nem sempre é o do cadastro — pode ser um
-- sócio, um funcionário, a pessoa que assina na portaria.
--
-- Só que, para a maioria, os dois são o mesmo. Pedir que preencham de novo é
-- trabalho sem ganho, e campo que dá trabalho fica vazio — deixando o
-- fornecedor sem o dado justamente quando ele mais importa.
--
-- Vazio agora significa "é o mesmo do meu nome". Quem tem nome diferente na
-- etiqueta preenche; o resto não faz nada.

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
  prazo_cd date,
  codigo_autorizacao text,
  tentativas integer,
  ultima_tentativa_em timestamptz,
  ml_order_id text,
  vendedor text,
  vendedor_whatsapp text,
  quem_recebe text,
  codigo_interno text
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
    d.prazo_cd,
    d.codigo_autorizacao,
    d.tentativas,
    d.ultima_tentativa_em,
    o.ml_order_id::text,
    coalesce(nullif(pr.empresa, ''), pr.name)::text,
    pr.whatsapp::text,

    -- Vazio é "o mesmo do cadastro".
    coalesce(nullif(pr.quem_recebe, ''), pr.name)::text,

    o.codigo_interno
  from public.devolucoes d
  join public.orders o on o.id = d.order_id
  left join public.profiles pr on pr.id = d.user_id
  where d.supplier_id = v_fornecedor
  order by d.avisada_em desc;
end;
$$;

grant execute on function public.fornecedor_minhas_devolucoes() to authenticated;


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
  v_limpo text;
begin
  v_fornecedor := public.current_supplier_id();

  if v_fornecedor is null then
    raise exception 'apenas fornecedores';
  end if;

  v_limpo := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');

  if length(v_limpo) < 6 then
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
    o.status::text,
    d.id,
    d.status::text,
    d.codigo_autorizacao
  from public.orders o
  left join public.profiles pr on pr.id = o.user_id
  left join lateral (
    select dv.id, dv.status, dv.codigo_autorizacao
    from public.devolucoes dv
    where dv.order_id = o.id
    order by dv.avisada_em desc
    limit 1
  ) d on true
  where o.supplier_id = v_fornecedor
    and (
      o.ml_order_id::text like '%' || v_limpo || '%'
      or o.tracking_code like '%' || upper(btrim(coalesce(p_numero, ''))) || '%'
    )
  order by o.created_at desc
  limit 10;
end;
$$;

revoke all on function public.fornecedor_busca_venda(text) from public, anon;
grant execute on function public.fornecedor_busca_venda(text) to authenticated;
