-- Divulgar no Facebook: o texto pronto, e o registro de quem usou.
--
-- O QUE É
--
-- O anúncio publicado fica esperando o Mercado Livre trazer comprador. Quem
-- quer apressar isso divulga em grupo de Facebook — e hoje faz na mão: abre o
-- anúncio, copia o endereço, escreve a mensagem, procura o grupo. Quatro
-- passos que o FORNEXA pode deixar prontos.
--
-- O QUE NÃO É
--
-- Não é integração com a Meta. Desde junho de 2026 eles não permitem que
-- ferramenta de terceiro publique em grupo nem consulte grupos pela API.
-- Quem publica é a pessoa, dentro do Facebook. O FORNEXA prepara o texto e
-- abre as telas certas, e nada além disso — não há login do Facebook, token,
-- nem chamada de API em lugar nenhum deste recurso.
--
-- POR QUE REGISTRAR O USO
--
-- Não dá para saber se o post foi publicado: isso acontece fora, no Facebook.
-- Dá para saber se a ferramenta é usada, e em quais produtos. É a diferença
-- entre lançar a próxima melhoria em cima de uso real e em cima de palpite.

create table if not exists public.divulgacoes (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users (id) on delete cascade,
  user_product_id uuid references public.user_products (id) on delete set null,

  acao text not null check (acao in ('copiou', 'buscou_grupos', 'compartilhou')),
  canal text not null default 'facebook',

  criado_em timestamptz not null default now()
);

comment on table public.divulgacoes is
  'Uso da ferramenta de divulgação: quem preparou texto, procurou grupo ou abriu o compartilhamento. Não diz se o post saiu — isso acontece fora, no Facebook.';

create index if not exists divulgacoes_user_idx on public.divulgacoes (user_id, criado_em desc);
create index if not exists divulgacoes_produto_idx on public.divulgacoes (user_product_id);

alter table public.divulgacoes enable row level security;
-- Sem policy: passa pela função abaixo, como o resto do sistema.


create or replace function public.registrar_divulgacao(
  p_user_product_id uuid,
  p_acao text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'é preciso estar logado';
  end if;

  if p_acao not in ('copiou', 'buscou_grupos', 'compartilhou') then
    raise exception 'ação desconhecida: %', p_acao;
  end if;

  insert into public.divulgacoes (user_id, user_product_id, acao)
  values (
    auth.uid(),
    -- O anúncio tem de ser de quem está logado. Sem esta volta, um id
    -- qualquer colado na chamada sujaria a medição com produto de outro.
    (
      select up.id from public.user_products up
      where up.id = p_user_product_id and up.user_id = auth.uid()
    ),
    p_acao
  );
end;
$$;

revoke all on function public.registrar_divulgacao(uuid, text) from public, anon;
grant execute on function public.registrar_divulgacao(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- Nasce desligada
-- ----------------------------------------------------------------------------
-- Sobe em produção invisível: só a conta admin enxerga, porque
-- `minhas_funcionalidades()` libera admin por padrão. Lançar para todos é um
-- clique em Admin → Funcionalidades em teste, sem deploy.

insert into public.funcionalidades (chave, titulo, descricao)
values (
  'divulgar-no-facebook',
  'Divulgar no Facebook',
  'Botão em Meus Anúncios que prepara a mensagem com o link do anúncio, abre a busca de grupos e o compartilhamento do Facebook. A publicação é feita pela pessoa, fora do FORNEXA.'
)
on conflict (chave) do nothing;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) A funcionalidade existe e está fechada:
-- select chave, para_todos from public.funcionalidades
-- where chave = 'divulgar-no-facebook';

-- (b) Uso, depois de testar:
-- select acao, count(*) from public.divulgacoes group by acao;

-- (c) Anúncios mais divulgados:
-- select up.announcement_title, count(*)
-- from public.divulgacoes d
-- join public.user_products up on up.id = d.user_product_id
-- group by 1 order by 2 desc limit 10;
