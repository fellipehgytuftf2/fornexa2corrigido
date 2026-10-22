-- Duas portas abertas encontradas na verificação de segurança de 19/09/2026.
--
-- 1. PERFIL: qualquer conta logada gravava QUALQUER coluna do próprio perfil.
--    Pelo console do navegador, `update profiles set role = 'admin'` virava
--    cliente em administrador — e tudo que confere "é admin?" passava a valer
--    para ele: as funções admin_*, e o admin-entrar-como, que abre a conta de
--    qualquer cliente. O mesmo servia para se dar plano premium com vencimento
--    em 2099, sem pagar. Testado na conta de teste e revertido.
--
--    A tela só grava quatro colunas do próprio perfil: nome, empresa, WhatsApp
--    e a nota automática (dce_automatica). Plano e papel mudam só por quem roda
--    como servidor — o webhook de pagamento e as funções de admin, que são
--    security definer e não passam por esta permissão.
--
--    Permissão por coluna, e não gatilho: o banco recusa antes de qualquer
--    lógica rodar, e coluna nova já nasce fechada — não há lista para esquecer
--    de atualizar.

revoke update on table public.profiles from anon, authenticated;
grant update (name, empresa, whatsapp, dce_automatica) on table public.profiles to authenticated;


-- 2. FUNÇÕES INTERNAS: só as funções do servidor chamam estas (webhook de
--    pagamento, PIX recebido, pausa por falta de estoque), sempre com a chave
--    de servidor. Foram criadas com `grant ... to service_role`, mas no
--    Postgres toda função nasce executável por PUBLIC — conceder a um papel
--    não tira dos outros. Ficavam executáveis por qualquer um: listar anúncios
--    de todos os vendedores, mandar notificação para qualquer conta, sondar
--    apelidos de afiliado.

revoke execute on function public.aplicar_pagamento(uuid) from public, anon, authenticated;
revoke execute on function public.marcar_planos_vencidos() from public, anon, authenticated;
revoke execute on function public.anuncios_para_pausar(integer) from public, anon, authenticated;
revoke execute on function public.anuncios_para_reativar(integer) from public, anon, authenticated;
revoke execute on function public.notificar_anuncios_por_estoque(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.confirmar_repasse(text, text) from public, anon, authenticated;
revoke execute on function public.apelido_de_afiliado(text) from public, anon, authenticated;

grant execute on function public.aplicar_pagamento(uuid) to service_role;
grant execute on function public.marcar_planos_vencidos() to service_role;
grant execute on function public.anuncios_para_pausar(integer) to service_role;
grant execute on function public.anuncios_para_reativar(integer) to service_role;
grant execute on function public.notificar_anuncios_por_estoque(uuid, text, integer) to service_role;
grant execute on function public.confirmar_repasse(text, text) to service_role;
grant execute on function public.apelido_de_afiliado(text) to service_role;
