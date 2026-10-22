// ============================================================================
// admin-entrar-como
//
// Devolve ao admin uma credencial de uso único para entrar na conta de um
// cliente e ver a plataforma como ele vê.
//
// POR QUE EXISTE
//
// "Não consigo publicar", "não aparece nada no catálogo", "minha conexão caiu".
// Todas essas terminavam do mesmo jeito: pedir print, adivinhar, ou mexer
// direto no banco. Ver a tela do cliente resolve em segundos o que a conversa
// leva um dia.
//
// O QUE ELA NÃO FAZ
//
// Não devolve, e nunca deve devolver, a senha do cliente. O que sai daqui é um
// token de uso único, gerado na hora, que serve para abrir uma sessão e nada
// mais. A senha continua sabida só por ele.
//
// TRÊS TRAVAS
//
//   1. só quem tem profiles.role = 'admin' consegue chamar
//   2. não entra em conta de outro admin — impede que quem invadir um admin
//      passeie pelos demais, e impede briga interna de acesso
//   3. toda entrada é registrada em `log_integracao_ml`, com quem entrou, em
//      quem, e quando
//
// A trava 3 é a mais importante das três. Acesso a conta alheia sem registro é
// o tipo de coisa que ninguém consegue explicar depois.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chavePublica, chaveSecreta, urlDoProjeto } from '../_shared/chaves.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = urlDoProjeto();
  const serviceRoleKey = chaveSecreta();
  const anonKey = chavePublica();

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'Função mal configurada no servidor.' }, 500);
  }

  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();

  if (callerError || !caller) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();

  if (callerProfile?.role !== 'admin') {
    return json({ error: 'Apenas administradores podem entrar em outra conta.' }, 403);
  }

  let payload: { user_id?: string };

  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const alvoId = payload.user_id?.trim();

  if (!alvoId) {
    return json({ error: 'Informe a conta.' }, 400);
  }

  if (alvoId === caller.id) {
    return json({ error: 'Você já está nesta conta.' }, 400);
  }

const { data: perfil } = await admin
    .from('profiles')
    .select('id, email, name, role')
    .eq('id', alvoId)
    .maybeSingle();

  if (perfil?.role === 'admin') {
    return json({ error: 'Não é possível entrar na conta de outro administrador.' }, 403);
  }

  /**
   * Fornecedor também entra por aqui.
   *
   * Ele tem conta em `auth.users` como qualquer um, mas não tem linha em
   * `profiles` — o cadastro dele vive em `suppliers`. Enquanto a busca era só
   * por perfil, "conta não encontrada" era a resposta para todo fornecedor, e
   * o suporte dele voltava a ser pedir print.
   */
  const { data: fornecedor } = perfil?.email
    ? { data: null }
    : await admin
        .from('suppliers')
        .select('id, email, name, company_name')
        .eq('auth_user_id', alvoId)
        .maybeSingle();

  const alvo = perfil?.email
    ? { id: perfil.id, email: perfil.email, name: perfil.name, tipo: 'vendedor' as const }
    : fornecedor?.email
      ? {
          id: alvoId,
          email: fornecedor.email as string,
          name: (fornecedor.company_name || fornecedor.name) as string,
          tipo: 'fornecedor' as const,
        }
      : null;

  if (!alvo) {
    return json({ error: 'Conta não encontrada ou sem e-mail cadastrado.' }, 404);
  }

  // `magiclink` em vez de `invite` ou `signup`: os outros dois mexem no estado
  // da conta (marcam convite pendente, reenviam confirmação). Este só produz um
  // token de entrada e não altera nada do cliente.
  //
  // O e-mail NÃO é enviado: quem gera o link é a função, e o token volta na
  // resposta para o navegador do admin usar direto. O cliente não recebe nada e
  // não é incomodado.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: alvo.email,
  });

  const tokenHash = link?.properties?.hashed_token;

  if (linkError || !tokenHash) {
    return json(
      {
        error: `Não foi possível gerar o acesso: ${
          linkError?.message ?? 'resposta sem token'
        }`,
      },
      500
    );
  }

  await admin.from('log_integracao_ml').insert({
    contexto: 'admin-entrar-como',
    mensagem: 'Admin entrou na conta de um cliente',
    detalhes: {
      admin_id: caller.id,
      admin_email: caller.email,
      alvo_id: alvo.id,
      alvo_email: alvo.email,
      em: new Date().toISOString(),
    },
  });

  return json({
    token_hash: tokenHash,
    email: alvo.email,
    nome: alvo.name ?? null,

    // O navegador precisa saber para onde ir: fornecedor tem portal próprio, e
    // cair no painel do vendedor é tela vazia com erro de permissão.
    tipo: alvo.tipo,
  });
});
