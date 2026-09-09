-- Os avisos que este vendedor recebeu, lidos ou não.
--
-- POR QUE, SE JÁ EXISTE `meus_avisos`
--
-- `meus_avisos` devolve só os NÃO lidos, porque serve à janela que aparece uma
-- vez e some. Quem fecha aquela janela sem prestar atenção — e é o que se faz
-- com janela que aparece na frente do trabalho — não tem como voltar a ela.
--
-- O sino existe para isso: o aviso continua ali depois de fechado, e a pessoa
-- lê quando puder. Um aviso que só existe por três segundos é um aviso que
-- metade da base nunca leu.

create or replace function public.minhas_notificacoes()
returns table (
  id uuid,
  titulo text,
  corpo text,
  link_rotulo text,
  link_para text,
  criado_em timestamptz,
  lida boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_criado_em timestamptz;
begin
  if auth.uid() is null then
    return;
  end if;

  select u.created_at into v_criado_em
  from auth.users u
  where u.id = auth.uid();

  return query
  select
    a.id,
    a.titulo,
    a.corpo,
    a.link_rotulo,
    a.link_para,
    a.criado_em,
    exists (
      select 1 from public.avisos_lidos l
      where l.aviso_id = a.id and l.user_id = auth.uid()
    )
  from public.avisos a
  where a.ativo
    and (a.alvo_criados_ate is null or v_criado_em <= a.alvo_criados_ate)
    and (a.alvo_criados_desde is null or v_criado_em >= a.alvo_criados_desde)
  -- O mais novo em cima: no sino, o que chegou agora é o que se procura.
  order by a.criado_em desc
  limit 20;
end;
$$;

grant execute on function public.minhas_notificacoes() to authenticated;
