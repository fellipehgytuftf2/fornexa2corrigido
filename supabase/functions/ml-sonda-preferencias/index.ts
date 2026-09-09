// ============================================================================
// ml-sonda-preferencias
//
// PROVISÓRIA. Existe para responder uma pergunta e depois sair daqui.
//
// A PERGUNTA
//
// O formato da etiqueta — A4 ou térmica — vem da preferência de impressão da
// conta do vendedor. A documentação não menciona endpoint para ler nem para
// trocar isso, e o custo de não saber é alto: enquanto ficar em A4, o
// fornecedor corta com tesoura e cola com fita em toda venda.
//
// A documentação também não mencionava a API de DC-e, e ela existia. A única
// forma de saber é perguntar ao Mercado Livre.
//
// SÓ LÊ
//
// Nenhuma escrita, nenhum PUT. Uma resposta 200 diz que o caminho existe e
// mostra o formato; a partir daí se decide se vale tentar gravar. Sondar
// escrevendo em conta de cliente seria mexer no que não se entende ainda.
//
// Admin apenas, e a resposta crua sai no corpo — é ela o produto.
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

  const { data: perfil } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();

  if (perfil?.role !== 'admin') {
    return json({ error: 'Apenas administradores.' }, 403);
  }

  let payload: { pedido_id?: string };

  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  if (!payload.pedido_id) {
    return json({ error: 'Informe o pedido.' }, 400);
  }

  // O token precisa ser do vendedor dono do pedido: a preferência é da conta
  // dele, e com o token de outro a resposta seria sobre a conta errada.
  const { data: pedido } = await admin
    .from('orders')
    .select('id, user_id')
    .eq('id', payload.pedido_id)
    .maybeSingle();

  if (!pedido) {
    return json({ error: 'Pedido não encontrado.' }, 404);
  }

  const { data: conexao } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status, external_account_id')
    .eq('user_id', pedido.user_id)
    .maybeSingle();

  if (!conexao?.external_account_id) {
    return json({ error: 'O vendedor deste pedido não tem conta conectada.' }, 409);
  }

  const token = await obterAccessToken(admin, conexao);

  if (!token.ok) {
    return json({ error: 'A conexão do vendedor expirou.' }, 409);
  }

  const mlUserId = conexao.external_account_id;

  // Os caminhos plausíveis, do mais específico ao mais genérico. Um 200 em
  // qualquer um responde a pergunta; 404 em todos também responde, e aí a
  // conclusão é que não dá e o aviso na tela é o que temos.
  const caminhos = [
    `/users/${mlUserId}/shipping_preferences`,
    `/users/${mlUserId}/shipping_preferences/labels`,
    `/users/${mlUserId}/preferences`,
    `/users/${mlUserId}/settings`,
    `/shipping/preferences?seller_id=${mlUserId}`,
    `/sites/MLB/shipping_preferences?seller_id=${mlUserId}`,
    `/users/${mlUserId}/shipping_options`,
    `/shipment_labels/preferences?seller_id=${mlUserId}`,
  ];

  const resultados: Record<string, unknown>[] = [];

  for (const caminho of caminhos) {
    try {
      const resposta = await fetch(`https://api.mercadolibre.com${caminho}`, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });

      const corpo = await resposta.text();

      resultados.push({
        caminho,
        status: resposta.status,
        // Corpo curto: o que interessa é se existe e que forma tem, não o
        // conteúdo inteiro.
        resposta: corpo.slice(0, 600),
      });
    } catch (erro) {
      resultados.push({ caminho, erro: String(erro) });
    }
  }

  await admin.from('log_integracao_ml').insert({
    contexto: 'ml-sonda-preferencias',
    mensagem: 'Sonda de preferências de impressão',
    detalhes: { ml_user_id: mlUserId, pedido_id: pedido.id, resultados },
  });

  return json({ ml_user_id: mlUserId, resultados });
});
