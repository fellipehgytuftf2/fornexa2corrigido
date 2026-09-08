// ============================================================================
// admin-trocar-email
//
// Troca o e-mail de entrada de um cliente.
//
// POR QUE UMA FUNÇÃO, E NÃO SQL
//
// O e-mail vive em `auth.users`, e não é só um texto: ele é a identidade da
// conta, ligada a `auth.identities` e ao histórico de confirmação. Um UPDATE
// direto na tabela deixa esses três desencontrados, e o resultado é conta que
// não entra mais — sem erro visível até a pessoa tentar.
//
// A API de admin do Supabase faz a troca inteira, e é isso que esta função
// chama.
//
// POR QUE `email_confirm: true`
//
// O fluxo normal manda um link para o endereço novo e só troca quando alguém
// clica. Aqui não serve: quem pede a troca é quem perdeu o acesso ao endereço
// antigo, ou digitou errado no cadastro — e o link iria para uma caixa que ele
// não abre. O admin está afirmando que conferiu, e a troca fica registrada com
// o nome de quem fez.
//
// A SENHA NÃO MUDA
//
// De propósito. Trocar o endereço é corrigir um cadastro; trocar a senha seria
// tomar a conta. Se ele não lembra a senha, existe "esqueci minha senha", que
// agora vai para o endereço certo.
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

/** Validação rasa de propósito: só pega erro de digitação óbvio. */
const pareceEmail = (texto: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto);

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

  const {
    data: { user: caller },
  } = await createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  }).auth.getUser();

  if (!caller) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: perfilDeQuemChamou } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();

  if (perfilDeQuemChamou?.role !== 'admin') {
    return json({ error: 'Apenas administradores podem trocar e-mail.' }, 403);
  }

  let payload: { user_id?: string; email?: string };

  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const userId = payload.user_id?.trim();
  const email = payload.email?.trim().toLowerCase();

  if (!userId || !email) {
    return json({ error: 'Informe a conta e o e-mail.' }, 400);
  }

  if (!pareceEmail(email)) {
    return json({ error: 'Esse e-mail não parece válido.' }, 400);
  }

  const { data: alvo } = await admin.auth.admin.getUserById(userId);

  if (!alvo?.user) {
    return json({ error: 'Conta não encontrada.' }, 404);
  }

  const emailAntigo = alvo.user.email ?? '';

  if (emailAntigo.toLowerCase() === email) {
    return json({ error: 'Este já é o e-mail da conta.' }, 400);
  }

  // Admin não troca o próprio e-mail por aqui: sair da própria conta por engano
  // é o tipo de erro que ninguém consegue desfazer depois.
  if (userId === caller.id) {
    return json(
      { error: 'Troque o seu próprio e-mail em Configurações, não por aqui.' },
      400
    );
  }

  const { error: erroDaTroca } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });

  if (erroDaTroca) {
    // O caso comum é e-mail já usado por outra conta. A mensagem do Supabase
    // vem em inglês e não diz o que fazer.
    const jaExiste = /already|registered|exists/i.test(erroDaTroca.message);

    return json(
      {
        error: jaExiste
          ? 'Já existe uma conta com esse e-mail.'
          : `Não foi possível trocar: ${erroDaTroca.message}`,
      },
      400
    );
  }

  // `profiles.email` é cópia, e é por ela que várias telas procuram a pessoa.
  // Deixá-la para trás faria a busca do admin achar o endereço antigo.
  await admin.from('profiles').update({ email }).eq('id', userId);

  // Documento de quem trocou o quê. Trocar e-mail é mudar a chave de entrada de
  // uma conta alheia — depois alguém vai perguntar quem fez.
  await admin.from('log_integracao_ml').insert({
    contexto: 'admin-trocar-email',
    mensagem: 'E-mail de entrada trocado pelo admin',
    detalhes: {
      user_id: userId,
      email_antigo: emailAntigo,
      email_novo: email,
      trocado_por: caller.id,
    },
  });

  return json({ ok: true, email });
});
