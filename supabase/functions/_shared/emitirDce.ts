// ============================================================================
// emitirDce
//
// Emite a Declaração de Conteúdo eletrônica de uma venda no Mercado Livre.
//
// Sem ela o envio fica parado em `invoice_pending` e a etiqueta não existe —
// o fornecedor não tem o que imprimir, e passados 3 dias corridos o Mercado
// Livre cancela o pedido.
//
// A API não está documentada no portal de desenvolvedores (que responde 403 a
// leitura automática). Foi confirmada por sonda em 2026-09-06:
//
//   POST /mlb/order/{ml_order_id}/dce/emission   -> 201 { id }
//   GET  /mlb/order/{ml_order_id}/dce/info       -> documentos DCE e CTE
//
// Vale para pessoa física e pessoa jurídica não contribuinte de ICMS, nas
// logísticas drop_off, xd_drop_off e cross_docking. Fora disso o Mercado Livre
// recusa — e é ele quem decide, não esta função: tentar e ouvir "não" é mais
// confiável que adivinhar aqui as regras fiscais dele.
// ============================================================================

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface Pedido {
  id: string;
  user_id: string;
  ml_order_id: string | null;
  dce_emitida_em?: string | null;
}

type Resultado =
  | { emitiu: true }
  | { emitiu: false; motivo: string };

/**
 * Emite a DC-e do pedido, se ele precisar e o vendedor não tiver desligado.
 *
 * Nunca lança: é chamada no meio da sincronização de pedidos, e falhar aqui
 * não pode derrubar a importação da venda. O que dá errado vira log e o botão
 * manual continua existindo.
 */
export async function emitirDceSePreciso(
  admin: SupabaseClient,
  pedido: Pedido,
  accessToken: string
): Promise<Resultado> {
  if (!pedido.ml_order_id) {
    return { emitiu: false, motivo: 'pedido sem número de venda no Mercado Livre' };
  }

  if (pedido.dce_emitida_em) {
    return { emitiu: false, motivo: 'já emitida' };
  }

  try {
    const { data: perfil } = await admin
      .from('profiles')
      .select('dce_automatica')
      .eq('id', pedido.user_id)
      .maybeSingle();

    // Só não emite quando o vendedor desligou de propósito. Perfil ausente ou
    // coluna nula seguem emitindo: o padrão protege quem não escolheu nada.
    if (perfil?.dce_automatica === false) {
      return { emitiu: false, motivo: 'vendedor emite na mão' };
    }

    const resposta = await fetch(
      `https://api.mercadolibre.com/mlb/order/${encodeURIComponent(
        pedido.ml_order_id
      )}/dce/emission`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const corpo = await resposta.text();

    if (!resposta.ok) {
      // Recusa não é acidente: PJ contribuinte vai por NF-e, e venda de
      // logística diferente não usa DC-e. Fica registrado e a vida segue.
      await admin.from('log_integracao_ml').insert({
        contexto: 'emitirDce',
        mensagem: `Mercado Livre recusou a emissão da DC-e (${resposta.status})`,
        detalhes: {
          pedido_id: pedido.id,
          user_id: pedido.user_id,
          ml_order_id: pedido.ml_order_id,
          status: resposta.status,
          resposta: corpo.slice(0, 1000),
        },
      });

      return { emitiu: false, motivo: `Mercado Livre recusou (${resposta.status})` };
    }

    await admin
      .from('orders')
      .update({
        dce_emitida_em: new Date().toISOString(),
        dce_emitida_pelo_sistema: true,
      })
      .eq('id', pedido.id);

    await admin.from('log_integracao_ml').insert({
      contexto: 'emitirDce',
      mensagem: 'DC-e emitida automaticamente',
      detalhes: {
        pedido_id: pedido.id,
        user_id: pedido.user_id,
        ml_order_id: pedido.ml_order_id,
        resposta: corpo.slice(0, 500),
      },
    });

    return { emitiu: true };
  } catch (erro) {
    // A venda já entrou; perder a importação inteira por causa da DC-e seria
    // trocar um problema por outro maior.
    await admin.from('log_integracao_ml').insert({
      contexto: 'emitirDce',
      mensagem: 'Falha ao emitir a DC-e automaticamente',
      detalhes: { pedido_id: pedido.id, erro: String(erro) },
    });

    return { emitiu: false, motivo: String(erro) };
  }
}
