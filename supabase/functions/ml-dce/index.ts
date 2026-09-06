// ============================================================================
// ml-dce
//
// Declaração de Conteúdo eletrônica — POR ENQUANTO, SÓ CONSULTA.
//
// POR QUE ISTO EXISTE
//
// Desde 06/04/2026 a DC-e é obrigatória para transportar mercadoria sem NF-e.
// Vendedor pessoa física precisa emitir uma por venda, e enquanto não emite o
// envio fica em `ready_to_ship / invoice_pending` e a etiqueta não é gerada.
// Foi isso que travou cinco vendas de um cliente sem ninguém entender por quê.
//
// Consta que o Mercado Livre tem API para isso:
//
//   POST /mlb/order/{id}/dce/emission     inicia a emissão
//   GET  /mlb/order/{id}/dce/info         consulta o resultado
//   GET  /mlb/order/{id}/dce/info/{DCE}?doctype=pdf
//
// A informação NÃO ESTÁ CONFIRMADA. A documentação do Mercado Livre bloqueia
// leitura automática, e hoje mesmo a assistente deles deu um diagnóstico
// inventado sobre certificado digital. Escrever a emissão em cima disso seria
// repetir o erro.
//
// Então esta função só CONSULTA, e devolve a resposta crua. Se o endpoint
// existir, ela prova; se não existir, o 404 prova o contrário. Emitir é o
// próximo passo, e só depois da prova.
//
// Restrita a admin: é diagnóstico, e devolve resposta bruta do Mercado Livre.
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

  const { data: perfil } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();

  if (perfil?.role !== 'admin') {
    return json({ error: 'Apenas administradores podem consultar a DC-e.' }, 403);
  }

  let payload: { pedido_id?: string };

  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const pedidoId = payload.pedido_id?.trim();

  if (!pedidoId) {
    return json({ error: 'Informe o pedido.' }, 400);
  }

  const { data: pedido } = await admin
    .from('orders')
    .select('id, user_id, ml_order_id')
    .eq('id', pedidoId)
    .maybeSingle();

  if (!pedido?.ml_order_id) {
    return json({ error: 'Este pedido não tem número de venda no Mercado Livre.' }, 404);
  }

  const { data: conexao } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status')
    .eq('user_id', pedido.user_id)
    .maybeSingle();

  if (!conexao) {
    return json({ error: 'O vendedor deste pedido não tem conexão com o Mercado Livre.' }, 409);
  }

  const token = await obterAccessToken(admin, conexao);

  if (!token.ok) {
    return json({ error: 'A conexão do vendedor expirou. Ele precisa reconectar.' }, 409);
  }

  const endereco = `https://api.mercadolibre.com/mlb/order/${pedido.ml_order_id}/dce/info`;

  const resposta = await fetch(endereco, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });

  const corpo = await resposta.text();

  let interpretado: unknown = corpo;

  try {
    interpretado = JSON.parse(corpo);
  } catch {
    // Resposta que não é JSON também é informação: quase sempre significa que
    // o caminho não existe e o Mercado Livre devolveu uma página de erro.
  }

  await admin.from('log_integracao_ml').insert({
    contexto: 'ml-dce',
    mensagem: `Consulta de DC-e respondeu ${resposta.status}`,
    detalhes: { endereco, status: resposta.status, resposta: corpo.slice(0, 2000) },
  });

  return json({
    endereco,
    status: resposta.status,
    // O status é o que prova. 200 ou 404 com corpo do próprio Mercado Livre
    // dizem que o caminho existe; 404 de rota inexistente diz o contrário.
    existe_o_endpoint: resposta.status !== 404 || corpo.includes('dce'),
    resposta: interpretado,
  });
});
