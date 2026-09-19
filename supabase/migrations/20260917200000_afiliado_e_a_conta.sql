-- Afiliado é uma CONTA, não um código digitado.
--
-- Substitui a tabela `afiliados` de horas atrás, que guardava um código solto
-- inventado pelo admin. Na regra real, afiliado é um cliente que já comprou,
-- já tem conta, pediu para divulgar e foi aceito. Cada porta só abre depois
-- da anterior:
--
--   comprou -> criou conta -> pediu -> aceitamos -> configuramos os links
--
-- Antes da última porta, o link dele não existe. Depois dela, ele aparece
-- sozinho na conta do cliente, pronto para copiar.
--
-- `situacao` guarda só a decisão humana (pendente/aprovado/recusado). "Pode
-- divulgar" não é um quarto estado guardado: é aprovado E com os dois links
-- preenchidos. Estado que dá para calcular nunca se contradiz com o resto.

drop table if exists public.afiliados cascade;

create table public.afiliados (
  conta uuid primary key references auth.users (id) on delete cascade,

  -- Vira o endereço: fornexa.site/joao-silva. Minúsculo e sem acento porque
  -- quem recebe o link por WhatsApp digita do jeito que lembra.
  apelido text not null unique,

  situacao text not null default 'pendente'
    check (situacao in ('pendente', 'aprovado', 'recusado')),

  -- O checkout da conta DELE na plataforma de pagamento. Só o admin preenche.
  checkout_basico text not null default '',
  checkout_premium text not null default '',

  pedido_em timestamptz not null default now(),
  decidido_em timestamptz,
  atualizado_em timestamptz not null default now(),

  constraint afiliados_apelido_valido check (apelido ~ '^[a-z0-9-]{3,40}$')
);

comment on table public.afiliados is
  'Clientes aceitos como afiliados. O link só passa a existir quando situacao = aprovado e os dois checkouts estão preenchidos.';

create index afiliados_situacao_idx on public.afiliados (situacao);

alter table public.afiliados enable row level security;

grant select on table public.afiliados to authenticated;
grant insert, update, delete on table public.afiliados to authenticated;

-- O afiliado lê a própria linha — é assim que a conta dele sabe se está
-- aguardando, se foi aceita, e qual é o link.
drop policy if exists "afiliado lê o próprio cadastro" on public.afiliados;
create policy "afiliado lê o próprio cadastro"
  on public.afiliados
  for select
  to authenticated
  using (
    conta = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Escrever é só do admin. O cliente não entra sozinho na lista nem se aprova:
-- para pedir, existe a função abaixo, que fixa os valores que ele não escolhe.
drop policy if exists "só admin decide e configura afiliado" on public.afiliados;
create policy "só admin decide e configura afiliado"
  on public.afiliados
  for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


/**
 * Um apelido de endereço a partir do nome, sem acento e sem repetir.
 *
 * "João da Silva" vira "joao-da-silva". Se já existir, vira "joao-da-silva-2".
 * Sem `unaccent` instalado, a troca é na mão: são as letras que aparecem em
 * nome brasileiro, e o que sobrar fora disso simplesmente cai.
 */
create or replace function public.apelido_de_afiliado(p_nome text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base text;
  v_tentativa text;
  v_conta integer := 1;
begin
  v_base := lower(coalesce(nullif(trim(p_nome), ''), 'afiliado'));

  v_base := translate(
    v_base,
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn'
  );

  -- Tudo que não é letra, número ou hífen vira hífen; sobras nas pontas caem.
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  v_base := left(v_base, 36);

  if length(v_base) < 3 then
    v_base := 'afiliado';
  end if;

  v_tentativa := v_base;

  while exists (select 1 from public.afiliados a where a.apelido = v_tentativa) loop
    v_conta := v_conta + 1;
    v_tentativa := left(v_base, 36) || '-' || v_conta;
  end loop;

  return v_tentativa;
end;
$$;


/**
 * O cliente pede para ser afiliado.
 *
 * Exige plano em dia: o programa é para quem comprou. Pedir duas vezes não
 * cria duas linhas nem reabre decisão já tomada — devolve a situação atual,
 * que é o que a tela dele precisa mostrar.
 */
create or replace function public.pedir_para_ser_afiliado()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conta uuid := auth.uid();
  v_situacao text;
  v_nome text;
begin
  if v_conta is null then
    raise exception 'é preciso estar logado para pedir';
  end if;

  if not public.plano_em_dia(v_conta) then
    raise exception 'o programa de afiliados é para quem já tem plano ativo';
  end if;

  select a.situacao into v_situacao
  from public.afiliados a
  where a.conta = v_conta;

  if v_situacao is not null then
    return v_situacao;
  end if;

  select p.name into v_nome from public.profiles p where p.id = v_conta;

  insert into public.afiliados (conta, apelido)
  values (v_conta, public.apelido_de_afiliado(v_nome));

  return 'pendente';
end;
$$;

grant execute on function public.pedir_para_ser_afiliado() to authenticated;


/**
 * O checkout de um afiliado, para a landing montar os botões de comprar.
 *
 * Função, e não leitura direta, porque quem chama é visitante anônimo: assim
 * sai só o que a pessoa já sabia — o apelido que veio no endereço — e nunca a
 * lista de parceiros.
 *
 * Só responde quem foi aprovado E tem os dois links. Endereço de quem está
 * pendente não vende nada: cai no checkout da casa, como qualquer visita.
 *
 * O `drop` antes é obrigatório: a versão anterior devolvia uma coluna
 * `codigo` em vez de `apelido`, e `create or replace` não troca o tipo de
 * retorno de função que já existe.
 */
drop function if exists public.checkout_do_afiliado(text);

create or replace function public.checkout_do_afiliado(p_codigo text)
returns table (
  apelido text,
  checkout_basico text,
  checkout_premium text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.apelido, a.checkout_basico, a.checkout_premium
  from public.afiliados a
  where a.apelido = lower(trim(coalesce(p_codigo, '')))
    and a.situacao = 'aprovado'
    and a.checkout_basico <> ''
    and a.checkout_premium <> ''
  limit 1;
$$;

grant execute on function public.checkout_do_afiliado(text) to anon, authenticated;


/**
 * A lista que o Admin vê: quem pediu, quem foi aceito, e de quem falta link.
 *
 * Junta nome e e-mail do perfil porque uma lista de `uuid` não diz a ninguém
 * quem está esperando resposta.
 */
create or replace function public.admin_afiliados_cadastrados()
returns table (
  conta uuid,
  apelido text,
  nome text,
  email text,
  situacao text,
  checkout_basico text,
  checkout_premium text,
  pedido_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores podem ver os afiliados';
  end if;

  return query
  select
    a.conta,
    a.apelido,
    p.name,
    p.email,
    a.situacao,
    a.checkout_basico,
    a.checkout_premium,
    a.pedido_em
  from public.afiliados a
  join public.profiles p on p.id = a.conta
  order by
    -- Quem está esperando decisão aparece primeiro: é o que exige ação.
    case a.situacao when 'pendente' then 0 when 'aprovado' then 1 else 2 end,
    a.pedido_em;
end;
$$;

grant execute on function public.admin_afiliados_cadastrados() to authenticated;
