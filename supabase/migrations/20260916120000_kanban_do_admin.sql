-- Kanban interno do Admin — "o que temos que fazer".
--
-- Sem relação com vendedor, fornecedor ou pedido: é só uma lista de tarefas
-- do time que toca o FORNEXA, organizada em três colunas fixas. Cada card
-- guarda a coluna e uma posição (ordem dentro da coluna) — arrastar solta
-- o card, o front recalcula a posição de quem ficou por perto e regrava.

create table if not exists public.admin_tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  coluna text not null default 'a_fazer' check (coluna in ('a_fazer', 'em_andamento', 'feito')),
  posicao integer not null default 0,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.admin_tarefas is
  'Quadro Kanban interno do Admin — tarefas do time, não tem relação com pedido/vendedor/fornecedor.';

comment on column public.admin_tarefas.coluna is
  'a_fazer | em_andamento | feito — fixas de propósito, sem tela pra criar coluna nova.';

comment on column public.admin_tarefas.posicao is
  'Ordem dentro da coluna. Recalculada no front a cada arrastar-e-soltar.';

create index if not exists admin_tarefas_coluna_posicao_idx
  on public.admin_tarefas (coluna, posicao);

alter table public.admin_tarefas enable row level security;

-- RLS sozinha não libera nada: sem o grant de base, todo mundo toma
-- "permission denied" antes mesmo da policy ser avaliada. Mesmo erro que já
-- apareceu antes neste projeto (falta de grant causando falha silenciosa).
grant select, insert, update, delete on table public.admin_tarefas to authenticated;

drop policy if exists "admin_gerencia_tarefas" on public.admin_tarefas;

create policy "admin_gerencia_tarefas"
  on public.admin_tarefas
  for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
