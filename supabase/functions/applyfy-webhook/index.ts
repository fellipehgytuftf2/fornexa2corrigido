// ============================================================================
// FORNEXA — applyfy-webhook
// ============================================================================
// Recebe o aviso de pagamento da Applyfy e libera o acesso do comprador.
//
// PORQUE ESTA FUNÇÃO É TOLERANTE DE PROPÓSITO:
//   A Applyfy não publica documentação de webhook — não há página de
//   desenvolvedor nem artigo na central de ajuda. Então o formato exato do
//   aviso é desconhecido até o primeiro pagamento chegar.
//
//   Em vez de adivinhar um formato e quebrar em produção, a função:
//     1. grava o aviso CRU em `pagamentos.payload`, sempre, aconteça o que
//        acontecer com a interpretação;
//     2. procura cada informação numa lista de nomes prováveis, cobrindo as
//        convenções usadas pelas plataformas do ramo;
//     3. responde 200 mesmo quando não entende, para a Applyfy não ficar
//        reenviando em laço.
//
//   Depois do primeiro pagamento de teste, `select payload from pagamentos`
//   mostra o formato de verdade e o mapeamento vira exato.
//
// CONFIGURAÇÃO NO SUPABASE:
//   Deploy com "Verify JWT" DESLIGADO — quem chama é a Applyfy, que não tem
//   token de usuário nenhum.
//
//   Segredos necessários:
//     APPLYFY_WEBHOOK_TOKEN   senha combinada, conferida a cada chamada
//     APPLYFY_PRODUTO_BASICO  identificador ou nome do produto do plano básico
//     APPLYFY_PRODUTO_PREMIUM idem, do premium
//
// CONFIGURAÇÃO NA APPLYFY:
//   Cadastre como URL de webhook, com o token no endereço:
//     https://<projeto>.supabase.co/functions/v1/applyfy-webhook?token=<senha>
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chaveSecreta, urlDoProjeto } from "../_shared/chaves.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-applyfy-token, x-webhook-token",
};

type Json = Record<string, unknown>;

/**
 * Busca um valor percorrendo vários nomes possíveis, inclusive aninhados.
 *
 * Aceita caminho com ponto ("customer.email") para alcançar o que costuma vir
 * dentro de um objeto de comprador ou de transação.
 */
function pegar(objeto: Json, caminhos: string[]): unknown {
  for (const caminho of caminhos) {
    let atual: unknown = objeto;

    for (const parte of caminho.split(".")) {
      if (atual && typeof atual === "object" && parte in (atual as Json)) {
        atual = (atual as Json)[parte];
      } else {
        atual = undefined;
        break;
      }
    }

    if (atual !== undefined && atual !== null && atual !== "") {
      return atual;
    }
  }

  return undefined;
}

function texto(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === "string") return valor.trim() || null;
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  return null;
}

/**
 * Traduz o status da plataforma para o vocabulário do FORNEXA.
 *
 * A lista cobre as palavras usadas pelas plataformas de infoproduto em
 * português e inglês. O que não for reconhecido vira 'desconhecido' e NÃO
 * libera acesso — na dúvida, o sistema não dá o que não tem certeza.
 */
function traduzirStatus(bruto: string | null): string {
  const s = (bruto || "").toLowerCase().trim();

  const pagos = [
    "paid", "approved", "aprovado", "pago", "completed", "complete",
    "concluido", "concluído", "purchase_approved", "compra_aprovada",
    "authorized", "autorizado", "succeeded", "success", "sucesso",
  ];

  const reembolsados = [
    "refunded", "reembolsado", "estornado", "chargeback", "refund",
    "purchase_refunded", "reembolso",
  ];

  const cancelados = [
    "canceled", "cancelled", "cancelado", "expired", "expirado",
    "subscription_canceled", "assinatura_cancelada", "overdue", "atrasado",
  ];

  const recusados = [
    "refused", "recusado", "declined", "rejected", "rejeitado", "failed",
    "falhou", "pending", "pendente", "waiting_payment", "aguardando_pagamento",
    "abandoned", "abandonado",
  ];

  if (pagos.includes(s)) return "pago";
  if (reembolsados.includes(s)) return "reembolsado";
  if (cancelados.includes(s)) return "cancelado";
  if (recusados.includes(s)) return "recusado";

  return "desconhecido";
}

/**
 * Decide se a compra foi do básico ou do premium.
 *
 * Primeiro tenta pelo identificador do produto configurado nos segredos, que é
 * o caminho confiável. Se não bater, cai no preço — R$ 139 é mensal, R$ 229 é
 * único —, e só então no nome do produto.
 */
function descobrirPlano(corpo: Json, valor: number | null): string | null {
  const idBasico = (Deno.env.get("APPLYFY_PRODUTO_BASICO") || "").toLowerCase().trim();
  const idPremium = (Deno.env.get("APPLYFY_PRODUTO_PREMIUM") || "").toLowerCase().trim();

  const identificadores = [
    texto(pegar(corpo, [
      "product_id", "productId", "product.id", "produto_id",
      "offer_id", "offerId", "plan_id", "planId",
    ])),
    texto(pegar(corpo, [
      "product_name", "productName", "product.name", "produto",
      "product.title", "offer_name", "plan", "plano", "product",
    ])),
  ].filter(Boolean).map((v) => v!.toLowerCase());

  for (const id of identificadores) {
    if (idBasico && id.includes(idBasico)) return "basico";
    if (idPremium && id.includes(idPremium)) return "premium";
  }

  if (valor !== null) {
    if (Math.abs(valor - 139) < 1) return "basico";
    if (Math.abs(valor - 229) < 1) return "premium";
  }

  for (const id of identificadores) {
    if (id.includes("premium")) return "premium";
    if (id.includes("basic") || id.includes("básic")) return "basico";
  }

  return null;
}

/**
 * Converte o valor recebido para reais.
 *
 * Muitas plataformas mandam centavos como inteiro. A regra prática: inteiro
 * grande e redondo em centavos vira dividido por cem.
 */
function normalizarValor(bruto: unknown): number | null {
  const n = typeof bruto === "number" ? bruto : Number(texto(bruto));

  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }

  if (Number.isInteger(n) && n >= 1000) {
    return n / 100;
  }

  return n;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Sem senha combinada, qualquer um na internet libera acesso pago mandando
  // um POST. Falha fechada de propósito: se o segredo não estiver configurado,
  // a função recusa tudo em vez de aceitar tudo.
  const esperado = Deno.env.get("APPLYFY_WEBHOOK_TOKEN");

  if (!esperado) {
    console.error("APPLYFY_WEBHOOK_TOKEN não configurado — recusando chamada.");
    return new Response(JSON.stringify({ erro: "webhook não configurado" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const recebido =
    url.searchParams.get("token") ||
    req.headers.get("x-applyfy-token") ||
    req.headers.get("x-webhook-token") ||
    "";

  if (recebido !== esperado) {
    console.warn("Chamada recusada: token inválido.");
    return new Response(JSON.stringify({ erro: "não autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(urlDoProjeto()!, chaveSecreta()!);

  try {
    // Nem toda plataforma manda JSON; algumas mandam formulário.
    const tipo = req.headers.get("content-type") || "";
    let corpo: Json = {};

    if (tipo.includes("application/json")) {
      corpo = (await req.json().catch(() => ({}))) as Json;
    } else {
      const form = await req.formData().catch(() => null);

      if (form) {
        for (const [chave, valor] of form.entries()) {
          corpo[chave] = typeof valor === "string" ? valor : String(valor);
        }
      }
    }

    // Algumas plataformas embrulham tudo dentro de "data" ou "payload".
    const interno = pegar(corpo, ["data", "payload", "body", "resource"]);
    const dados: Json =
      interno && typeof interno === "object" ? { ...corpo, ...(interno as Json) } : corpo;

    const email = texto(
      pegar(dados, [
        "email", "customer.email", "buyer.email", "cliente.email",
        "customer_email", "buyer_email", "user.email", "comprador.email",
        "contact.email", "subscriber.email",
      ])
    );

    const nome = texto(
      pegar(dados, [
        "name", "customer.name", "buyer.name", "cliente.nome",
        "customer_name", "buyer_name", "full_name", "comprador.nome",
      ])
    );

    const evento = texto(
      pegar(dados, ["event", "evento", "type", "event_type", "action", "topic"])
    );

    const statusBruto = texto(
      pegar(dados, [
        "status", "payment_status", "transaction_status", "situacao",
        "order_status", "sale_status", "charge_status",
      ])
    );

    // O nome do evento às vezes carrega o status ("purchase_approved") e o
    // campo status vem vazio. Vale tentar os dois.
    let status = traduzirStatus(statusBruto);

    if (status === "desconhecido") {
      status = traduzirStatus(evento);
    }

    const valor = normalizarValor(
      pegar(dados, [
        "amount", "valor", "price", "total", "value", "preco",
        "transaction_amount", "order_total", "payment.amount",
      ])
    );

    const referencia = texto(
      pegar(dados, [
        "transaction_id", "transactionId", "order_id", "orderId", "id",
        "sale_id", "reference", "referencia", "code", "codigo",
        "payment_id", "charge_id", "subscription_id",
      ])
    );

    const plano = descobrirPlano(dados, valor);

    if (!email) {
      // Sem e-mail não há como ligar o pagamento a uma conta. Guarda mesmo
      // assim: é exatamente esse registro que revela o formato certo.
      await supabase.from("pagamentos").insert({
        email: "desconhecido@sem-email",
        gateway: "applyfy",
        referencia_externa: referencia,
        evento,
        status: "desconhecido",
        payload: dados,
        observacao: "aviso sem e-mail identificável — conferir o formato em payload",
      });

      console.error("Webhook sem e-mail. Corpo:", JSON.stringify(dados).slice(0, 2000));

      return new Response(JSON.stringify({ recebido: true, interpretado: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: gravado, error: erroGravar } = await supabase
      .from("pagamentos")
      .insert({
        email,
        nome,
        gateway: "applyfy",
        referencia_externa: referencia,
        evento,
        status,
        plano,
        valor,
        payload: dados,
      })
      .select("id")
      .single();

    if (erroGravar) {
      // Índice único disparando significa aviso repetido: a Applyfy reenviando
      // o que já foi processado. Não é erro, é o mecanismo funcionando.
      if (erroGravar.code === "23505") {
        console.log("Aviso repetido, já processado:", referencia);

        return new Response(JSON.stringify({ recebido: true, repetido: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw erroGravar;
    }

    const { data: resultado, error: erroAplicar } = await supabase.rpc(
      "aplicar_pagamento",
      { p_pagamento_id: gravado.id }
    );

    if (erroAplicar) {
      throw erroAplicar;
    }

    console.log("Pagamento processado:", { email, status, plano, resultado });

    return new Response(
      JSON.stringify({ recebido: true, status, plano, resultado }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (erro) {
    // Responder 200 evita o laço de reenvio. O que aconteceu fica no log e,
    // quase sempre, também em `pagamentos`.
    console.error("Falha ao processar webhook da Applyfy:", erro);

    return new Response(
      JSON.stringify({ recebido: true, erro: String(erro) }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
