-- Conquistas, foto de perfil e como o vendedor aparece no ranking.
--
-- POR QUE
--
-- Vender o primeiro produto é o momento em que a pessoa decide se o FORNEXA
-- funciona para ela. Hoje esse momento passa em branco: o pedido entra na
-- lista como qualquer outro. Um selo e uma mensagem transformam o mesmo fato
-- em uma razão para publicar o próximo produto.
--
-- O QUE ESTA MIGRAÇÃO FAZ, E O QUE NÃO FAZ
--
-- Cria a estrutura: os selos, quem os tem, a comemoração pendente, a foto e a
-- privacidade. Não mexe em pedido, etiqueta, repasse nem Portal — o ranking
-- apenas SOMA o que já existe em `orders`.
--
-- POR QUE A COMEMORAÇÃO É UMA TABELA
--
-- A pessoa quase nunca está com a tela aberta na hora em que a venda cai. Sem
-- guardar, a mensagem se perde exatamente para quem ela foi escrita.


-- ----------------------------------------------------------------------------
-- Os selos
-- ----------------------------------------------------------------------------

create table if not exists public.conquistas (
  chave text primary key
    constraint conquistas_chave_valida check (chave ~ '^[a-z0-9-]{2,60}$'),

  nome text not null,
  descricao text not null,

  -- Qual desenho o selo usa. O componente decide o traço; aqui fica o nome.
  icone text not null default 'estrela',

  -- Em texto, de propósito: a regra de "Primeira Venda" é a única implementada
  -- hoje, e as outras ainda não foram decididas. Guardar a intenção evita que
  -- o selo nasça sem ninguém lembrar o que ele significava.
  regra text,

  -- Selo que ainda não tem regra fica cadastrado e apagado na tela.
  ativa boolean not null default false,

  ordem integer not null default 100,
  criada_em timestamptz not null default now()
);

comment on table public.conquistas is
  'Os selos que existem. Inativo aparece bloqueado, com cadeado — é o que dá ao vendedor o próximo alvo.';


create table if not exists public.conquistas_do_usuario (
  chave text not null references public.conquistas (chave) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  desbloqueada_em timestamptz not null default now(),

  primary key (chave, user_id)
);

comment on table public.conquistas_do_usuario is
  'Quem já desbloqueou cada selo. A chave primária composta é o que torna o desbloqueio idempotente.';

create index if not exists conquistas_do_usuario_user_idx
  on public.conquistas_do_usuario (user_id);


-- ----------------------------------------------------------------------------
-- A comemoração que espera a pessoa voltar
-- ----------------------------------------------------------------------------

create table if not exists public.comemoracoes_pendentes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  chave text not null references public.conquistas (chave) on delete cascade,

  criada_em timestamptz not null default now(),
  vista_em timestamptz,

  -- Uma comemoração por selo por pessoa: o mesmo motivo não comemora duas
  -- vezes, nem quando o gatilho roda de novo.
  unique (user_id, chave)
);

comment on table public.comemoracoes_pendentes is
  'A mensagem de parabéns que ainda não foi mostrada. Some da tela quando vista, e fica no registro.';

create index if not exists comemoracoes_pendentes_por_ver_idx
  on public.comemoracoes_pendentes (user_id)
  where vista_em is null;


alter table public.conquistas enable row level security;
alter table public.conquistas_do_usuario enable row level security;
alter table public.comemoracoes_pendentes enable row level security;
-- Sem policy: tudo passa pelas funções, como no resto do sistema.


-- ----------------------------------------------------------------------------
-- O perfil: foto, apelido e privacidade
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists foto_path text,
  add column if not exists apelido text,
  add column if not exists ranking_visibilidade text not null default 'apelido'
    constraint profiles_ranking_visibilidade_valida
    check (ranking_visibilidade in ('nome', 'apelido', 'oculto')),
  add column if not exists ranking_mostra_valor boolean not null default true;

comment on column public.profiles.foto_path is
  'Caminho da foto no bucket `avatares`. Nulo mostra as iniciais do nome.';

comment on column public.profiles.apelido is
  'Como a pessoa quer ser chamada no ranking. Vazio cai no primeiro nome.';

comment on column public.profiles.ranking_visibilidade is
  'nome, apelido ou oculto. Oculto aparece como "Vendedor anônimo" — a posição continua valendo.';

comment on column public.profiles.ranking_mostra_valor is
  'Falso esconde o faturamento e mostra só a posição.';

-- A tabela é lida coluna a coluna por `authenticated` desde a auditoria de
-- 22/09: coluna nova fora da lista faz o SELECT INTEIRO falhar.
grant select (foto_path, apelido, ranking_visibilidade, ranking_mostra_valor)
  on public.profiles to authenticated;

grant update (foto_path, apelido, ranking_visibilidade, ranking_mostra_valor)
  on public.profiles to authenticated;


-- ----------------------------------------------------------------------------
-- O lugar das fotos
-- ----------------------------------------------------------------------------
-- Público de propósito: a foto aparece no ranking, que é uma lista de outras
-- pessoas. Link assinado por foto de cada linha faria dezenas de chamadas para
-- mostrar uma tabela.

insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do nothing;

drop policy if exists "avatar e publico para ver" on storage.objects;
create policy "avatar e publico para ver"
  on storage.objects for select
  using (bucket_id = 'avatares');

drop policy if exists "cada um manda a propria foto" on storage.objects;
create policy "cada um manda a propria foto"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatares'
    -- A foto mora numa pasta com o id da pessoa: `avatares/<uid>/foto.jpg`.
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cada um troca a propria foto" on storage.objects;
create policy "cada um troca a propria foto"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cada um apaga a propria foto" on storage.objects;
create policy "cada um apaga a propria foto"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);


-- ----------------------------------------------------------------------------
-- Os selos que existem
-- ----------------------------------------------------------------------------
-- Só "Primeira Venda" nasce com regra. Os outros ficam cadastrados e
-- bloqueados: é o mapa do que vem pela frente, e cada um ganha regra quando
-- ela for decidida.

insert into public.conquistas (chave, nome, descricao, icone, regra, ativa, ordem)
values
  ('primeira-venda', 'Primeira Venda',
   'Sua primeira venda confirmada no FORNEXA.',
   'raio', 'Primeira venda com pagamento aprovado e sem estorno.', true, 1),

  ('lider-de-vendas', 'Líder de Vendas',
   'Primeiro lugar no ranking do mês.', 'coroa', null, false, 2),

  ('alta-performance', 'Alta Performance',
   'Faturamento acima da meta do mês.', 'foguete', null, false, 3),

  ('vendas-crescentes', 'Vendas Crescentes',
   'Faturou mais que no mês anterior.', 'grafico', null, false, 4),

  ('estrela-de-vendas', 'Estrela de Vendas',
   'Destaque entre os vendedores do mês.', 'estrela', null, false, 5),

  ('top-10', 'Top 10',
   'Entre os dez maiores faturamentos do mês.', 'medalha', null, false, 6),

  ('crescimento', 'Crescimento',
   'Evolução constante de faturamento.', 'seta', null, false, 7),

  ('foco-total', 'Foco Total',
   'Constância: vendas em semanas seguidas.', 'alvo', null, false, 8)
on conflict (chave) do nothing;
