-- ============================================================================
-- Cupons de influenciador
-- ============================================================================
--
-- A landing de oferta (fornexa.site/oferta) só deixa comprar com cupom. Até
-- aqui a lista de cupons era fixa no código e a tela "Influenciadores" não
-- gravava nada: o cupom criado ali sumia ao recarregar e a landing respondia
-- "Cupom não encontrado". Agora os dois leem e gravam esta tabela.
--
-- QUEM MEXE
--
-- Admin e co-produtor criam, ligam e desligam cupons (mesma regra da área de
-- afiliados). Quem compra não lê a tabela: a landing pergunta por
-- `conferir_cupom`, que só responde se o cupom existe e está ativo, e não
-- devolve a lista inteira.
--
-- O DESCONTO É SEMPRE 50%
--
-- O cupom leva R$ 338 → R$ 169/mês e R$ 594 → R$ 297, os preços dos checkouts
-- que já existem na Applyfy. Outro percentual precisaria de outro checkout,
-- por isso a coluna aceita só 50.

create table if not exists public.cupons (
  codigo     text primary key check (codigo ~ '^[A-Z0-9]{2,20}$'),
  nome       text not null check (length(trim(nome)) > 0),
  perfil     text not null default '',
  desconto   integer not null default 50 check (desconto = 50),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  criado_por uuid default auth.uid() references auth.users(id) on delete set null
);

alter table public.cupons enable row level security;

drop policy if exists "admin e co-produtor cuidam dos cupons" on public.cupons;

create policy "admin e co-produtor cuidam dos cupons"
  on public.cupons
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'coprodutor')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'coprodutor')
    )
  );

-- O painel (logado) lê e grava; a regra acima decide quem pode de fato.
-- Visitante sem login não lê a tabela: usa a função abaixo.
grant select, insert, update on public.cupons to authenticated;
revoke all on public.cupons from anon;

-- A landing confere um cupom por vez, sem login.
drop function if exists public.conferir_cupom(text);

create function public.conferir_cupom(p_codigo text)
returns table(codigo text, nome text, desconto integer, ativo boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select c.codigo, c.nome, c.desconto, c.ativo
  from public.cupons c
  where c.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'))
  limit 1;
$function$;

revoke all on function public.conferir_cupom(text) from public;
grant execute on function public.conferir_cupom(text) to anon, authenticated;

-- Aplicada em 18/11/2026 pelo conector do Supabase (com os cupons FORNEXA e
-- FORNEXA10, criados à parte).
--
-- Para conferir depois de aplicar:
-- select * from public.conferir_cupom('fornexa');
