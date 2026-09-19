-- Recusado pode pedir de novo, mas só 7 dias depois da recusa.
--
-- Antes, recusa era para sempre: pedir de novo só devolvia "recusado". Agora
-- a mesma função reabre o pedido quando a semana passou — volta a ser
-- pendente e aparece de novo em Aceitar pedido. Antes disso, recusa com a
-- data em que libera.
--
-- A regra mora aqui, e não só na tela: o botão escondido não impede ninguém
-- de chamar a função pelo console do navegador.

create or replace function public.pedir_para_ser_afiliado()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conta uuid := auth.uid();
  v_situacao text;
  v_recusado_em timestamptz;
  v_nome text;
begin
  if v_conta is null then
    raise exception 'é preciso estar logado para pedir';
  end if;

  if not public.plano_em_dia(v_conta) then
    raise exception 'o programa de afiliados é para quem já tem plano ativo';
  end if;

  select a.situacao, coalesce(a.decidido_em, a.pedido_em)
  into v_situacao, v_recusado_em
  from public.afiliados a
  where a.conta = v_conta;

  if v_situacao = 'recusado' then
    if v_recusado_em > now() - interval '7 days' then
      raise exception 'você pode pedir de novo a partir de %',
        to_char((v_recusado_em + interval '7 days') at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');
    end if;

    -- Semana cumprida: o pedido recomeça do zero, sem link e sem checkout.
    update public.afiliados
    set situacao = 'pendente',
        pedido_em = now(),
        decidido_em = null,
        checkout_basico = '',
        checkout_premium = '',
        atualizado_em = now()
    where conta = v_conta;

    return 'pendente';
  end if;

  if v_situacao is not null then
    return v_situacao;
  end if;

  select p.name into v_nome from public.profiles p where p.id = v_conta;

  insert into public.afiliados (conta, apelido)
  values (v_conta, public.apelido_de_afiliado(v_nome));

  return 'pendente';
end;
$$;

grant execute on function public.pedir_para_ser_afiliado() to authenticated;
