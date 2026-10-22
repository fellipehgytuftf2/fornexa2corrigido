-- O que a pessoa quer vender.
--
-- POR QUE
--
-- O catálogo tem quase 900 produtos de tudo quanto é tipo. Quem entra pela
-- primeira vez vê fone de ouvido ao lado de ração e furador de coco, e a
-- primeira reação é rolar sem rumo. Perguntar o nicho na entrada troca uma
-- lista enorme por uma lista que parece feita para a pessoa.
--
-- SUGESTÃO, NÃO TRAVA
--
-- A escolha decide como o catálogo ABRE, e nada além disso. O seletor de
-- categoria da tela continua mandando: limpar o filtro mostra tudo, na hora.
-- Travar faria a pessoa achar que o catálogo encolheu — e procurar suporte
-- para pedir de volta produtos que nunca saíram.
--
-- NULO E VAZIO SÃO COISAS DIFERENTES
--
-- Nulo é quem ainda não respondeu: para essa pessoa a pergunta aparece. Lista
-- vazia é quem respondeu "pular" — e a pergunta não volta, porque insistir com
-- quem já disse não é a forma mais rápida de ensinar alguém a ignorar o que a
-- tela mostra.

alter table public.profiles
  add column if not exists categorias_preferidas text[];

comment on column public.profiles.categorias_preferidas is
  'Categorias do catálogo que a pessoa escolheu ao entrar. Nulo = ainda não perguntamos; vazio = ela pulou. Decide só como o catálogo abre.';

-- A tabela é lida coluna a coluna por `authenticated` desde a auditoria de
-- 22/09: coluna nova fora da lista faz o SELECT inteiro falhar.
grant select (categorias_preferidas), update (categorias_preferidas)
  on public.profiles to authenticated;


-- ----------------------------------------------------------------------------
-- A resposta, escrita pela própria pessoa
-- ----------------------------------------------------------------------------
-- Por função para o "pular" ter como se registrar: um UPDATE direto com lista
-- vazia é indistinguível de um engano, e por função fica explícito que vazio é
-- uma resposta.

create or replace function public.salvar_nicho(p_categorias text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'é preciso estar logado';
  end if;

  update public.profiles
  set categorias_preferidas = coalesce(p_categorias, array[]::text[])
  where id = auth.uid();
end;
$$;

revoke all on function public.salvar_nicho(text[]) from public, anon;
grant execute on function public.salvar_nicho(text[]) to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Quantos responderam, pularam e ainda não viram a pergunta:
-- select
--   count(*) filter (where categorias_preferidas is null)              as nao_perguntados,
--   count(*) filter (where cardinality(categorias_preferidas) = 0)     as pularam,
--   count(*) filter (where cardinality(categorias_preferidas) > 0)     as escolheram
-- from public.profiles;

-- As categorias mais pedidas:
-- select unnest(categorias_preferidas) as categoria, count(*)
-- from public.profiles
-- where cardinality(categorias_preferidas) > 0
-- group by 1 order by 2 desc;
