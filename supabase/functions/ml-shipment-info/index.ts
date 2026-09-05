// ============================================================================
// ml-shipment-info
//
// Pergunta ao Mercado Livre o que está acontecendo com o envio de um pedido.
//
// POR QUE ISTO EXISTE
//
// "Por que a etiqueta não sai?" é a dúvida mais cara da operação: o fornecedor
// para de despachar, o vendedor não sabe o que responder, e a resposta está o
// tempo todo no Mercado Livre — em campos que ninguém aqui lia.
//
// São quase sempre três motivos, e cada um pede uma coisa diferente:
//
//   invoice_pending  falta a nota fiscal; o vendedor envia pelo painel do ML
//   buffered         o ML represou o envio; só esperar a data que ele mesmo diz
//   ready_to_print   está liberada; o fornecedor pode baixar agora
//
// A função traduz isso para uma frase em português com o que fazer. Só lê —
// nunca altera nada no Mercado Livre.
//
// Restrita a admin porque devolve também a resposta bruta do ML, útil para
// diagnóstico e ruído para quem só quer despachar.
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
 * A data em que a etiqueta passa a existir, quando o envio está represado.
 *
 * `substatus: "buffered"` quer dizer que o Mercado Livre está segurando o
 * envio de propósito — junta despachos e libera todos numa data marcada. Até
 * lá a etiqueta não é impressa e o pedido de PDF volta com
 * `NOT_PRINTABLE_STATUS`, que na tela do fornecedor parecia defeito.
 *
 * A própria API diz quando: o campo `buffering.date`. Sem ler isso, a única
 * resposta possível era "espera" — sem dizer até quando.
 */
function dataDeLiberacao(envio: Record<string, unknown>): string | null {
  const buffering = envio.buffering as Record<string, unknown> | null | undefined;
  const data = buffering?.date;

  return typeof data === 'string' && data ? data : null;
}

/**
 * O substatus em português, com o que fazer.
 *
 * Ele é o campo que realmente responde "por que a etiqueta não sai", e vinha
 * cru na tela: `invoice_pending` não diz nada a quem está vendendo. Sem isso, a
 * tela mostrava quatro palavras em inglês e um parágrafo sobre "fase 4" — que
 * era anotação de quem investigava, não resposta a quem usa.
 */
function interpretaSubstatus(envio: Record<string, unknown>): string | null {
  const substatus = String(envio.substatus ?? '');

  const explicacoes: Record<string, string> = {
    invoice_pending:
      'O Mercado Livre está esperando a nota fiscal deste pedido. Enquanto ela não chegar, a etiqueta não é gerada. Envie a nota pelo painel do Mercado Livre, em Vendas.',

    ready_to_print:
      'A etiqueta já pode ser impressa. O fornecedor consegue baixá-la pelo Portal agora.',

    printed:
      'A etiqueta já foi impressa. O próximo passo é postar o pacote.',

    picked_up:
      'A transportadora já retirou o pacote.',

    stale:
      'O Mercado Livre marcou este envio como parado — passou do prazo esperado sem movimentação. Vale conferir no painel dele.',

    delivery_failed:
      'A entrega falhou. O Mercado Livre costuma tentar de novo; acompanhe pelo painel.',

    fraudulent:
      'O Mercado Livre bloqueou este envio por suspeita de fraude. NÃO despache: o pagamento pode ser revertido e a mercadoria se perde.',
  };

  return explicacoes[substatus] ?? null;
}

/**
 * A frase que a tela mostra: o que está acontecendo com este envio, e o que
 * fazer. O substatus responde primeiro porque é ele que explica por que a
 * etiqueta sai ou não; o modo entra quando o substatus não diz nada de útil.
 */
function interpretaModo(envio: Record<string, unknown>): string {
  const mode = String(envio.mode ?? '');
  const logisticType = String(
    (envio.logistic_type as string) ??
      ((envio.logistic as Record<string, unknown>)?.type as string) ??
      ''
  );

  const doSubstatus = interpretaSubstatus(envio);

  if (doSubstatus) {
    return doSubstatus;
  }

  // Vem antes do modo porque é a pergunta que traz a pessoa a esta tela:
  // "por que a etiqueta não sai?".
  if (String(envio.substatus ?? '') === 'buffered') {
    const data = dataDeLiberacao(envio);

    return (
      'O Mercado Livre está segurando este envio para liberar junto com outros. ' +
      'A etiqueta não existe até lá. ' +
      (data
        ? `Ele libera em ${new Date(data).toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
          })}.`
        : 'A API não informou a data de liberação.') +
      ' Não é preciso fazer nada — nem pelo vendedor, nem pelo fornecedor.'
    );
  }

  if (mode === 'custom' || mode === 'not_specified') {
    return 'O envio é por conta do vendedor: não passa pelo Mercado Envios, e não existe etiqueta do Mercado Livre para baixar. O rastreio é informado por quem despacha.';
  }

  if (mode === 'me2' || logisticType) {
    return 'Envio pelo Mercado Envios. Quem move o status é a transportadora, ao bipar o pacote — nem o vendedor nem o fornecedor conseguem adiantar isso por aqui.';
  }

  return `Modo de envio não reconhecido (${mode || 'sem modo'}${
    logisticType ? `, ${logisticType}` : ''
  }). Avise o suporte do FORNEXA com o número deste pedido.`;
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
    liberacao_da_etiqueta: dataDeLiberacao(envio),

    conclusao: interpretaModo(envio),

    // A resposta completa fica disponível para inspeção manual, já que o
    // objetivo aqui é justamente descobrir o que não sabemos.
    resposta_bruta: envio,
  });
});
