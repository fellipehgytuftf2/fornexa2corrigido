-- Link de checkout configurável pelo admin, sem precisar mexer em variável de
-- ambiente nem fazer novo deploy.
--
-- Os dois links (Básico e Premium) são de um app separado (Applyfy), o mesmo
-- para todo mundo — só muda o `?code=` que identifica o afiliado. Antes eles
-- viviam em VITE_CHECKOUT_BASICO/VITE_CHECKOUT_PREMIUM, fixos no build. Agora
-- o admin cola o link aqui, na hora, e tanto a landing quanto o link de cada
-- afiliado passam a usar ele na hora seguinte.
--
-- Linha única (id sempre 1): não existe "qual configuração", só existe "a
-- configuração".
create table if not exists public.configuracoes_checkout (
  id smallint primary key default 1 check (id = 1),
  checkout_basico text not null default '',
  checkout_premium text not null default '',
  atualizado_em timestamptz not null default now()
);

insert into public.configuracoes_checkout (id)
values (1)
on conflict (id) do nothing;

alter table public.configuracoes_checkout enable row level security;

-- Visitante anônimo da landing precisa ler isto para montar o botão de
-- assinar — não é dado sensível, é só o endereço de checkout.
grant select on table public.configuracoes_checkout to anon, authenticated;
grant update on table public.configuracoes_checkout to authenticated;

drop policy if exists "qualquer um lê os links de checkout" on public.configuracoes_checkout;
create policy "qualquer um lê os links de checkout"
  on public.configuracoes_checkout
  for select
  to anon, authenticated
  using (true);

drop policy if exists "só admin configura os links de checkout" on public.configuracoes_checkout;
create policy "só admin configura os links de checkout"
  on public.configuracoes_checkout
  for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
