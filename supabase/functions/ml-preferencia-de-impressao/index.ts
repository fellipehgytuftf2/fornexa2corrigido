// ============================================================================
// ml-preferencia-de-impressao
//
// Se a conta do vendedor imprime etiqueta em térmica ou em A4.
//
// POR QUE IMPORTA
//
// O PDF da etiqueta sai no formato configurado na conta dele, e não há
// parâmetro na API para pedir de outro jeito. Em A4, o fornecedor recebe uma
// folha com a etiqueta num pedaço e a Declaração no outro, e passa a cortar
// com tesoura e colar com fita em toda venda — sem nunca descobrir que a causa
// está na configuração da conta de outra pessoa.
//
// COMO SE DESCOBRIU
//
// `GET /users/{id}/shipping_preferences` responde 200 e traz `thermal_printer`.
// A documentação não menciona esse campo; foi achado por sonda, como a API de
// DC-e. `null` significa não configurado — ou seja, A4.
//
// Só lê. Trocar a preferência de uma conta de terceiro é outra conversa, e
// exige saber antes se o aplicativo tem permissão para isso.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chavePublica, chaveSecreta, urlDoProjeto } from '../_shared/chaves.ts';
import { obterAccessToken } from '../_shared/tokenMercadoLivre.ts';

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
    data: { user },
  } = await createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  }).auth.getUser();

  if (!user) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Sempre a conexão de quem chamou: ninguém consulta a preferência de outro.
  const { data: conexao } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status, external_account_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!conexao?.external_account_id) {
    return json({ conectado: false });
  }

  const token = await obterAccessToken(admin, conexao);

  if (!token.ok) {
    return json({ conectado: false, precisa_reconectar: true });
  }

  const resposta = await fetch(
    `https://api.mercadolibre.com/users/${encodeURIComponent(
      String(conexao.external_account_id)
    )}/shipping_preferences`,
    { headers: { Authorization: `Bearer ${token.accessToken}` } }
  );

  if (!resposta.ok) {
    const corpo = await resposta.text();

    await admin.from('log_integracao_ml').insert({
      contexto: 'ml-preferencia-de-impressao',
      mensagem: `Mercado Livre recusou a leitura das preferências (${resposta.status})`,
      detalhes: {
        user_id: user.id,
        status: resposta.status,
        resposta: corpo.slice(0, 600),
      },
    });

    return json({ conectado: true, erro_de_leitura: true });
  }

  const preferencias = (await resposta.json()) as Record<string, unknown>;
  const bruto = preferencias?.thermal_printer;

  // `null` é o valor de quem nunca configurou, e imprime em A4. Qualquer valor
  // preenchido — booleano ou o nome do formato — significa térmica.
  const termica = bruto === null || bruto === undefined ? false : Boolean(bruto);

  return json({ conectado: true, termica, bruto: bruto ?? null });
});
