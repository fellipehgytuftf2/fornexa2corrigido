-- Suporte dentro do FORNEXA.
--
-- POR QUE EXISTE
--
-- As pessoas já estavam usando os Chamados para falar com o suporte. Chamado é
-- outra coisa: vendedor↔fornecedor sobre um pedido, com views e travas
-- próprias. Usado como suporte, ele leva a conversa errada para o Portal do
-- fornecedor — que passa a ler pergunta que não é dele.
--
-- O resto ia para o WhatsApp, onde nada fica registrado e a resposta se perde
-- entre conversas pessoais.
--
-- POR QUE NÃO APROVEITAR `tickets`
--
-- Precisaria de `order_id` nulo, `supplier_id` nulo, um autor novo no check e
-- um filtro em toda view do fornecedor para esconder as conversas que não são
-- dele. Cada um desses é uma chance de vazar conversa para o lado errado, numa
-- tabela que hoje funciona. Duas coisas diferentes, duas tabelas.
--
-- UMA CONVERSA POR PESSOA
--
-- Não é lista de chamados: é o fio de conversa com o suporte, como no WhatsApp
-- que ele está substituindo. Quem abre encontra o histórico e continua de onde
-- parou. Assunto por assunto viraria arquivamento — e ninguém arquiva.

create table if not exists public.suporte_conversas (
  id uuid primary key default gen_random_uuid(),

  -- Vale para vendedor e para fornecedor: os dois têm conta em `auth.users`, e
  -- o fornecedor entra pelo portal dele com a mesma sessão.
  user_id uuid not null unique references auth.users (id) on delete cascade,

  criada_em timestamptz not null default now(),
  ultima_mensagem_em timestamptz not null default now(),

  -- Quando cada lado leu por último. É o que produz o "não lida" dos dois
  -- lados sem precisar marcar mensagem por mensagem.
  lida_usuario_em timestamptz,
  lida_suporte_em timestamptz
);

comment on table public.suporte_conversas is
  'O fio de conversa entre uma pessoa e o suporte do FORNEXA. Uma por conta.';

create table if not exists public.suporte_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.suporte_conversas (id) on delete cascade,

  autor text not null check (autor in ('usuario', 'suporte')),
  autor_user_id uuid references auth.users (id) on delete set null,

  -- Texto OU imagem: quem manda só a foto do erro não deveria ser obrigado a
  -- escrever "olha aí".
  corpo text,
  imagem_path text,

  created_at timestamptz not null default now(),

  constraint mensagem_tem_conteudo check (
    coalesce(btrim(corpo), '') <> '' or coalesce(btrim(imagem_path), '') <> ''
  )
);

create index if not exists suporte_mensagens_conversa_idx
  on public.suporte_mensagens (conversa_id, created_at);

alter table public.suporte_conversas enable row level security;
alter table public.suporte_mensagens enable row level security;

-- Sem policy: tudo passa pelas funções abaixo. Uma porta só, com uma regra só.


/**
 * A conversa de quem está logado, criando-a se ainda não existir.
 *
 * Criar na primeira visita, e não no primeiro envio, é o que permite marcar
 * como lida antes de a pessoa escrever qualquer coisa.
 */
create or replace function public.minha_conversa_de_suporte()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'faça login novamente';
  end if;

  select id into v_id
  from public.suporte_conversas
  where user_id = auth.uid();

  if v_id is null then
    insert into public.suporte_conversas (user_id)
    values (auth.uid())
    returning id into v_id;
  end if;

  update public.suporte_conversas
  set lida_usuario_em = now()
  where id = v_id;

  return v_id;
end;
$$;

grant execute on function public.minha_conversa_de_suporte() to authenticated;


/** As mensagens da minha conversa. */
create or replace function public.minhas_mensagens_de_suporte()
returns table (
  id uuid,
  autor text,
  corpo text,
  imagem_path text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  select m.id, m.autor, m.corpo, m.imagem_path, m.created_at
  from public.suporte_mensagens m
  join public.suporte_conversas c on c.id = m.conversa_id
  where c.user_id = auth.uid()
  order by m.created_at;
end;
$$;

grant execute on function public.minhas_mensagens_de_suporte() to authenticated;


/**
 * Manda uma mensagem ao suporte.
 *
 * Quem é admin escrevendo na PRÓPRIA conversa continua sendo 'usuario'. Para
 * responder outra pessoa existe `suporte_responde`, logo abaixo — misturar as
 * duas faria o admin responder a si mesmo sem perceber.
 */
create or replace function public.enviar_mensagem_de_suporte(
  p_corpo text,
  p_imagem_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversa uuid;
begin
  v_conversa := public.minha_conversa_de_suporte();

  if coalesce(btrim(p_corpo), '') = '' and coalesce(btrim(p_imagem_path), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Escreva algo ou anexe uma imagem.');
  end if;

  insert into public.suporte_mensagens (conversa_id, autor, autor_user_id, corpo, imagem_path)
  values (v_conversa, 'usuario', auth.uid(), nullif(btrim(p_corpo), ''), nullif(btrim(p_imagem_path), ''));

  update public.suporte_conversas
  set ultima_mensagem_em = now(),
      lida_usuario_em = now()
  where id = v_conversa;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.enviar_mensagem_de_suporte(text, text) to authenticated;


/**
 * As conversas, para o suporte.
 *
 * Ordenadas pela última mensagem, e com `aguardando` dizendo quais têm
 * pergunta sem resposta — que é a única coisa que se procura numa lista destas.
 */
create or replace function public.suporte_conversas_abertas()
returns table (
  id uuid,
  user_id uuid,
  nome text,
  email text,
  empresa text,
  whatsapp text,
  ultima_mensagem_em timestamptz,
  aguardando boolean,
  mensagens bigint
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
    c.id,
    c.user_id,
    coalesce(nullif(p.name, ''), u.email),
    u.email,
    p.empresa,
    p.whatsapp,
    c.ultima_mensagem_em,
    (c.lida_suporte_em is null or c.ultima_mensagem_em > c.lida_suporte_em),
    (select count(*) from public.suporte_mensagens m where m.conversa_id = c.id)
  from public.suporte_conversas c
  join auth.users u on u.id = c.user_id
  left join public.profiles p on p.id = c.user_id
  order by c.ultima_mensagem_em desc;
end;
$$;

grant execute on function public.suporte_conversas_abertas() to authenticated;


/** As mensagens de uma conversa, para o suporte. Marca como lida. */
create or replace function public.suporte_mensagens_da_conversa(p_conversa uuid)
returns table (
  id uuid,
  autor text,
  corpo text,
  imagem_path text,
  created_at timestamptz
)
language plpgsql
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

  update public.suporte_conversas
  set lida_suporte_em = now()
  where suporte_conversas.id = p_conversa;

  return query
  select m.id, m.autor, m.corpo, m.imagem_path, m.created_at
  from public.suporte_mensagens m
  where m.conversa_id = p_conversa
  order by m.created_at;
end;
$$;

grant execute on function public.suporte_mensagens_da_conversa(uuid) to authenticated;


/** O suporte responde. */
create or replace function public.suporte_responde(
  p_conversa uuid,
  p_corpo text,
  p_imagem_path text default null
)
returns jsonb
language plpgsql
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

  if coalesce(btrim(p_corpo), '') = '' and coalesce(btrim(p_imagem_path), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Escreva algo ou anexe uma imagem.');
  end if;

  insert into public.suporte_mensagens (conversa_id, autor, autor_user_id, corpo, imagem_path)
  values (p_conversa, 'suporte', auth.uid(), nullif(btrim(p_corpo), ''), nullif(btrim(p_imagem_path), ''));

  update public.suporte_conversas
  set ultima_mensagem_em = now(),
      lida_suporte_em = now()
  where id = p_conversa;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.suporte_responde(uuid, text, text) to authenticated;


/** Quantas respostas o usuário ainda não leu. Para o aviso no menu. */
create or replace function public.suporte_nao_lidas()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quantas integer;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select count(*)
  into v_quantas
  from public.suporte_mensagens m
  join public.suporte_conversas c on c.id = m.conversa_id
  where c.user_id = auth.uid()
    and m.autor = 'suporte'
    and m.created_at > coalesce(c.lida_usuario_em, 'epoch'::timestamptz);

  return coalesce(v_quantas, 0);
end;
$$;

grant execute on function public.suporte_nao_lidas() to authenticated;


-- ----------------------------------------------------------------------------
-- As imagens
-- ----------------------------------------------------------------------------
-- Balde privado. Print de tela de suporte carrega endereço de cliente, valor de
-- pedido e às vezes a tela do banco — nada disso pode ficar em endereço
-- adivinhável.
--
-- O caminho começa com o id de quem enviou, e é isso que as políticas usam para
-- decidir. Admin lê tudo, porque é ele quem responde.

insert into storage.buckets (id, name, public)
values ('suporte', 'suporte', false)
on conflict (id) do nothing;

drop policy if exists "suporte envia imagem" on storage.objects;
create policy "suporte envia imagem"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'suporte'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    )
  );

drop policy if exists "suporte le imagem" on storage.objects;
create policy "suporte le imagem"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'suporte'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin'
      )
    )
  );
