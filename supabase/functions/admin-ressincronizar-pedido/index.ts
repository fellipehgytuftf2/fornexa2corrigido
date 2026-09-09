// ============================================================================
// admin-ressincronizar-pedido
//
// Relê UM pedido no Mercado Livre e atualiza o envio.
//
// POR QUE
//
// Pedido que nasceu sem envio — porque o Mercado Livre ainda não o tinha
// criado quando avisou da venda — só se conserta sincronizando. Só que
// sincronizar é botão do VENDEDOR: o suporte via o pedido parado e dependia de
// pedir a ele que clicasse, e esperar.
//
// Aqui o suporte resolve sozinho, num pedido só, sem varrer a conta inteira.
//
// E RESPONDE A OUTRA PERGUNTA
//
// A resposta diz o que o Mercado Livre devolveu. Envio nulo depois disto não é
// mais "falta sincronizar": é venda sem Mercado Envios, que nunca vai ter
// etiqueta — e aí o fornecedor despacha por fora. São conclusões opostas, e
// sem perguntar não dá para saber qual é.
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

  const { data: pedido } = await admin
    .from('orders')
    .select('id, user_id, ml_order_id, ml_shipment_id')
    .eq('id', payload.pedido_id ?? '')
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

  const respostaDoPedido = await fetch(
    `https://api.mercadolibre.com/orders/${encodeURIComponent(String(pedido.ml_order_id))}`,
    { headers: { Authorization: `Bearer ${token.accessToken}` } }
  );

  if (!respostaDoPedido.ok) {
    return json(
      {
        error: `O Mercado Livre recusou a consulta (${respostaDoPedido.status}).`,
        status: respostaDoPedido.status,
      },
      409
    );
  }

  const mlPedido = await respostaDoPedido.json();
  const shippingId = mlPedido?.shipping?.id ?? null;

  if (!shippingId) {
    return json({
      ok: true,
      encontrou_envio: false,
      // O que a ausência significa, para o suporte não repetir a mesma
      // sincronização amanhã esperando resultado diferente.
      conclusao:
        'O Mercado Livre não tem envio para esta venda. Não é falta de sincronizar: ' +
        'é venda sem Mercado Envios (frete combinado ou retirada). Não vai existir ' +
        'etiqueta — o fornecedor despacha por fora e marca como enviado.',
      ml_order_status: mlPedido?.status ?? null,
    });
  }

  // Tem envio: lê o envio inteiro, porque é dele que saem rastreio, endereço e
  // o substatus que decide o selo do Portal.
  const respostaDoEnvio = await fetch(
    `https://api.mercadolibre.com/shipments/${encodeURIComponent(String(shippingId))}`,
    { headers: { Authorization: `Bearer ${token.accessToken}` } }
  );

  const envio = respostaDoEnvio.ok ? await respostaDoEnvio.json() : null;

  const receiver = envio?.receiver_address;
  const endereco = receiver
    ? [
        receiver.street_name,
        receiver.street_number,
        receiver.city?.name,
        receiver.state?.name,
      ]
        .filter(Boolean)
        .join(', ')
    : null;

  const buffering = envio?.buffering as Record<string, unknown> | null | undefined;

  await admin
    .from('orders')
    .update({
      ml_shipment_id: String(shippingId),
      ml_shipment_substatus: envio?.substatus ? String(envio.substatus) : null,
      ml_shipment_visto_em: new Date().toISOString(),
      ml_liberacao_em: typeof buffering?.date === 'string' ? buffering.date : null,
      tracking_code: envio?.tracking_number ?? null,
      // O endereço só é reescrito quando veio de verdade: apagar o que já
      // existia por causa de uma leitura ruim seria piorar o pedido.
      ...(endereco ? { customer_address: endereco } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', pedido.id);

  await admin.from('log_integracao_ml').insert({
    contexto: 'admin-ressincronizar-pedido',
    mensagem: 'Pedido ressincronizado pelo admin',
    detalhes: {
      pedido_id: pedido.id,
      ml_order_id: pedido.ml_order_id,
      shipment_id: String(shippingId),
      por: caller.id,
    },
  });

  return json({
    ok: true,
    encontrou_envio: true,
    shipment_id: String(shippingId),
    substatus: envio?.substatus ?? null,
    conclusao: 'Envio encontrado e gravado. A etiqueta deve aparecer no Portal.',
  });
});
