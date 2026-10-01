-- Quem vende sem WhatsApp cadastrado é avisado antes de bater na trava.
--
-- POR QUE
--
-- Publicar passou a exigir WhatsApp. Quem já vende e tem o campo vazio só vai
-- descobrir no meio de uma publicação — parado, sem entender, achando que o
-- sistema quebrou.
--
-- O aviso chega antes, explica o motivo e some sozinho quando a pessoa
-- preenche: ele é recado de pendência, não comunicado permanente.
--
-- POR QUE PESSOAL, E NÃO UM AVISO PARA TODOS
--
-- Avisar quem já preencheu gasta a atenção de quem não precisa fazer nada — e
-- aviso que não é para você ensina a ignorar o sino.

do $$
declare
  r record;
  v_quantos integer := 0;
begin
  for r in
    select u.id
    from auth.users u
    join public.profiles p on p.id = u.id
    where coalesce(p.role, 'user') <> 'admin'
      and length(regexp_replace(coalesce(p.whatsapp, ''), '\D', '', 'g')) < 10
      -- Só quem já publicou: quem nunca vendeu não é cobrado por um campo que
      -- ainda não faz falta.
      and exists (select 1 from public.user_products up where up.user_id = u.id)
      -- Rodar a migração duas vezes não pode render dois recados iguais no
      -- sino. Já avisado e ainda sem ler = nada a fazer.
      and not exists (
        select 1
        from public.avisos a
        where a.alvo_user_id = u.id
          and a.tipo = 'whatsapp-faltando'
          and not exists (
            select 1 from public.avisos_lidos l
            where l.aviso_id = a.id and l.user_id = u.id
          )
      )
  loop
    insert into public.avisos (
      titulo, corpo, link_rotulo, link_para, alvo_user_id, tipo, quantidade
    )
    values (
      'Cadastre seu WhatsApp para continuar publicando',
      'Seu perfil está sem WhatsApp, e ele passou a ser obrigatório para publicar anúncios.' ||
        E'\n\n' ||
        'É por ele que o fornecedor fala com você quando um pedido seu trava: devolução esperando código de autorização, pacote voltando sem dono, envio parado por cadastro. Sem telefone, a única saída é esperar você abrir o FORNEXA — e em devolução são duas tentativas do motorista antes de o produto se perder.' ||
        E'\n\n' ||
        'Vá em Configurações, preencha o WhatsApp e salve. O fornecedor vê esse número; o comprador nunca.',
      'Ir para Configurações', '/dashboard/settings',
      r.id, 'whatsapp-faltando', 1
    );

    v_quantos := v_quantos + 1;
  end loop;

  insert into public.log_integracao_ml (contexto, mensagem, detalhes)
  values (
    'aviso-whatsapp',
    format('Aviso de WhatsApp enviado a %s vendedor(es) que já publicaram.', v_quantos),
    jsonb_build_object('avisados', v_quantos)
  );
end;
$$;


-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Quantos ainda estão sem WhatsApp e já publicaram:
-- select count(*) from public.profiles p
-- where coalesce(p.role, 'user') <> 'admin'
--   and length(regexp_replace(coalesce(p.whatsapp, ''), '\D', '', 'g')) < 10
--   and exists (select 1 from public.user_products up where up.user_id = p.id);
