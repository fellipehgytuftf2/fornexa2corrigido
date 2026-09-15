-- A pausa por falta de estoque avisa o vendedor pelo sino, e aparece no Admin.
--
-- POR QUE
--
-- O FORNEXA pausa anúncio no Mercado Livre sem o vendedor pedir. No painel do
-- Mercado Livre ele só vê "pausado", sem motivo — e conclui que o sistema
-- quebrou, ou reativa na mão e vende o que não existe. Meus Produtos explica,
-- mas só para quem entra lá.
--
-- E o admin só enxergava isto por SQL: quantos pausados, quantos falharam,
-- quais contas desconectadas deixam anúncio sem estoque no ar.
--
-- AVISO PESSOAL
--
-- `avisos` era só recado para todos, recortado por data de criação da conta.
-- `alvo_user_id` faz o mesmo aviso servir a uma pessoa só. Aviso pessoal fica
-- fora da janela que abre sozinha — é recado de rotina, não comunicado — e
-- fora da lista de avisos do admin, que viraria uma parede.
--
-- UM RECADO, NÃO CEM
--
-- A pausa roda a cada 10 minutos, 150 anúncios por vez. Um aviso por rodada
-- encheria o sino de quem tem mil anúncios. Enquanto o vendedor não abre o
-- recado, as rodadas somam no mesmo aviso.


alter table public.avisos
  add column if not exists alvo_user_id uuid references auth.users (id) on delete cascade,
  add column if not exists tipo text,
  add column if not exists quantidade integer;

comment on column public.avisos.alvo_user_id is
  'Aviso pessoal: só esta conta vê. Nulo = recado para todos, recortado pelas datas.';

comment on column public.avisos.tipo is
  'Para avisos gerados pelo sistema: permite somar rodadas no mesmo recado ainda não lido.';

create index if not exists avisos_alvo_user_id_idx
  on public.avisos (alvo_user_id)
  where alvo_user_id is not null;


-- ----------------------------------------------------------------------------
-- A janela que abre sozinha: só recados para todos
-- ----------------------------------------------------------------------------

create or replace function public.meus_avisos()
returns table (
  id uuid,
  titulo text,
  corpo text,
  link_rotulo text,
  link_para text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_criado_em timestamptz;
begin
  if auth.uid() is null then
    return;
  end if;

  select u.created_at into v_criado_em
  from auth.users u
  where u.id = auth.uid();

  return query
  select a.id, a.titulo, a.corpo, a.link_rotulo, a.link_para
  from public.avisos a
  where a.ativo
    and a.alvo_user_id is null
    and (a.alvo_criados_ate is null or v_criado_em <= a.alvo_criados_ate)
    and (a.alvo_criados_desde is null or v_criado_em >= a.alvo_criados_desde)
    and not exists (
      select 1 from public.avisos_lidos l
      where l.aviso_id = a.id and l.user_id = auth.uid()
    )
  order by a.criado_em;
end;
$$;


-- ----------------------------------------------------------------------------
-- O sino: recados para todos, e os dele
-- ----------------------------------------------------------------------------

create or replace function public.minhas_notificacoes()
returns table (
  id uuid,
  titulo text,
  corpo text,
  link_rotulo text,
  link_para text,
  criado_em timestamptz,
  lida boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_criado_em timestamptz;
begin
  if auth.uid() is null then
    return;
  end if;

  select u.created_at into v_criado_em
  from auth.users u
  where u.id = auth.uid();

  return query
  select
    a.id,
    a.titulo,
    a.corpo,
    a.link_rotulo,
    a.link_para,
    a.criado_em,
    exists (
      select 1 from public.avisos_lidos l
      where l.aviso_id = a.id and l.user_id = auth.uid()
    )
  from public.avisos a
  where a.ativo
    and (a.alvo_user_id is null or a.alvo_user_id = auth.uid())
    and (a.alvo_criados_ate is null or v_criado_em <= a.alvo_criados_ate)
    and (a.alvo_criados_desde is null or v_criado_em >= a.alvo_criados_desde)
  order by a.criado_em desc
  limit 20;
end;
$$;


-- ----------------------------------------------------------------------------
-- A lista do admin: só os comunicados que ele escreveu
-- ----------------------------------------------------------------------------

create or replace function public.admin_listar_avisos()
returns table (
  id uuid,
  titulo text,
  corpo text,
  ativo boolean,
  criado_em timestamptz,
  alvo_criados_ate timestamptz,
  alvo_criados_desde timestamptz,
  leram bigint,
  alcance bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  return query
  select
    a.id, a.titulo, a.corpo, a.ativo, a.criado_em,
    a.alvo_criados_ate, a.alvo_criados_desde,

    (select count(*) from public.avisos_lidos l where l.aviso_id = a.id),

    (
      select count(*)
      from auth.users u
      join public.profiles p on p.id = u.id
      where coalesce(p.role, 'user') <> 'admin'
        and (a.alvo_criados_ate is null or u.created_at <= a.alvo_criados_ate)
        and (a.alvo_criados_desde is null or u.created_at >= a.alvo_criados_desde)
    )
  from public.avisos a
  where a.alvo_user_id is null
  order by a.criado_em desc;
end;
$$;


-- ----------------------------------------------------------------------------
-- O recado da pausa
-- ----------------------------------------------------------------------------
-- Chamado pela função de pausa ao fim de cada rodada, uma vez por vendedor.

create or replace function public.notificar_anuncios_por_estoque(
  p_user_id uuid,
  p_tipo text,
  p_quantidade integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_total integer;
  v_titulo text;
  v_corpo text;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    return;
  end if;

  -- Recado do mesmo tipo, ainda não aberto, do último dia: soma nele.
  select a.id, coalesce(a.quantidade, 0) into v_id, v_total
  from public.avisos a
  where a.alvo_user_id = p_user_id
    and a.tipo = p_tipo
    and a.criado_em > now() - interval '24 hours'
    and not exists (
      select 1 from public.avisos_lidos l
      where l.aviso_id = a.id and l.user_id = p_user_id
    )
  order by a.criado_em desc
  limit 1;

  v_total := coalesce(v_total, 0) + p_quantidade;

  if p_tipo = 'pausa-sem-estoque' then
    v_titulo := case when v_total = 1
      then '1 anúncio pausado: fornecedor sem estoque'
      else v_total || ' anúncios pausados: fornecedor sem estoque'
    end;
    v_corpo :=
      'O fornecedor ficou sem estoque destes produtos, então o FORNEXA pausou os anúncios no Mercado Livre para você não vender o que não existe.' || E'\n\n' ||
      'Eles voltam ao ar sozinhos quando o fornecedor repor. Não precisa fazer nada — e não reative na mão enquanto estiver sem estoque.';
  elsif p_tipo = 'reativado-com-estoque' then
    v_titulo := case when v_total = 1
      then '1 anúncio de volta ao ar'
      else v_total || ' anúncios de volta ao ar'
    end;
    v_corpo :=
      'O fornecedor repôs o estoque, e o FORNEXA reativou no Mercado Livre os anúncios que tinha pausado.';
  else
    return;
  end if;

  if v_id is null then
    insert into public.avisos (
      titulo, corpo, link_rotulo, link_para, alvo_user_id, tipo, quantidade
    )
    values (
      v_titulo, v_corpo, 'Ver meus produtos', '/dashboard/my-products',
      p_user_id, p_tipo, v_total
    );
  else
    -- Sobe para o topo do sino: é recado novo, mesmo somado.
    update public.avisos
    set titulo = v_titulo, corpo = v_corpo, quantidade = v_total, criado_em = now()
    where id = v_id;
  end if;
end;
$$;

revoke all on function public.notificar_anuncios_por_estoque(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.notificar_anuncios_por_estoque(uuid, text, integer)
  to service_role;


-- ----------------------------------------------------------------------------
-- O painel do admin
-- ----------------------------------------------------------------------------

create or replace function public.admin_pausas_por_estoque()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_resultado jsonb;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  select jsonb_build_object(
    'pausados',
      (select count(*) from public.user_products where pausado_sem_estoque_em is not null),

    -- Ativo, de produto zerado, e ainda sem a marca: fila, ou falha.
    'no_ar_sem_estoque',
      (
        select count(*)
        from public.user_products up
        join public.catalog_products p on p.id = up.catalog_product_id
        join public.suppliers s on s.id = p.supplier_id
        where s.controla_estoque
          and coalesce(p.stock, 0) <= 0
          and up.status = 'active'
          and up.ml_item_id is not null
          and up.pausado_sem_estoque_em is null
      ),

    'em_revisao',
      (select count(*) from public.user_products
        where pausado_sem_estoque_em is null and pausa_falha like '%under_review%'),

    'conta_desconectada',
      (select count(*) from public.user_products
        where pausado_sem_estoque_em is null and pausa_falha like 'Conta%'),

    'outras_falhas',
      (select count(*) from public.user_products
        where pausado_sem_estoque_em is null
          and pausa_falha is not null
          and pausa_falha not like '%under_review%'
          and pausa_falha not like 'Conta%'),

    -- Linha inteira: o nome da coluna de data do log não é o mesmo em todo
    -- lugar, e a tela escolhe.
    'ultima_rodada',
      (
        select to_jsonb(l)
        from public.log_integracao_ml l
        where l.contexto = 'pausar-sem-estoque'
        order by l.id desc
        limit 1
      ),

    -- Quem precisa reconectar para o FORNEXA conseguir pausar.
    'contas',
      coalesce((
        select jsonb_agg(c order by c.anuncios desc)
        from (
          select
            up.user_id,
            coalesce(nullif(pr.name, ''), u.email::text)::text as nome,
            u.email::text as email,
            pr.empresa::text as empresa,
            count(*) as anuncios
          from public.user_products up
          join auth.users u on u.id = up.user_id
          left join public.profiles pr on pr.id = up.user_id
          where up.pausado_sem_estoque_em is null
            and up.pausa_falha like 'Conta%'
          group by up.user_id, pr.name, u.email, pr.empresa
        ) c
      ), '[]'::jsonb)
  )
  into v_resultado;

  return v_resultado;
end;
$$;

grant execute on function public.admin_pausas_por_estoque() to authenticated;
