// ============================================================================
// supplier-order-dace
//
// Entrega ao fornecedor o DACE do pedido, em PDF.
//
// O DACE é a versão impressa da Declaração de Conteúdo eletrônica. Pela regra
// dos Correios ele vai DOBRADO NUM SAQUINHO PLÁSTICO do lado de fora da caixa,
// junto da etiqueta — que fica colada e visível. São dois papéis, não um.
//
// Sem isto, o fornecedor baixava a etiqueta aqui e tinha que pedir o DACE ao
// vendedor por fora. Duas fontes para despachar uma caixa é onde o despacho
// atrasa.
//
// Funciona como a etiqueta: o fornecedor manda o id do pedido, a função
// confirma que o pedido é dele, usa o token do VENDEDOR dono do pedido, e
// devolve o PDF. O token nunca aparece na resposta, e o arquivo não é gravado
// em lugar nenhum.
//
// O caminho tem dois passos porque o número do documento não é previsível:
//
//   GET /mlb/order/{id}/dce/info                 acha o documento do tipo DCE
//   GET /mlb/order/{id}/dce/info/{key}?doctype=pdf   baixa
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

interface DocumentoDaDce {
  dce_key?: string;
  document_type?: string;
  status?: string;
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

  const { data: fornecedor } = await admin
    .from('suppliers')
    .select('id')
    .eq('auth_user_id', caller.id)
    .maybeSingle();

  if (!fornecedor) {
    return json({ error: 'Apenas fornecedores podem baixar o DACE por aqui.' }, 403);
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

  // O filtro por supplier_id é o que impede um fornecedor de baixar o
  // documento do pedido de outro.
  const { data: pedido } = await admin
    .from('orders')
    .select('id, user_id, ml_order_id')
    .eq('id', pedidoId)
    .eq('supplier_id', fornecedor.id)
    .maybeSingle();

  if (!pedido) {
    return json({ error: 'Pedido não encontrado para este fornecedor.' }, 404);
  }

  if (!pedido.ml_order_id) {
    return json({ error: 'Este pedido não tem venda no Mercado Livre.' }, 409);
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
    return json(
      { error: 'A conexão do vendedor com o Mercado Livre expirou. Peça para ele reconectar.' },
      409
    );
  }

  const base = `https://api.mercadolibre.com/mlb/order/${pedido.ml_order_id}/dce/info`;

  const infoResposta = await fetch(base, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });

  if (!infoResposta.ok) {
    return json(
      {
        error:
          'A Declaração de Conteúdo ainda não foi emitida para este pedido. Avise o vendedor — sem ela não há DACE nem etiqueta.',
      },
      409
    );
  }

  const info = await infoResposta.json();
  const documentos = (info?.documents ?? []) as DocumentoDaDce[];

  // Entre os documentos vem também o CT-e, que é do transporte e não vai na
  // caixa. O que se imprime é o do tipo DCE, e só quando autorizado: documento
  // ainda em análise pode mudar antes de valer.
  const dce = documentos.find(
    (documento) => (documento.document_type ?? '').toUpperCase() === 'DCE'
  );

  if (!dce?.dce_key) {
    return json(
      { error: 'Este pedido ainda não tem Declaração de Conteúdo emitida.' },
      409
    );
  }

  if ((dce.status ?? '').toLowerCase() !== 'authorized') {
    return json(
      {
        error:
          'A Declaração de Conteúdo ainda está sendo autorizada pelo Mercado Livre. Tente de novo em alguns minutos.',
      },
      409
    );
  }

  const pdfResposta = await fetch(`${base}/${dce.dce_key}?doctype=pdf`, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });

  if (!pdfResposta.ok) {
    const corpo = await pdfResposta.text();

    await admin.from('log_integracao_ml').insert({
      contexto: 'supplier-order-dace',
      mensagem: `Mercado Livre recusou o DACE (${pdfResposta.status})`,
      detalhes: { pedido_id: pedido.id, dce_key: dce.dce_key, resposta: corpo.slice(0, 2000) },
    });

    return json(
      { error: 'Não foi possível baixar o DACE agora. Avise o suporte do FORNEXA.' },
      pdfResposta.status
    );
  }

  const pdf = await pdfResposta.arrayBuffer();

  return new Response(pdf, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="dace-${pedido.ml_order_id}.pdf"`,
    },
  });
});
