-- Cada afiliado tem o PRÓPRIO checkout.
--
-- A versão anterior disto assumiu errado: um checkout só para todo mundo, com
-- o código do afiliado pendurado na URL. Não é assim. Cada afiliado tem conta
-- própria na plataforma de pagamento, então tem link de checkout próprio — o
-- dinheiro cai direto na conta dele, não na nossa.
--
-- O que o FORNEXA faz é servir a mesma landing com os botões de comprar
-- trocados pelo checkout daquele afiliado. Ele divulga fornexa.site/CODIGO e
-- quem entrar por ali compra no checkout dele.
--
-- `configuracoes_checkout` continua valendo: é o nosso, o que a landing usa
-- quando o visitante chega sem link de afiliado nenhum.

create table if not exists public.afiliados (
  codigo text primary key,
  nome text,
  checkout_basico text not null default '',
  checkout_premium text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- O código vira endereço (fornexa.site/CODIGO). Sem espaço, acento ou
  -- barra, senão o link que o afiliado divulga não abre.
  constraint afiliados_codigo_valido check (codigo ~ '^[A-Za-z0-9_-]{2,40}$')
);

comment on table public.afiliados is
  'Afiliados cadastrados e o checkout próprio de cada um. O código é o endereço que ele divulga: fornexa.site/CODIGO.';

alter table public.afiliados enable row level security;

grant select, insert, update, delete on table public.afiliados to authenticated;

-- A tabela inteira é só do admin: lista de parceiros não é dado público.
drop policy if exists "só admin mexe nos afiliados" on public.afiliados;
create policy "só admin mexe nos afiliados"
  on public.afiliados
  for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


/**
 * O checkout de UM afiliado, para a landing montar os botões de comprar.
 *
 * Existe como função, e não como política de leitura na tabela, porque quem
 * chama isto é visitante anônimo. Com leitura direta liberada, qualquer um
 * baixaria a lista inteira de parceiros; aqui só sai o que a pessoa já sabia
 * — o código que ela digitou no endereço.
 *
 * Busca sem diferenciar maiúscula de minúscula: quem recebe o link por
 * WhatsApp digita do jeito que lembra.
 */
create or replace function public.checkout_do_afiliado(p_codigo text)
returns table (
  codigo text,
  checkout_basico text,
  checkout_premium text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.codigo, a.checkout_basico, a.checkout_premium
  from public.afiliados a
  where lower(a.codigo) = lower(trim(coalesce(p_codigo, '')))
  limit 1;
$$;

grant execute on function public.checkout_do_afiliado(text) to anon, authenticated;
