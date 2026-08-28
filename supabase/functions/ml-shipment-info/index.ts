// ============================================================================
// ml-shipment-info
//
// Diagnóstico: mostra como o Mercado Livre classifica o envio de um pedido.
//
// POR QUE ISTO EXISTE
// A fase 4 do Portal do Fornecedor deveria confirmar o despacho no Mercado
// Livre quando o fornecedor marca o pedido como enviado. Só que o caminho
// depende do modo de envio, e os dois são incompatíveis:
//
//   - envio personalizado (logística do vendedor): confirma-se por
//     PUT /shipments/{id} ou POST /shipments/{id}/seller_notifications
//   - Mercado Envios (logística do ML, etiqueta pré-paga): o vendedor NÃO
//     confirma nada por API; o status muda quando a transportadora bipa o
//     pacote
//
// Chamar o endpoint errado num envio gerenciado pelo ML, na melhor hipótese,
// é recusado; na pior, deixa o pedido inconsistente com o marketplace.
//
// Esta função responde qual é o caso, com dado real, antes de escrevermos a
// fase 4. Só lê — nunca altera nada no Mercado Livre.
//
// Restrita a admin: expõe a resposta bruta do ML, útil para diagnóstico mas
// não para o fornecedor.
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

/**
 * Lê o modo de envio e diz, em português, o que ele significa para a fase 4.
 * A conclusão é a razão de ser desta função.
 */
function interpretaModo(envio: Record<string, unknown>): string {
  const mode = String(envio.mode ?? '');
  const logisticType = String(
    (envio.logistic_type as string) ??
      ((envio.logistic as Record<string, unknown>)?.type as string) ??
      ''
  );

  if (mode === 'custom' || mode === 'not_specified') {
    return 'Envio por conta do vendedor. A fase 4 se aplica: dá para confirmar o despacho por API, informando o código de rastreio.';
  }

  if (mode === 'me2' || logisticType) {
    return `Mercado Envios (mode=${mode}, logistic_type=${logisticType}). O vendedor não confirma despacho por API: o status muda quando a transportadora bipa o pacote. A fase 4, como planejada, não se aplica a este envio.`;
  }

  return `Modo não reconhecido (mode=${mode}, logistic_type=${logisticType}). Vale conferir a resposta bruta abaixo antes de decidir.`;
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

  const { data: perfil } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();

  if (perfil?.role !== 'admin') {
    return json({ error: 'Apenas administradores podem ver o diagnóstico de envio.' }, 403);
  }

  let payload: { pedido_id?: string };

  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const pedidoId = payload.pedido_id?.trim();

  if (!pedidoId) {
    return json({ error: 'Informe o pedido.' }, 400);
  }

  const { data: pedido, error: pedidoError } = await admin
    .from('orders')
    .select('id, user_id, ml_order_id, ml_shipment_id, status')
    .eq('id', pedidoId)
    .maybeSingle();

  if (pedidoError) {
    return json({ error: `Não foi possível carregar o pedido: ${pedidoError.message}` }, 500);
  }

  if (!pedido) {
    return json({ error: 'Pedido não encontrado.' }, 404);
  }

  if (!pedido.ml_shipment_id) {
    return json(
      { error: 'Este pedido não tem envio no Mercado Livre, então não há o que diagnosticar.' },
      409
    );
  }

  const { data: connection } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status')
    .eq('user_id', pedido.user_id)
    // Sem filtro por status, de proposito.
    //
    // Filtrar por 'connected' aqui tornava QUALQUER queda permanente: uma
    // falha de rede marcava a conexao como caida, e a partir dai esta
    // consulta nao achava mais a linha — nem para tentar renovar. O refresh
    // token continuava valido meses no banco e ninguem o usava.
    //
    // Era isso que obrigava o vendedor a reconectar toda hora: nao era a
    // conexao que morria, era o sistema que desistia dela e nunca mais
    // tentava.
    //
    // Quem decide se o token serve e `obterAccessToken`, logo abaixo. Ele
    // renova quando da, e devolve o status para 'connected' sozinho.
    .maybeSingle();

  if (!connection) {
    return json({ error: 'O vendedor deste pedido não tem conexão ativa com o Mercado Livre.' }, 409);
  }

  const token = await obterAccessToken(admin, connection);

  if (!token.ok) {
    return json({ error: 'A conexão do vendedor expirou. Reconecte em Integrações.' }, 409);
  }

  const accessToken = token.accessToken;

  const envioResponse = await fetch(
    `https://api.mercadolibre.com/shipments/${encodeURIComponent(pedido.ml_shipment_id)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const corpo = await envioResponse.text();

  if (!envioResponse.ok) {
    return json(
      {
        error: `O Mercado Livre recusou a consulta (${envioResponse.status}).`,
        detalhe: corpo.slice(0, 800),
      },
      envioResponse.status === 401 ? 409 : envioResponse.status
    );
  }

  const envio = JSON.parse(corpo) as Record<string, unknown>;

  return json({
    ml_shipment_id: pedido.ml_shipment_id,
    ml_order_id: pedido.ml_order_id,
    status_no_fornexa: pedido.status,

    mode: envio.mode ?? null,
    logistic_type:
      envio.logistic_type ?? (envio.logistic as Record<string, unknown>)?.type ?? null,
    status: envio.status ?? null,
    substatus: envio.substatus ?? null,
    tracking_number: envio.tracking_number ?? null,
    tracking_method: envio.tracking_method ?? null,

    conclusao: interpretaModo(envio),

    // A resposta completa fica disponível para inspeção manual, já que o
    // objetivo aqui é justamente descobrir o que não sabemos.
    resposta_bruta: envio,
  });
});
