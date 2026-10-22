-- Prioridade do card do Kanban: vermelho urgente, verde não urgente.

alter table public.admin_tarefas
  add column if not exists prioridade text not null default 'normal'
    check (prioridade in ('urgente', 'normal'));

comment on column public.admin_tarefas.prioridade is
  'urgente (vermelho) ou normal (verde) -- só essas duas, é um selo visual, não uma fila.';
