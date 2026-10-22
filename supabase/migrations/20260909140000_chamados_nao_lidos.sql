-- Quantas respostas de chamado o vendedor ainda não leu.
--
-- O fornecedor responde e o vendedor não vê: a contagem existia, mas só dentro
-- da página de Chamados — e quem não abre a página não sabe que tem resposta.
-- É o mesmo problema que o suporte tinha, do outro lado.
--
-- Devolve só o número, para o aviso no menu. A lista com quem respondeu o quê
-- continua sendo a própria página.

create or replace function public.chamados_nao_lidos()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quantas integer;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select count(*)
  into v_quantas
  from public.ticket_messages m
  join public.tickets t on t.id = m.ticket_id
  where t.user_id = auth.uid()
    and m.autor = 'fornecedor'
    and m.created_at > coalesce(t.lido_vendedor_em, 'epoch'::timestamptz);

  return coalesce(v_quantas, 0);
end;
$$;

grant execute on function public.chamados_nao_lidos() to authenticated;
