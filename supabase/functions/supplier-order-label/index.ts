// ============================================================================
// supplier-order-label
//
// Entrega ao fornecedor a etiqueta de envio de um pedido dele, em PDF.
//
// Funciona como proxy. O fornecedor nunca vê token nem fala com o Mercado
// Livre: manda o id do pedido, a função confirma que o pedido é dele, pega o
// token do VENDEDOR dono do pedido, chama o Mercado Livre e devolve o PDF.
//
// Caminho, ao contrário das outras funções ml-*:
//   fornecedor (quem chamou) -> orders.supplier_id (confere dono)
//   -> orders.user_id (o vendedor) -> ml_connections do vendedor -> token
//
// O token não aparece na resposta em momento algum. O PDF não é gravado em
// lugar nenhum: vai direto para o navegador, porque salvar em Storage
// colocaria endereço de cliente num bucket.
//
// NÃO VERIFICADO EM PRODUÇÃO: escrito a partir da documentação do Mercado
// Livre, mas sem pedido real com envio em `ready_to_ship` para testar. Por
// isso os erros do ML são repassados traduzidos, com o status HTTP original,
// em vez de virarem uma mensagem genérica.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
 * Traduz o erro do Mercado Livre para algo que o admin consiga agir.
 * Mantém o status original: 403 de elegibilidade e 404 de envio inexistente
 * exigem providências completamente diferentes.
 */
function traduzErroMl(status: number, corpo: string): string {
  if (status === 401) {
    return 'A conexão do vendedor com o Mercado Livre expirou. Peça para ele reconectar em Integrações.';
  }

  if (status === 403) {
    return (
      'O Mercado Livre recusou o acesso à etiqueta (403). Normalmente significa que a conta do vendedor não tem permissão para este recurso, ou que a aplicação está sem o escopo necessário. Detalhe do Mercado Livre: ' +
      corpo
    );
  }

  if (status === 404) {
    return 'O Mercado Livre não encontrou este envio. Ele pode ter sido cancelado.';
  }

  return `O Mercado Livre recusou a solicitação (${status}). Detalhe: ${corpo}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

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

  // 1. Quem chamou é fornecedor?
  const { data: supplier, error: supplierError } = await admin
    .from('suppliers')
    .select('id, name, company_name')
    .eq('auth_user_id', caller.id)
    .maybeSingle();

  if (supplierError) {
    return json({ error: `Não foi possível confirmar o fornecedor: ${supplierError.message}` }, 500);
  }

  if (!supplier) {
    return json({ error: 'Apenas fornecedores podem baixar etiquetas por aqui.' }, 403);
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

  // 2. O pedido é mesmo deste fornecedor?
  //    O filtro por supplier_id é o que impede um fornecedor de pedir a
  //    etiqueta do pedido de outro.
  const { data: pedido, error: pedidoError } = await admin
    .from('orders')
    .select('id, user_id, ml_shipment_id, status')
    .eq('id', pedidoId)
    .eq('supplier_id', supplier.id)
    .maybeSingle();

  if (pedidoError) {
    return json({ error: `Não foi possível carregar o pedido: ${pedidoError.message}` }, 500);
  }

  if (!pedido) {
    return json({ error: 'Pedido não encontrado para este fornecedor.' }, 404);
  }

  if (!pedido.ml_shipment_id) {
    return json(
      {
        error:
          'Este pedido ainda não tem envio gerado no Mercado Livre, então não há etiqueta para baixar.',
      },
      409
    );
  }

  // 3. Token do VENDEDOR dono do pedido — nunca do fornecedor.
  const { data: connection, error: connectionError } = await admin
    .from('ml_connections')
    .select('id, access_token, refresh_token, expires_at')
    .eq('user_id', pedido.user_id)
    .eq('status', 'connected')
    .maybeSingle();

  if (connectionError) {
    return json({ error: `Não foi possível carregar a conexão: ${connectionError.message}` }, 500);
  }

  if (!connection) {
    return json(
      { error: 'O vendedor deste pedido não tem conexão ativa com o Mercado Livre.' },
      409
    );
  }

  let accessToken = connection.access_token as string;

  // 4. Renova o token se estiver perto de expirar.
  //    Mesma lógica de ml-sync-orders, para o comportamento não divergir.
  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  const cincoMinutos = Date.now() + 5 * 60 * 1000;

  if (expiresAt < cincoMinutos) {
    const refreshResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: Deno.env.get('ML_CLIENT_ID')!,
        client_secret: Deno.env.get('ML_CLIENT_SECRET')!,
        refresh_token: connection.refresh_token,
      }),
    });

    const refreshData = await refreshResponse.json();

    if (!refreshResponse.ok) {
      console.error('Falha ao renovar token do vendedor:', refreshData);
      return json(
        { error: 'A conexão do vendedor com o Mercado Livre expirou. Peça para ele reconectar.' },
        409
      );
    }

    accessToken = refreshData.access_token;

    await admin
      .from('ml_connections')
      .update({
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token ?? connection.refresh_token,
        expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
      })
      .eq('id', connection.id);
  }

  // 5. Busca a etiqueta.
  //    A etiqueta só existe quando o envio está em ready_to_ship no Mercado
  //    Livre; antes disso o próprio ML recusa.
  const labelResponse = await fetch(
    `https://api.mercadolibre.com/shipment_labels?shipment_ids=${encodeURIComponent(
      pedido.ml_shipment_id
    )}&response_type=pdf`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!labelResponse.ok) {
    const corpo = await labelResponse.text();
    console.error('Mercado Livre recusou a etiqueta:', labelResponse.status, corpo);

    return json(
      { error: traduzErroMl(labelResponse.status, corpo.slice(0, 500)) },
      labelResponse.status === 401 ? 409 : labelResponse.status
    );
  }

  const pdf = await labelResponse.arrayBuffer();

  return new Response(pdf, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="etiqueta-${pedido.ml_shipment_id}.pdf"`,
    },
  });
});
