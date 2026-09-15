-- ============================================================================
-- Auditoria de segurança — dois buracos fechados
-- ============================================================================
--
-- 1. TICKETS SEM POLÍTICA RASTREÁVEL
--
-- `tickets` recebeu grant de select/insert/update/delete para `authenticated`
-- em 20260730120000, com o comentário "as policies estavam certas o tempo
-- todo". O problema: em nenhuma migração deste histórico a tabela aparece
-- sendo criada nem tendo policy definida — as regras vivem fora do que este
-- repositório rastreia. O código do front-end (Tickets.tsx) e os comentários
-- de outras migrações ("tickets não tem [update policy pro vendedor], por
-- isso a RPC é security definer") indicam que a intenção sempre foi: vendedor
-- só lê/abre os próprios, só admin muda status. Mas sem a policy visível
-- aqui, não dá para confirmar que é isso que está valendo no banco de
-- produção agora — e se algo divergiu, qualquer conta autenticada (inclusive
-- um login de fornecedor) poderia ler, editar ou apagar chamados de outros
-- vendedores, que carregam pedido, reclamação e histórico do cliente.
--
-- Em vez de confiar no que não dá para ver, este bloco redefine a política
-- do zero: apaga QUALQUER policy que exista hoje em `tickets`, seja qual for
-- o nome, e recria só as quatro que o produto realmente usa. Idempotente:
-- rodar de novo não muda nada.
--
-- 2. UPLOAD DE COMPROVANTE SEM DONO
--
-- Em 20260904140000, a policy de insert do bucket `comprovantes` foi escrita
-- de propósito sem checar de quem é o pedido — só o bucket_id. Fazia sentido
-- na hora: a leitura já é 100% fechada (só a Edge Function assina link, não
-- há select policy nenhuma), então um upload indevido não vaza nada de
-- ninguém. Mas ainda sobra brecha menor: qualquer conta logada — mesmo uma
-- criada só para isso — pode escrever em QUALQUER caminho do bucket,
-- inclusive `<id de um pedido alheio>/...`, gastando armazenamento à toa ou
-- competindo com o upload verdadeiro do vendedor.
--
-- O caminho já segue um padrão fixo (`RepasseNoPedido.tsx`): `<order.id>/
-- <timestamp>.<ext>`. Dá para exigir que esse primeiro pedaço do caminho seja
-- um pedido de que o remetente é dono, sem tocar na Edge Function de leitura.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. tickets: redefine as policies do zero, sem confiar no que já existe
-- ----------------------------------------------------------------------------
alter table public.tickets enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'tickets'
  loop
    execute format('drop policy %I on public.tickets', pol.policyname);
  end loop;
end $$;

create policy "vendedor_le_proprios_chamados_admin_le_todos"
  on public.tickets
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Cobre o formulário do vendedor (Tickets.tsx insere com seu próprio
-- user_id). O fornecedor não precisa de policy aqui: abre chamado só pela
-- RPC fornecedor_relata_problema, que é security definer e nasce no nome do
-- vendedor dono do pedido.
create policy "vendedor_abre_chamado_admin_tambem"
  on public.tickets
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Só admin muda status (é o que Tickets.tsx já assume ao mostrar o botão só
-- para admin). Vendedor marca como lido por RPC (marcar_chamado_lido),
-- security definer, então não precisa de policy de update aqui.
create policy "admin_gerencia_chamados"
  on public.tickets
  for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "admin_apaga_chamados"
  on public.tickets
  for delete
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ----------------------------------------------------------------------------
-- 2. storage.objects (bucket comprovantes): upload só no próprio pedido
-- ----------------------------------------------------------------------------
drop policy if exists "conta logada envia comprovante" on storage.objects;
drop policy if exists "conta logada envia comprovante do proprio pedido" on storage.objects;

create policy "conta logada envia comprovante do proprio pedido"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'comprovantes'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and (
          o.user_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
        )
    )
  );

commit;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Só as quatro novas devem aparecer:
-- select policyname, cmd from pg_policies
-- where schemaname = 'public' and tablename = 'tickets'
-- order by cmd;

-- (b) Upload num pedido alheio deve falhar (rode logado como um vendedor
-- diferente do dono de <um id de pedido de teste>):
-- select storage.foldername('11111111-1111-1111-1111-111111111111/teste.jpg');
