-- O vendedor é avisado no sino quando um pedido Flex trava por falta de
-- cadastro na transportadora.
--
-- POR QUE
--
-- O aviso existia só dentro da tela de Pedidos. Quem não abre a tela não fica
-- sabendo — e é justamente quem não abre que deixa o pedido parado. O
-- fornecedor fica esperando uma confirmação que o vendedor nem sabe que
-- precisa dar.
--
-- O recado é por fornecedor e se soma enquanto não for lido: dez vendas Flex
-- do mesmo fornecedor são um problema só, resolvido com um cadastro só.

create or replace function public.notificar_flex_sem_cadastro(
  p_user_id uuid,
  p_supplier_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_fornecedor text;
  v_transportadora text;
  v_contato text;
  v_parados integer;
  v_titulo text;
  v_corpo text;
begin
  select
    coalesce(nullif(s.company_name, ''), s.name),
    s.transportadora_nome,
    s.transportadora_contato
  into v_fornecedor, v_transportadora, v_contato
  from public.suppliers s
  where s.id = p_supplier_id;

  if coalesce(btrim(v_transportadora), '') = '' then
    return;
  end if;

  -- Já confirmou: não há o que avisar.
  if exists (
    select 1 from public.cadastros_na_transportadora c
    where c.user_id = p_user_id and c.supplier_id = p_supplier_id
  ) then
    return;
  end if;

  select count(*) into v_parados
  from public.orders o
  where o.user_id = p_user_id
    and o.supplier_id = p_supplier_id
    and o.ml_logistic_type = 'self_service'
    and o.status not in ('shipped', 'delivered', 'cancelled')
    and o.ml_order_status is distinct from 'cancelled';

  if v_parados = 0 then
    return;
  end if;

  v_titulo := case when v_parados = 1
    then '1 pedido Flex parado: falta cadastro na transportadora'
    else v_parados || ' pedidos Flex parados: falta cadastro na transportadora'
  end;

  v_corpo :=
    'O envio Flex de ' || coalesce(v_fornecedor, 'seu fornecedor') ||
    ' é feito pela ' || v_transportadora ||
    ', e ela só despacha para quem tem cadastro. Enquanto você não se cadastrar, ' ||
    'a etiqueta destes pedidos não libera.' ||
    case when coalesce(btrim(v_contato), '') <> ''
      then E'\n\nContato da transportadora: ' || v_contato
      else ''
    end ||
    E'\n\nDepois de se cadastrar, abra Pedidos e clique em "Já estou cadastrado".';

  -- Recado do mesmo tipo ainda não aberto: atualiza em vez de empilhar.
  select a.id into v_id
  from public.avisos a
  where a.alvo_user_id = p_user_id
    and a.tipo = 'flex-sem-cadastro'
    and not exists (
      select 1 from public.avisos_lidos l
      where l.aviso_id = a.id and l.user_id = p_user_id
    )
  order by a.criado_em desc
  limit 1;

  if v_id is null then
    insert into public.avisos (
      titulo, corpo, link_rotulo, link_para, alvo_user_id, tipo, quantidade
    )
    values (
      v_titulo, v_corpo, 'Ver meus pedidos', '/dashboard/orders',
      p_user_id, 'flex-sem-cadastro', v_parados
    );
  else
    update public.avisos
    set titulo = v_titulo, corpo = v_corpo, quantidade = v_parados, criado_em = now()
    where id = v_id;
  end if;
end;
$$;

revoke all on function public.notificar_flex_sem_cadastro(uuid, uuid) from public, anon;
grant execute on function public.notificar_flex_sem_cadastro(uuid, uuid) to service_role;


-- ----------------------------------------------------------------------------
-- O aviso nasce com a venda
-- ----------------------------------------------------------------------------
-- O webhook grava o tipo de logística junto com o pedido. É aqui que se sabe
-- que a venda é Flex, então é aqui que o recado sai.

create or replace function public.aviso_de_flex_no_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ml_logistic_type is distinct from 'self_service' then
    return new;
  end if;

  -- Em UPDATE, só quando o pedido ACABOU de virar Flex: sem isso, cada
  -- atualização de status reescreveria o aviso e o empurraria para o topo do
  -- sino de novo.
  if tg_op = 'UPDATE' and old.ml_logistic_type is not distinct from new.ml_logistic_type then
    return new;
  end if;

  if new.user_id is null or new.supplier_id is null then
    return new;
  end if;

  perform public.notificar_flex_sem_cadastro(new.user_id, new.supplier_id);

  return new;
end;
$$;

drop trigger if exists aviso_de_flex_no_pedido on public.orders;

create trigger aviso_de_flex_no_pedido
  after insert or update of ml_logistic_type on public.orders
  for each row
  execute function public.aviso_de_flex_no_pedido();


-- ----------------------------------------------------------------------------
-- Quantos pedidos Flex estão parados agora
-- ----------------------------------------------------------------------------
-- Para o ponto vermelho no menu, que precisa de um número e não da lista.

create or replace function public.meus_pedidos_flex_parados_total()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(*), 0)::integer
  from public.orders o
  join public.suppliers s on s.id = o.supplier_id
  where o.user_id = auth.uid()
    and o.ml_logistic_type = 'self_service'
    and nullif(btrim(coalesce(s.transportadora_nome, '')), '') is not null
    and o.status not in ('shipped', 'delivered', 'cancelled')
    and o.ml_order_status is distinct from 'cancelled'
    and not exists (
      select 1 from public.cadastros_na_transportadora c
      where c.user_id = o.user_id and c.supplier_id = o.supplier_id
    );
$$;

grant execute on function public.meus_pedidos_flex_parados_total() to authenticated;


-- ----------------------------------------------------------------------------
-- Os que já estão parados hoje também avisam
-- ----------------------------------------------------------------------------
-- Sem isto, só venda nova geraria recado, e quem já está travado continuaria
-- sem saber.

do $$
declare
  r record;
begin
  for r in
    select distinct o.user_id, o.supplier_id
    from public.orders o
    join public.suppliers s on s.id = o.supplier_id
    where o.ml_logistic_type = 'self_service'
      and nullif(btrim(coalesce(s.transportadora_nome, '')), '') is not null
      and o.status not in ('shipped', 'delivered', 'cancelled')
      and o.ml_order_status is distinct from 'cancelled'
  loop
    perform public.notificar_flex_sem_cadastro(r.user_id, r.supplier_id);
  end loop;
end;
$$;
