-- O suporte apaga uma conversa encerrada.
--
-- Uma conversa por conta e para sempre significa uma lista que só cresce: daqui
-- a um ano são trezentas linhas, e a que precisa de resposta hoje está no meio
-- delas. Apagar o que já foi resolvido é o que mantém a lista legível.
--
-- Some para os dois lados, e é isso mesmo: a conversa é uma só. Da próxima vez
-- que a pessoa abrir o Suporte, começa um fio novo — que é o que ela espera de
-- um atendimento encerrado meses atrás.
--
-- AS IMAGENS FICAM
--
-- Apagar a linha não apaga o arquivo no balde: SQL não alcança o Storage. Ficam
-- lá, órfãs e inacessíveis pela conversa, ocupando espaço. É pouco, e limpar
-- direito exigiria varrer o balde por função — trabalho para quando o espaço
-- incomodar de verdade, não antes.

create or replace function public.suporte_apagar_conversa(p_conversa uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'apenas administradores';
  end if;

  -- As mensagens saem junto, pelo `on delete cascade`.
  delete from public.suporte_conversas where id = p_conversa;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.suporte_apagar_conversa(uuid) to authenticated;
