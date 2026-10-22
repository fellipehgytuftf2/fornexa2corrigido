-- As contas que sumiam de Admin → Contas e acessos.
--
-- O QUE ESTAVA ACONTECENDO
--
-- A tela carrega tudo de uma vez com `admin_mapa_de_acesso()` e faz a busca
-- no navegador, dentro do que carregou. Só que o PostgREST corta toda
-- resposta em 1000 linhas por padrão — e isso vale também para função que
-- devolve tabela.
--
-- Em 23/09/2026 são 5795 contas em `profiles`. A tela recebia 1000. Como a
-- função ordena por `last_sign_in_at desc nulls last`, as 1000 que chegavam
-- eram as que entraram mais recentemente: quem nunca entrou, ou entrou há
-- semanas, simplesmente não existia para a busca. Nada de errado com a conta
-- — ela só nunca chegava ao navegador.
--
-- A CORREÇÃO
--
-- Devolver o mapa inteiro em UMA linha, como json. O teto do PostgREST é de
-- linhas, não de tamanho: uma linha sempre passa inteira.
--
-- A função antiga continua de pé, sem mudança — outra tela pode estar usando,
-- e trocar o tipo de retorno dela exigiria derrubar e recriar.

create or replace function public.admin_mapa_de_acesso_completo()
returns json
language sql
stable
security definer
set search_path = public
as $$
  -- `admin_mapa_de_acesso()` já recusa quem não é admin.
  select coalesce(json_agg(mapa), '[]'::json)
  from public.admin_mapa_de_acesso() as mapa;
$$;

comment on function public.admin_mapa_de_acesso_completo() is
  'O mesmo mapa de acesso, em uma linha só de json. Existe porque o PostgREST corta a versão em tabela nas primeiras 1000 contas — ver migração 20260923210000.';

revoke all on function public.admin_mapa_de_acesso_completo() from public, anon;
grant execute on function public.admin_mapa_de_acesso_completo() to authenticated;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- (a) Quantas contas existem de verdade:
-- select count(*) from public.profiles;

-- (b) Quantas a tela passa a receber (entrando com a sua conta admin):
-- select json_array_length(public.admin_mapa_de_acesso_completo());
