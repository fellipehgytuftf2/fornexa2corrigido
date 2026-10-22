-- A resposta de quem está prestes a conectar o Mercado Livre.
--
-- POR QUE GUARDAR
--
-- Muita gente conecta a conta de COMPRADOR do Mercado Livre achando que é a
-- mesma coisa, e só descobre o erro no fim: monta o anúncio, clica em publicar
-- e leva recusa. Alguns pedem reembolso ali mesmo — pagaram uma ferramenta que
-- "não funciona", quando o que faltava era uma conta de vendedor.
--
-- A pergunta antes da conexão corta isso. Guardar a resposta serve para saber
-- o tamanho real do problema: quantos chegam sem conta de vendedor, e quantos
-- desses voltam e conectam depois de criar uma. Sem o número, a decisão de
-- investir mais nesse caminho seria chute.
--
-- A RESPOSTA NÃO TRANCA NADA
--
-- Quem diz "não tenho" segue para a conexão do mesmo jeito, depois de criar a
-- conta. A marca é registro, não permissão: dizer "sim" sem ter não deixa o
-- Mercado Livre aceitar, e dizer "não" não impede ninguém de continuar.

alter table public.profiles
  add column if not exists tinha_conta_vendedor boolean,
  add column if not exists tinha_conta_vendedor_em timestamptz;

comment on column public.profiles.tinha_conta_vendedor is
  'O que a pessoa respondeu antes de conectar: já tinha conta de vendedor no Mercado Livre (true) ou não (false). Registro para análise; não muda o que ela pode fazer.';

comment on column public.profiles.tinha_conta_vendedor_em is
  'Quando respondeu. Com a data dá para medir quanto tempo leva entre dizer "não tenho" e conectar de fato.';

-- A tabela é lida coluna a coluna por `authenticated` desde a auditoria de
-- 22/09: coluna nova fora da lista faz o SELECT inteiro falhar.
grant select (tinha_conta_vendedor, tinha_conta_vendedor_em),
      update (tinha_conta_vendedor, tinha_conta_vendedor_em)
  on public.profiles to authenticated;


-- ----------------------------------------------------------------------------
-- Quem responde é a própria pessoa
-- ----------------------------------------------------------------------------
-- Por função, e não por UPDATE direto, porque a data tem de ser do servidor:
-- relógio de navegador atrasado ou adiantado estragaria justamente a medida
-- que a coluna existe para dar.

create or replace function public.registrar_resposta_conta_vendedor(p_tinha boolean)
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
  set tinha_conta_vendedor = p_tinha,
      tinha_conta_vendedor_em = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.registrar_resposta_conta_vendedor(boolean) from public, anon;
grant execute on function public.registrar_resposta_conta_vendedor(boolean) to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Quantos responderam cada coisa, e quantos dos que não tinham conta
-- acabaram conectando:
--
-- select p.tinha_conta_vendedor,
--        count(*) as responderam,
--        count(c.id) as conectaram
-- from public.profiles p
-- left join public.ml_connections c on c.user_id = p.id
-- where p.tinha_conta_vendedor is not null
-- group by p.tinha_conta_vendedor;
