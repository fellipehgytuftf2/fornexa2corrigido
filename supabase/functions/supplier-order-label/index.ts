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
      'O Mercado Livre recusou o acesso à etiqueta. Normalmente é permissão ' +
      'na conta do vendedor. Avise o suporte do FORNEXA.'
    );
  }

  if (status === 404) {
    return 'O Mercado Livre não encontrou este envio. Ele pode ter sido cancelado.';
  }

  // O caso mais comum de todos, e o primeiro que apareceu em produção:
  //
  //   SHPLAB0200 · NOT_PRINTABLE_STATUS
  //   "Shipment 47907037298 status is pending"
  //
  // Não é erro de ninguém. O Mercado Livre só gera etiqueta depois de
  // confirmar o pagamento do comprador; até lá o envio fica em `pending` e a
  // etiqueta não existe. Boleto e Pix fora do horário bancário seguram isso
  // por horas.
  //
  // Sem tradução, o fornecedor recebia o JSON cru na tela e concluía que o
  // sistema estava quebrado — quando o certo era esperar.
  if (corpo.includes('NOT_PRINTABLE_STATUS') || corpo.includes('SHPLAB0200')) {
    return (
      'A etiqueta ainda não foi liberada pelo Mercado Livre. Acontece quando o ' +
      'pagamento do comprador ainda não foi confirmado, ou quando o Mercado ' +
      'Livre está segurando o envio para liberar junto com outros. ' +
      'Tente de novo mais tarde — não é preciso fazer nada.'
    );
  }

  // O corpo cru fica no log, não na tela. Ele é JSON do Mercado Livre e não
  // ajuda quem está separando pedido.
  return `O Mercado Livre recusou a solicitação (${status}). Se continuar, avise o suporte do FORNEXA.`;
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

  // 2b. O pagamento foi confirmado?
  //     A view já esconde a etiqueta nesse caso, mas esta função é outra porta:
  //     quem souber chamá-la direto contornaria a trava sem esforço nenhum.
  //     Regra de dinheiro precisa valer em todas as entradas, não só na tela.
  const { data: liberado, error: erroLiberado } = await admin.rpc(
    'pedido_liberado_para_despacho',
    { p_order_id: pedidoId }
  );

  if (erroLiberado) {
    return json(
      { error: `Não foi possível conferir o pagamento: ${erroLiberado.message}` },
      500
    );
  }

  if (liberado === false) {
    return json(
      {
        error:
          'A etiqueta fica disponível depois que você confirmar o recebimento do pagamento deste pedido.',
      },
      409
    );
  }

  // 3. Token do VENDEDOR dono do pedido — nunca do fornecedor.
  const { data: connection, error: connectionError } = await admin
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

  if (connectionError) {
    return json({ error: `Não foi possível carregar a conexão: ${connectionError.message}` }, 500);
  }

  if (!connection) {
    return json(
      { error: 'O vendedor deste pedido não tem conexão ativa com o Mercado Livre.' },
      409
    );
  }

  const token = await obterAccessToken(admin, connection);

  if (!token.ok) {
    return json(
      { error: 'A conexão do vendedor com o Mercado Livre expirou. Peça para ele reconectar.' },
      409
    );
  }

  const accessToken = token.accessToken;

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

    // O JSON cru sai da tela do fornecedor e passa a viver aqui. Quem separa
    // pedido não tem o que fazer com ele; quem dá suporte, tem.
    await admin.from('log_integracao_ml').insert({
      contexto: 'supplier-order-label',
      mensagem: `Mercado Livre recusou a etiqueta (${labelResponse.status})`,
      detalhes: {
        pedido_id: pedido.id,
        shipment_id: pedido.ml_shipment_id,
        status: labelResponse.status,
        resposta: corpo.slice(0, 2000),
      },
    });

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
