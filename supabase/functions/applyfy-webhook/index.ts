// ============================================================================
// FORNEXA — applyfy-webhook
// ============================================================================
// Recebe o aviso de pagamento da Applyfy e libera o acesso do comprador.
//
// Formato conforme a documentação em https://app.applyfy.com.br/docs/webhooks
// (visível só depois de logar no painel).
//
// O aviso chega assim:
//
//   {
//     "event": "TRANSACTION_PAID",
//     "token": "...",                      // autenticidade, vem no corpo
//     "offerCode": "...",                  // qual oferta foi comprada
//     "checkoutUrl": "...",
//     "client":       { "id", "name", "email", "phone", "cpf", "cnpj" },
//     "transaction":  { "id", "identifier", "status", "paymentMethod",
//                       "amount", "installments", "payedAt", ... },
//     "subscription": null | { "id", "cycle", "intervalType",
//                              "intervalCount", "status", ... },
//     "orderItems":   [ ... ],
//     "trackProps":   { ... }
//   }
//
// DUAS REGRAS QUE MERECEM ATENÇÃO:
//
//   TRANSACTION_CREATED não é venda. É cobrança gerada — PIX emitido, boleto
//   impresso. Tratar como pagamento deixaria qualquer pessoa entrar de graça:
//   bastaria gerar um PIX e nunca pagar.
//
//   TRANSACTION_CANCELED não tira acesso. Transação cancelada não é dinheiro
//   devolvido; é cobrança que não vingou. Bloquear aqui derrubaria, no meio do
//   mês já pago, quem apenas teve uma tentativa de renovação falhar. Só
//   REFUNDED e CHARGED_BACK encerram o acesso, que é quando o dinheiro volta.
//
// CONFIGURAÇÃO NO SUPABASE:
//   Deploy com "Verify JWT" DESLIGADO — quem chama é a Applyfy, sem token de
//   usuário.
//
//   Segredos:
//     APPLYFY_WEBHOOK_TOKEN   o mesmo token que a Applyfy envia no corpo
//     APPLYFY_OFERTA_BASICO   offerCode da oferta do plano Básico
//     APPLYFY_OFERTA_PREMIUM  offerCode da oferta do plano Premium
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chaveSecreta, urlDoProjeto } from "../_shared/chaves.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Cliente {
  id?: string;
  name?: string;
  email?: string;
}

interface Transacao {
  id?: string;
  identifier?: string | null;
  status?: string;
  paymentMethod?: string;
  amount?: number;
  originalAmount?: number;
}

interface Assinatura {
  id?: string;
  cycle?: number;
  intervalType?: "DAYS" | "WEEKS" | "MONTHS" | "YEARS";
  intervalCount?: number;
  status?: "ACTIVE" | "INACTIVE" | "CANCELED";
}

interface AvisoApplyfy {
  event?: string;
  token?: string;
  offerCode?: string | null;
  checkoutUrl?: string;
  client?: Cliente;
  transaction?: Transacao;
  subscription?: Assinatura | null;
}

/**
 * Código de quem indicou a venda.
 *
 * A Applyfy devolve em `checkoutUrl` o endereço exato que o comprador abriu,
 * com todos os parâmetros — sessão, oferta e afiliação. O afiliado vem em
 * `code`, confirmado no disparo de teste da própria plataforma.
 *
 * Nulo quer dizer venda direta, que é o caso das duas primeiras vendas reais.
 */
function lerAfiliado(checkoutUrl: string | undefined): string | null {
  if (!checkoutUrl) {
    return null;
  }

  try {
    const codigo = new URL(checkoutUrl).searchParams.get("code");
    return codigo?.trim() || null;
  } catch {
    // Endereço malformado não pode derrubar o processamento do pagamento:
    // saber quem indicou vale bem menos que liberar o acesso de quem pagou.
    return null;
  }
}

/** O que cada evento faz com o acesso. */
const EFEITO_DO_EVENTO: Record<string, string> = {
  TRANSACTION_PAID: "pago",
  TRANSACTION_REFUNDED: "reembolsado",
  TRANSACTION_CHARGED_BACK: "reembolsado",
  TRANSACTION_CANCELED: "cancelado",
  TRANSACTION_CREATED: "criado",
};

const DIAS_POR_INTERVALO: Record<string, number> = {
  DAYS: 1,
  WEEKS: 7,
  MONTHS: 30,
  YEARS: 365,
};

/**
 * Até quando o acesso vale.
 *
 * Sem assinatura, é compra única e não vence — devolve nulo. Com assinatura, o
 * ciclo vem no próprio aviso, então não há o que adivinhar.
 *
 * Os três dias a mais existem porque cobrança recorrente atrasa: repasse
 * demora, cartão é retentado. Sem essa folga, o cliente que paga em dia seria
 * bloqueado nas horas entre o vencimento e a renovação.
 */
function calcularValidade(assinatura: Assinatura | null | undefined): string | null {
  if (!assinatura) {
    return null;
  }

  const porUnidade = DIAS_POR_INTERVALO[assinatura.intervalType || "MONTHS"] ?? 30;
  const quantidade = Number(assinatura.intervalCount) || 1;

  const validade = new Date();
  validade.setDate(validade.getDate() + porUnidade * quantidade + 3);

  return validade.toISOString();
}

/**
 * Qual plano foi comprado.
 *
 * O `offerCode` é o caminho confiável. A queda para a presença de assinatura
 * cobre o caso de o segredo não ter sido configurado: cobrança recorrente é
 * Básico, cobrança única é Premium.
 */
function descobrirPlano(
  offerCode: string | null | undefined,
  assinatura: Assinatura | null | undefined
): string | null {
  const basico = (Deno.env.get("APPLYFY_OFERTA_BASICO") || "").trim();
  const premium = (Deno.env.get("APPLYFY_OFERTA_PREMIUM") || "").trim();
  const codigo = (offerCode || "").trim();

  if (codigo) {
    if (basico && codigo === basico) return "basico";
    if (premium && codigo === premium) return "premium";
  }

  return assinatura ? "basico" : "premium";
}

/** Comparação de senha sem revelar, pelo tempo de resposta, onde ela difere. */
function tokenConfere(recebido: string, esperado: string): boolean {
  if (recebido.length !== esperado.length) {
    return false;
  }

  let diferenca = 0;

  for (let i = 0; i < recebido.length; i++) {
    diferenca |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }

  return diferenca === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const esperado = Deno.env.get("APPLYFY_WEBHOOK_TOKEN");

  // Sem o token configurado, qualquer um na internet libera acesso pago
  // mandando um POST. Falha fechada de propósito.
  if (!esperado) {
    console.error("APPLYFY_WEBHOOK_TOKEN não configurado — recusando chamada.");

    return new Response(JSON.stringify({ erro: "webhook não configurado" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(urlDoProjeto()!, chaveSecreta()!);

  try {
    const aviso = (await req.json().catch(() => ({}))) as AvisoApplyfy;

    if (!tokenConfere(aviso.token || "", esperado)) {
      console.warn("Chamada recusada: token inválido.");

      return new Response(JSON.stringify({ erro: "não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const evento = aviso.event || "";
    const efeito = EFEITO_DO_EVENTO[evento] || "desconhecido";

    const cliente = aviso.client || {};
    const transacao = aviso.transaction || {};
    const assinatura = aviso.subscription || null;

    const email = (cliente.email || "").trim().toLowerCase();

    // Evento de pagamento aprovado precisa vir com a transação concluída. São
    // duas informações independentes dizendo a mesma coisa; exigir as duas
    // custa nada e impede liberar acesso por um aviso malformado.
    const pagoDeVerdade =
      efeito === "pago" && (transacao.status || "").toUpperCase() === "COMPLETED";

    const status = efeito === "pago" && !pagoDeVerdade ? "desconhecido" : efeito;

    const plano = descobrirPlano(aviso.offerCode, assinatura);
    const validade = status === "pago" ? calcularValidade(assinatura) : null;

    if (!email) {
      await supabase.from("pagamentos").insert({
        email: "desconhecido@sem-email",
        gateway: "applyfy",
        referencia_externa: transacao.id || null,
        evento,
        status: "desconhecido",
        payload: aviso as unknown as Record<string, unknown>,
        observacao: "aviso sem e-mail do cliente",
      });

      console.error("Webhook sem client.email:", JSON.stringify(aviso).slice(0, 2000));

      return new Response(JSON.stringify({ recebido: true, interpretado: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: gravado, error: erroGravar } = await supabase
      .from("pagamentos")
      .insert({
        email,
        nome: cliente.name || null,
        gateway: "applyfy",
        referencia_externa: transacao.id || null,
        identificador_externo: transacao.identifier || null,
        evento,
        status,
        plano,
        valor: transacao.amount ?? null,
        expira_em: validade,
        afiliado: lerAfiliado(aviso.checkoutUrl),
        payload: aviso as unknown as Record<string, unknown>,
      })
      .select("id")
      .single();

    if (erroGravar) {
      // Índice único disparando é aviso repetido, não falha: a Applyfy
      // reenviando algo que já foi processado.
      if (erroGravar.code === "23505") {
        console.log("Aviso repetido, já processado:", transacao.id);

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

    console.log("Pagamento processado:", { evento, email, status, plano, resultado });

    return new Response(
      JSON.stringify({ recebido: true, evento, status, plano, resultado }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (erro) {
    // Responder 200 evita o laço de reenvio. O que houve fica no log e, quase
    // sempre, também em `pagamentos`.
    console.error("Falha ao processar webhook da Applyfy:", erro);

    return new Response(JSON.stringify({ recebido: true, erro: String(erro) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
