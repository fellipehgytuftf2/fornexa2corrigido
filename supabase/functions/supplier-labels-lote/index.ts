// ============================================================================
// supplier-labels-lote
//
// Várias etiquetas num PDF só.
//
// POR QUE EXISTE
//
// O fornecedor despacha dezenas de pedidos por dia, e cada etiqueta era um
// clique, uma espera e um arquivo. Cinquenta pedidos viravam cinquenta
// downloads e cinquenta impressões — e qualquer um esquecido no meio só
// aparecia no fim do dia, quando o pacote sobrava na bancada.
//
// POR QUE ELA CHAMA A OUTRA FUNÇÃO EM VEZ DE REPETIR O CÓDIGO
//
// As travas da etiqueta são cinco: pedido é deste fornecedor, pagamento
// confirmado, Flex com cadastro, remetente certo e o recorte para 10x15. Copiar
// isso para cá criaria uma segunda versão das regras, e um dia as duas
// discordariam — o lote liberaria o que a unitária barra.
//
// Então cada pedido passa pela `supplier-order-label`, com o mesmo token de
// quem clicou, e aqui só se junta o que voltou. Custa uma chamada por etiqueta;
// em compensação, regra nova vale nos dois caminhos no mesmo instante.
// ============================================================================

import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';
import { urlDoProjeto } from '../_shared/chaves.ts';

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
 * Quantas etiquetas por lote.
 *
 * Cada uma é uma conversa com o Mercado Livre. Acima disso a função estoura o
 * tempo no meio da fila, e o fornecedor fica sem saber quais saíram.
 */
const TETO = 20;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = urlDoProjeto();
  const authHeader = req.headers.get('Authorization');

  if (!supabaseUrl) {
    return json({ error: 'Função mal configurada no servidor.' }, 500);
  }

  if (!authHeader) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  let corpo: { pedidos?: string[] };

  try {
    corpo = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const pedidos = (corpo.pedidos ?? []).filter(Boolean).slice(0, TETO);

  if (pedidos.length === 0) {
    return json({ error: 'Nenhum pedido selecionado.' }, 400);
  }

  const juntas = await PDFDocument.create();

  /** O que não saiu, e por quê. Vai no cabeçalho da resposta. */
  const recusados: { pedido: string; motivo: string }[] = [];

  for (const pedido of pedidos) {
    try {
      const resposta = await fetch(`${supabaseUrl}/functions/v1/supplier-order-label`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pedido_id: pedido }),
      });

      if (!resposta.ok) {
        const erro = await resposta.json().catch(() => ({}));

        recusados.push({
          pedido,
          motivo: String(erro?.error ?? `O servidor recusou (${resposta.status}).`),
        });

        continue;
      }

      const bytes = await resposta.arrayBuffer();
      const etiqueta = await PDFDocument.load(bytes);

      const paginas = await juntas.copyPages(etiqueta, etiqueta.getPageIndices());
      paginas.forEach((pagina) => juntas.addPage(pagina));
    } catch (erro) {
      // Um pedido que falha não pode levar o lote junto: o fornecedor imprime
      // o que saiu e resolve o resto depois.
      recusados.push({ pedido, motivo: String(erro).slice(0, 300) });
    }
  }

  if (juntas.getPageCount() === 0) {
    return json(
      {
        error: 'Nenhuma etiqueta saiu.',
        recusados,
      },
      409
    );
  }

  const arquivo = await juntas.save();

  return new Response(arquivo, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="etiquetas-${juntas.getPageCount()}-paginas.pdf"`,
      // O corpo é o PDF, então o que não saiu viaja no cabeçalho. Sem isto, o
      // fornecedor imprimiria 18 etiquetas achando que pediu 20.
      'X-Recusados': String(recusados.length),
      'X-Recusados-Detalhe': encodeURIComponent(JSON.stringify(recusados.slice(0, 5))),
    },
  });
});
