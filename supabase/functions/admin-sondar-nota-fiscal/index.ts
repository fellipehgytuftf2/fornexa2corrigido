// ============================================================================
// admin-sondar-nota-fiscal
//
// Descobre se dá para buscar a NF-e de um vendedor PJ pelo Mercado Livre.
//
// POR QUE
//
// Vendedor pessoa física emite DC-e, e o FORNEXA já busca e entrega o DACE ao
// fornecedor junto da etiqueta. Vendedor PJ emite NF-e — e disso o FORNEXA não
// sabe nada. Na prática, a caixa de um PJ sai do galpão sem o documento
// fiscal, ou o vendedor manda por fora, por WhatsApp.
//
// A documentação do Mercado Livre para nota fiscal é ruim, como era a da DC-e.
// O caminho certo não se adivinha: pergunta-se. Esta sonda bate em todos os
// endereços plausíveis com um pedido real e mostra o que cada um respondeu.
//
// COMO LER O RESULTADO
//
// 404 de rota inexistente vem com erro genérico de roteamento. 404 com campo
// de domínio no corpo é outra coisa: é a rota existindo e dizendo "aqui não
// tem nota para este pedido". Foi assim que a DC-e foi confirmada em 06/09.
//
// SÓ LÊ
//
// Nenhuma nota é emitida, nada é gravado no pedido. A resposta crua fica no
// log para comparar entre pedidos.
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

  let payload: { venda?: string } = {};

  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const digitado = String(payload.venda ?? '').replace(/\D/g, '');

  if (digitado.length < 6) {
    return json({ error: 'Informe o número da venda no Mercado Livre.' }, 400);
  }

  // Igual à sonda de venda: acha o pedido por conteúdo e usa o número
  // guardado nele, porque quem copia de uma tela costuma perder o último
  // dígito e o Mercado Livre responde 404 a número incompleto.
  const { data: pedidos } = await admin
    .from('orders')
    .select('id, user_id, ml_order_id, ml_shipment_id, product_name, status')
    .ilike('ml_order_id', `%${digitado}%`)
    .limit(1);

  const pedido = (pedidos ?? [])[0];

  if (!pedido) {
    return json({ error: 'Nenhum pedido com esse número no FORNEXA.' }, 404);
  }

  const { data: conexao } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status, external_account_id')
    .eq('user_id', pedido.user_id)
    .maybeSingle();

  if (!conexao) {
    return json({ error: 'O vendedor deste pedido não tem conexão com o Mercado Livre.' }, 409);
  }

  const token = await obterAccessToken(admin, conexao);

  if (!token.ok) {
    return json({ error: 'A conexão do vendedor expirou. Ele precisa reconectar.' }, 409);
  }

  const venda = String(pedido.ml_order_id ?? '').replace(/\D/g, '');
  const envio = pedido.ml_shipment_id ? String(pedido.ml_shipment_id) : null;
  const vendedorNoMl = String(conexao.external_account_id);

  // Os endereços plausíveis, em ordem do mais provável ao menos.
  //
  // Vêm de como o Mercado Livre organiza o resto: documento preso ao pedido,
  // ao pacote, ao envio, ou à conta do vendedor. Qual deles vale é o que esta
  // sonda responde.
  const caminhos = [
    `/orders/${venda}/billing_info`,
    `/orders/${venda}/invoice`,
    `/packs/${venda}/fiscal_documents`,
    `/users/${vendedorNoMl}/invoices/orders/${venda}`,
    `/marketplace/orders/${venda}/invoice`,
    ...(envio
      ? [
          `/shipments/${envio}/invoice_data?siteId=MLB`,
          `/shipments/${envio}/invoice`,
        ]
      : []),
  ];

  const tentativas: Array<Record<string, unknown>> = [];

  for (const caminho of caminhos) {
    const resposta = await fetch(`https://api.mercadolibre.com${caminho}`, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });

    const texto = await resposta.text();

    let corpo: unknown;
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = texto.slice(0, 600);
    }

    tentativas.push({ caminho, http: resposta.status, resposta: corpo });
  }

  const algumPassou = tentativas.some((t) => Number(t.http) === 200);

  const conclusao = algumPassou
    ? 'Pelo menos um caminho respondeu. Veja qual, no detalhe abaixo — é por ele que a nota pode ser entregue ao fornecedor.'
    : 'Nenhum caminho devolveu nota. Pode ser que esta venda não tenha NF-e emitida, ou que a aplicação não tenha permissão de faturamento.';

  await admin.from('log_integracao_ml').insert({
    contexto: 'sonda-nota-fiscal',
    mensagem: conclusao,
    detalhes: { venda, envio, vendedor_ml: vendedorNoMl, tentativas },
  });

  return json({
    ok: algumPassou,
    venda,
    envio,
    produto: pedido.product_name,
    conclusao,
    tentativas,
  });
});
