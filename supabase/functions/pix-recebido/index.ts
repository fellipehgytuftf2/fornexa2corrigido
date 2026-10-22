// ============================================================================
// pix-recebido
//
// A porta por onde o banco do fornecedor avisa que um PIX caiu.
//
// Recebendo o aviso, o FORNEXA quita os pedidos daquele repasse e libera a
// etiqueta na hora. O fornecedor não confere extrato e não clica em nada.
//
// POR QUE ELA NÃO FALA COM NENHUM BANCO ESPECÍFICO
//
// Cada banco avisa de um jeito: Mercado Pago manda um id para consultar depois,
// Asaas manda o pagamento inteiro, o Inter exige certificado. Amarrar esta
// função a um deles obrigaria a reescrevê-la ao trocar de banco — e o fornecedor
// escolhe o banco dele, não nós.
//
// Então aqui entra o formato mínimo que todos conseguem produzir:
//
//   { "txid": "FNX7A3...", "valor": 187.40, "origem": "mercado-pago" }
//
// Ligar um banco novo vira um tradutor pequeno na frente desta função, e nada
// aqui dentro muda.
//
// COMO ELA SE PROTEGE
//
// Esta função confirma pagamento. Chamada por qualquer um, quitaria dívida sem
// dinheiro nenhum ter entrado. Por isso exige um segredo combinado, no cabeçalho
// `x-fornexa-segredo`, guardado em PIX_WEBHOOK_SEGREDO.
//
// Ela NÃO usa o JWT do Supabase: quem chama é o servidor de um banco, que não
// tem conta aqui.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chaveSecreta, urlDoProjeto } from '../_shared/chaves.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-fornexa-segredo',
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

  const segredoEsperado = Deno.env.get('PIX_WEBHOOK_SEGREDO');

  // Sem segredo configurado a função fica fechada, e não aberta. O erro de
  // esquecer de configurar tem que travar, não liberar.
  if (!segredoEsperado) {
    console.error('PIX_WEBHOOK_SEGREDO não configurado.');
    return json({ error: 'Função mal configurada no servidor.' }, 500);
  }

  if (req.headers.get('x-fornexa-segredo') !== segredoEsperado) {
    return json({ error: 'Não autorizado.' }, 401);
  }

  let aviso: { txid?: string; valor?: number; origem?: string };

  try {
    aviso = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const txid = (aviso.txid ?? '').trim();

  if (!txid) {
    return json({ error: 'Aviso sem txid.' }, 400);
  }

  const supabase = createClient(urlDoProjeto()!, chaveSecreta()!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: repasse } = await supabase
    .from('repasses')
    .select('id, valor, status')
    .eq('txid', txid)
    .maybeSingle();

  if (!repasse) {
    // Não é erro do banco: pode ser um PIX que nada tem a ver com o FORNEXA.
    // Responder 200 evita que ele fique reenviando para sempre.
    await supabase.from('log_integracao_ml').insert({
      contexto: 'pix-recebido',
      mensagem: 'Aviso de PIX sem repasse correspondente',
      detalhes: aviso,
    });

    return json({ ok: true, ignorado: true, motivo: 'txid desconhecido' });
  }

  // O valor é conferido, não usado. Um PIX a menos do que se deve não quita a
  // dívida, e quitar por engano faria a mercadoria sair sem o pagamento
  // inteiro.
  const valorAvisado = Number(aviso.valor ?? 0);
  const valorEsperado = Number(repasse.valor ?? 0);

  if (valorAvisado > 0 && Math.abs(valorAvisado - valorEsperado) > 0.01) {
    await supabase.from('log_integracao_ml').insert({
      contexto: 'pix-recebido',
      mensagem: 'Valor recebido diferente do repasse',
      detalhes: { txid, valorAvisado, valorEsperado },
    });

    return json(
      { ok: false, error: 'Valor diferente do esperado. Confirmação não aplicada.' },
      409
    );
  }

  const { data, error } = await supabase.rpc('confirmar_repasse', {
    p_txid: txid,
    p_origem: (aviso.origem ?? 'banco').slice(0, 40),
  });

  if (error) {
    console.error('Falha ao confirmar repasse:', error);
    return json({ error: `Não foi possível confirmar: ${error.message}` }, 500);
  }

  await supabase.from('log_integracao_ml').insert({
    contexto: 'pix-recebido',
    mensagem: 'Repasse confirmado pelo aviso do banco',
    detalhes: { txid, origem: aviso.origem ?? 'banco', resultado: data },
  });

  return json({ ok: true, resultado: data });
});
