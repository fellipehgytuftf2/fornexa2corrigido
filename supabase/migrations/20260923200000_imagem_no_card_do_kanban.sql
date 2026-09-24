-- Print dentro do card do Kanban.
--
-- POR QUE
--
-- O relato de um problema quase sempre começa por uma foto da tela. Hoje ela
-- vai pelo WhatsApp e o card fica com a descrição sem a prova — quem lê depois
-- não vê o que a pessoa viu.
--
-- COMO
--
-- Uma lista de caminhos no card. O arquivo em si vai para um balde privado,
-- lido por URL assinada: print de tela do FORNEXA mostra endereço de cliente e
-- valor de pedido, e isso não pode ficar em endereço adivinhável.
--
-- O Kanban inteiro já é só do admin (ver 20260916120000_kanban_do_admin.sql),
-- então as políticas do balde repetem a mesma regra: admin, e mais ninguém.

alter table public.admin_tarefas
  add column if not exists imagens text[] not null default '{}';

comment on column public.admin_tarefas.imagens is
  'Caminhos das imagens do card dentro do balde `kanban`. Lidas por URL assinada.';

insert into storage.buckets (id, name, public)
values ('kanban', 'kanban', false)
on conflict (id) do nothing;

drop policy if exists "kanban envia imagem" on storage.objects;
create policy "kanban envia imagem"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'kanban'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "kanban le imagem" on storage.objects;
create policy "kanban le imagem"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'kanban'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "kanban apaga imagem" on storage.objects;
create policy "kanban apaga imagem"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'kanban'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) A coluna existe?
-- select column_name, data_type from information_schema.columns
-- where table_schema = 'public' and table_name = 'admin_tarefas'
--   and column_name = 'imagens';

-- (b) O balde e as três políticas existem?
-- select id, public from storage.buckets where id = 'kanban';
-- select policyname, cmd from pg_policies
-- where schemaname = 'storage' and policyname like 'kanban%';
