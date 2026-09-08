-- Quantas conversas esperam resposta do suporte.
--
-- O balão do admin não tinha número nenhum: a mensagem chegava e ficava lá até
-- ele resolver abrir. Contar de dentro da lista não servia — a lista só carrega
-- quando o balão abre, que é justamente o que se quer evitar ter de fazer.
--
-- Devolve só o número, e não as conversas: é o que o balão precisa, e pedir a
-- lista inteira a cada minuto seria caro para mostrar um algarismo.

create or replace function public.suporte_esperando()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quantas integer;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    return 0;
  end if;

  select count(*)
  into v_quantas
  from public.suporte_conversas c
  where c.lida_suporte_em is null
     or c.ultima_mensagem_em > c.lida_suporte_em;

  return coalesce(v_quantas, 0);
end;
$$;

grant execute on function public.suporte_esperando() to authenticated;
