// ============================================================================
// FORNEXA — ml-webhook-receiver
// ============================================================================
// Objetivo: receber as notificações (webhooks) que o PRÓPRIO Mercado Livre
// envia automaticamente quando algo muda em um pedido (topic "orders_v2"),
// e sincronizar isso na tabela `orders` em tempo real — sem o vendedor
// precisar clicar no botão "Sincronizar com Mercado Livre" manualmente.
//
// IMPORTANTE — configuração no Supabase:
//   Esta função é chamada pelo Mercado Livre, não pelo front-end do
//   FORNEXA. Ela precisa ser deployada com "Verify JWT" DESLIGADO, senão o
//   próprio Supabase bloqueia a chamada do Mercado Livre com 401 antes de
//   chegar no nosso código (o ML não manda nenhum token de usuário).
//
// IMPORTANTE — configuração no Mercado Livre:
//   No painel de desenvolvedor do Mercado Livre, em "Notificações", cadastre
//   a URL desta função (https://<seu-projeto>.supabase.co/functions/v1/
//   ml-webhook-receiver) para o tópico "orders_v2".
//
// Estratégia de confiabilidade:
//   1. Registra a notificação em `webhook_events` (status 'pendente') ANTES
//      de processar qualquer coisa — se o processamento falhar, a
//      notificação não se perde, fica registrada com status 'erro' e a
//      mensagem do problema, pra investigar depois.
//   2. Responde 200 pro Mercado Livre mesmo quando o processamento interno
//      falha — isso evita que o ML fique reenviando a mesma notificação em
//      loop; o controle de falha fica no nosso banco. A exceção é a falha
//      PASSAGEIRA, de fora (conexão do vendedor caída, Mercado Livre fora do
//      ar): aí responde 503 de propósito, porque 200 faria o ML dar a venda
//      por entregue e ela sumiria para sempre.
//   3. Reaproveita a MESMA lógica de casamento produto→fornecedor e a MESMA
//      regra de nunca sobrescrever o status manual do vendedor, que já
//      existe em ml-sync-orders.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chaveSecreta, urlDoProjeto } from "../_shared/chaves.ts";
import { obterAccessToken } from "../_shared/tokenMercadoLivre.ts";
import { emitirDceSePreciso } from "../_shared/emitirDce.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Confere o segredo opcional na query string (?secret=...).
 *
 * Achado em auditoria: esta função não verificava de forma alguma que a
 * notificação veio do Mercado Livre — qualquer um podia forjar um POST e
 * forçar ressincronizações arbitrárias (gasto de cota de API do vendedor).
 *
 * O Mercado Livre não assina os webhooks dele, então a defesa de mercado é
 * um segredo na própria URL cadastrada no painel de notificações. Fica
 * opcional (devolve true se ML_WEBHOOK_SECRET não estiver configurado) para
 * não quebrar o recebimento em produção antes de alguém:
 *   1. Definir o secret ML_WEBHOOK_SECRET nas Edge Functions do Supabase;
 *   2. Trocar, no painel de desenvolvedor do Mercado Livre, a URL cadastrada
 *      em Notificações para .../ml-webhook-receiver?secret=<o mesmo valor>.
 * Enquanto isso não for feito, o comportamento é o de antes.
 */
function segredoConfere(req: Request): boolean {
  const esperado = Deno.env.get("ML_WEBHOOK_SECRET");
  if (!esperado) return true;

  const recebido = new URL(req.url).searchParams.get("secret");
  return recebido === esperado;
}

/**
 * O que veio na resposta, quando for JSON de verdade.
 *
 * Existe para nao precisar anotar `any` a mao: JSON.parse ja devolve `any`, e
 * devolver null no lugar da excecao e o que permite tratar "nao e JSON" como
 * uma resposta possivel em vez de um erro que sobe.
 */
function comoJson(texto: string) {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!segredoConfere(req)) {
    // 200 e nada de processamento: não dá pista de que o segredo existe, e
    // não gasta trabalho com um POST que já sabemos que não é do ML.
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    urlDoProjeto()!,
    chaveSecreta()!
  );

  // Sempre respondemos 200 no final, mesmo em caso de erro interno — o
  // Mercado Livre reenvia a notificação repetidamente se não receber 200,
  // e como já registramos tudo em webhook_events, não corremos risco de
  // perder o evento silenciosamente.
  let webhookEventId: string | null = null;

  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      // Corpo ilegível — não há o que registrar de forma estruturada, mas
      // ainda respondemos 200 para não gerar reenvios em loop por algo que
      // não vamos conseguir processar de qualquer forma.
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { resource, user_id: mlUserIdRaw, topic, application_id, attempts } = body;

    // 1. Registrar a notificação recebida ANTES de processar qualquer coisa
    const { data: webhookEvent, error: insertEventError } = await supabase
      .from("webhook_events")
      .insert({
        topic: topic ?? "desconhecido",
        resource: resource ?? "",
        ml_user_id: mlUserIdRaw ?? null,
        application_id: application_id ?? null,
        payload_raw: body,
        status: "pendente",
        tentativas: attempts ?? 1,
        criado_em: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertEventError) {
      console.error("Falha ao registrar webhook_event:", insertEventError);
    } else {
      webhookEventId = webhookEvent.id;
    }

    // Só processamos tópicos relacionados a pedidos — outros tópicos (ex:
    // perguntas, itens) ficam só registrados, sem ação, por enquanto.
    const isOrderTopic = typeof topic === "string" && topic.includes("order");

    /**
     * O aviso de ENVIO, que a gente ignorava.
     *
     * O envio nem sempre existe quando a venda chega: o Mercado Livre cria o
     * pedido, avisa em "orders", e segundos depois cria o envio e avisa em
     * "shipments". Escutando só o primeiro, o pedido nascia sem envio e ficava
     * assim — sem etiqueta, para sempre, até alguém sincronizar na mão.
     *
     * O fornecedor via "este pedido não tem envio no Mercado Livre" num pedido
     * pago, e não havia nada que ele pudesse fazer.
     */
    const isShipmentTopic = typeof topic === "string" && topic.includes("shipment");

    /**
     * A reclamação do comprador.
     *
     * A devolução que o estado do envio enxerga é a que volta sozinha: pacote
     * não entregue, recusado, cancelado depois de sair. A outra metade começa
     * na mão do comprador DEPOIS de ele receber — arrependimento, defeito,
     * produto errado — e disso o envio não diz nada, porque ele foi entregue.
     *
     * Essa metade vive no canal de pós-venda do Mercado Livre, que o FORNEXA
     * não escutava. Era o pedaço que ainda dependia de alguém ler e-mail.
     *
     * Os tópicos chegam com nomes diferentes conforme o que o aplicativo
     * assinou ("claims", "post_purchase"), então olhamos os dois.
     */
    const isClaimTopic =
      typeof topic === "string" &&
      (topic.includes("claim") || topic.includes("post_purchase"));

    if (!isOrderTopic && !isShipmentTopic && !isClaimTopic) {
      if (webhookEventId) {
        await supabase
          .from("webhook_events")
          .update({
            status: "processado",
            erro_mensagem: "Tópico não relacionado a pedidos, ignorado",
            processado_em: new Date().toISOString(),
          })
          .eq("id", webhookEventId);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!resource || !mlUserIdRaw) {
      if (webhookEventId) {
        await supabase
          .from("webhook_events")
          .update({
            status: "processado",
            erro_mensagem: "Payload incompleto (sem resource/user_id)",
            processado_em: new Date().toISOString(),
          })
          .eq("id", webhookEventId);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Encontrar a qual vendedor do FORNEXA este ml_user_id pertence
    const { data: connection, error: connectionError } = await supabase
      .from("ml_connections")
      .select("*")
      .eq("external_account_id", String(mlUserIdRaw))
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

    if (connectionError || !connection) {
      if (webhookEventId) {
        await supabase
          .from("webhook_events")
          .update({
            status: "erro",
            erro_mensagem: `Nenhuma conexão FORNEXA encontrada para ml_user_id ${mlUserIdRaw}`,
            processado_em: new Date().toISOString(),
          })
          .eq("id", webhookEventId);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vendedorId = connection.user_id as string;

    const token = await obterAccessToken(supabase, connection);

    if (!token.ok) {
      if (webhookEventId) {
        await supabase
          .from("webhook_events")
          .update({
            status: "erro",
            erro_mensagem: "Conexão do vendedor com o Mercado Livre precisa ser refeita",
            processado_em: new Date().toISOString(),
          })
          .eq("id", webhookEventId);
      }

      // 503 de propósito, e não 200.
      //
      // Responder 200 dizia ao Mercado Livre "recebi e resolvi", e ele
      // marcava a notificação como entregue — a venda sumia para sempre.
      // Com 503 ele reenvia por horas, e quando o vendedor reconectar o
      // pedido entra sozinho, sem ninguém precisar descobrir que faltou.
      return new Response(JSON.stringify({ received: false, retry: true }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = token.accessToken;

    // 2.5 Aviso de envio: liga o envio ao pedido que já existe aqui.
    //
    // O recurso é "/shipments/{id}", e o próprio envio diz de qual venda é.
    // Não cria pedido: se a venda ainda não chegou, o aviso de "orders" vem
    // logo e traz tudo.
    if (isShipmentTopic) {
      const envioResposta = await fetch(`https://api.mercadolibre.com${resource}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (envioResposta.ok) {
        const envio = await envioResposta.json();
        const mlOrderDoEnvio = envio?.order_id ? String(envio.order_id) : null;

        if (mlOrderDoEnvio) {
          const buffering = envio?.buffering as Record<string, unknown> | null | undefined;

          await supabase
            .from("orders")
            .update({
              ml_shipment_id: String(envio.id ?? resource.split("/").pop()),
              ml_shipment_substatus: envio?.substatus ? String(envio.substatus) : null,
              ml_shipment_visto_em: new Date().toISOString(),
              // `self_service` é o Flex, que exige cadastro prévio do vendedor
              // na transportadora do fornecedor. O campo já vinha no envio e
              // era descartado; sem ele ninguém sabia qual pedido era Flex até
              // o pacote empacar na bancada.
              ml_logistic_type:
                (envio?.logistic_type as string | undefined) ??
                ((envio?.logistic as Record<string, unknown> | undefined)?.type as
                  | string
                  | undefined) ??
                null,
              ml_liberacao_em:
                typeof buffering?.date === "string" ? buffering.date : null,
              tracking_code: envio?.tracking_number ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("ml_order_id", mlOrderDoEnvio)
            .eq("user_id", vendedorId);

          // O pacote está voltando.
          //
          // O Mercado Livre diz isso no estado do envio, e ninguém lia: a
          // devolução só existia se o vendedor abrisse na mão, depois de ver
          // um e-mail. Em 30/09 um pacote voltou duas vezes sem ninguém
          // reagir, e o produto se perdeu.
          //
          // Aberta aqui, o vendedor acorda com ela já registrada e só precisa
          // colar o código de autorização — que é o passo que trava o motorista
          // na portaria do fornecedor.
          const statusDoEnvio = String(envio?.status ?? "");
          const subStatusDoEnvio = String(envio?.substatus ?? "");

          const voltando =
            statusDoEnvio === "not_delivered" ||
            subStatusDoEnvio.includes("returning") ||
            subStatusDoEnvio === "return_to_sender" ||
            subStatusDoEnvio === "refused_delivery";

          // Cancelado depois de despachado também volta — é o caso do Flex que
          // o fornecedor relatou.
          //
          // "Despachado" não é ter número de rastreio: o Mercado Livre entrega
          // esse número junto com a etiqueta, antes de o pacote existir. Usar
          // o rastreio como sinal fez cancelamento de mercadoria parada na
          // prateleira virar devolução — "devolução só após enviado", como ele
          // corrigiu. O que vale é a data de postagem.
          const dataDeEnvio =
            (envio?.status_history as Record<string, unknown> | undefined)?.date_shipped ??
            (envio?.status_history as Record<string, unknown> | undefined)?.date_first_visit;

          const canceladoDepoisDeSair =
            statusDoEnvio === "cancelled" && Boolean(dataDeEnvio);

          if (voltando || canceladoDepoisDeSair) {
            const { data: resultado } = await supabase.rpc("abrir_devolucao_automatica", {
              p_ml_order_id: mlOrderDoEnvio,
              p_motivo:
                canceladoDepoisDeSair && envio?.logistic_type === "self_service"
                  ? "cancelado_flex"
                  : "nao_entregue",
            });

            const criada = resultado as { ok?: boolean; ja_existia?: boolean } | null;

            if (criada?.ok && !criada.ja_existia) {
              await supabase.from("log_integracao_ml").insert({
                contexto: "devolucao-automatica",
                mensagem: `Devolução aberta pelo estado do envio (${statusDoEnvio}/${subStatusDoEnvio})`,
                detalhes: {
                  ml_order_id: mlOrderDoEnvio,
                  shipment_id: String(envio?.id ?? ""),
                  status: statusDoEnvio,
                  substatus: subStatusDoEnvio,
                },
              });
            }
          }
        }
      }

      if (webhookEventId) {
        await supabase
          .from("webhook_events")
          .update({
            status: "processado",
            processado_em: new Date().toISOString(),
          })
          .eq("id", webhookEventId);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2.7 Reclamação do comprador: abre a devolução do que já foi entregue.
    //
    // POR QUE GRAVAMOS A RECLAMAÇÃO CRUA
    //
    // O motivo não vem num campo só, e o nome dele muda conforme o tipo da
    // reclamação. Em vez de adivinhar e abrir devolução com motivo errado, a
    // reclamação inteira fica em `log_integracao_ml` — como fizemos com a
    // DC-e. Com as primeiras reclamações reais na mão, o mapa abaixo deixa de
    // ser palpite.
    if (isClaimTopic) {
      // O recurso às vezes vem só como "/claims/{id}". O detalhe completo (com
      // o pedido e o motivo) mora no caminho de pós-venda.
      const idDaReclamacao = String(resource).split("/").filter(Boolean).pop() ?? "";
      const caminhos = [
        String(resource),
        `/post-purchase/v1/claims/${idDaReclamacao}`,
      ];

      let reclamacao: Record<string, unknown> | null = null;

      for (const caminho of caminhos) {
        const resposta = await fetch(`https://api.mercadolibre.com${caminho}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!resposta.ok) continue;

        const lido = comoJson(await resposta.text());
        if (lido && typeof lido === "object") {
          reclamacao = lido as Record<string, unknown>;
          break;
        }
      }

      // O pedido pode vir como `resource_id` (reclamação de venda) ou dentro
      // de `resource`.
      const pedidoDaReclamacao = (() => {
        const direto = reclamacao?.resource_id;
        if (direto) return String(direto);
        const dentro = (reclamacao?.resource as Record<string, unknown> | undefined)?.id;
        return dentro ? String(dentro) : null;
      })();

      const textoDaReclamacao = JSON.stringify(reclamacao ?? {}).toLowerCase();

      // Só abre devolução quando o produto está voltando. Reclamação que é só
      // conversa (pergunta sobre prazo, mediação sem retorno) não é devolução,
      // e abrir uma faria o fornecedor esperar um pacote que não vem.
      const temRetorno =
        textoDaReclamacao.includes("return") ||
        textoDaReclamacao.includes("devolucion") ||
        String(reclamacao?.type ?? "").includes("cancel");

      const motivo = textoDaReclamacao.includes("not_received") ||
        textoDaReclamacao.includes("not_delivered")
        ? "nao_entregue"
        : textoDaReclamacao.includes("defect") ||
            textoDaReclamacao.includes("damaged") ||
            textoDaReclamacao.includes("broken")
          ? "defeito"
          : textoDaReclamacao.includes("different") ||
              textoDaReclamacao.includes("wrong") ||
              textoDaReclamacao.includes("incomplete")
            ? "produto_errado"
            : "arrependimento";

      let resultadoDaAbertura: unknown = null;

      if (temRetorno && pedidoDaReclamacao) {
        const { data } = await supabase.rpc("abrir_devolucao_automatica", {
          p_ml_order_id: pedidoDaReclamacao,
          p_motivo: motivo,
        });
        resultadoDaAbertura = data;
      }

      await supabase.from("log_integracao_ml").insert({
        contexto: "reclamacao-ml",
        mensagem: temRetorno && pedidoDaReclamacao
          ? `Devolução de reclamação (${motivo}) no pedido ${pedidoDaReclamacao}`
          : `Reclamação recebida sem retorno de produto (tópico ${topic})`,
        detalhes: {
          topic,
          resource,
          ml_order_id: pedidoDaReclamacao,
          motivo_escolhido: motivo,
          abriu_devolucao: resultadoDaAbertura,
          reclamacao,
        },
      });

      if (webhookEventId) {
        await supabase
          .from("webhook_events")
          .update({
            status: "processado",
            erro_mensagem: reclamacao ? null : "Reclamação não pôde ser lida na API",
            processado_em: new Date().toISOString(),
          })
          .eq("id", webhookEventId);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Buscar os detalhes do pedido direto pelo "resource" que o webhook
    // já indica (ex: "/orders/1234567890")
    const orderDetailResponse = await fetch(`https://api.mercadolibre.com${resource}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Lê como texto antes de tentar JSON, de propósito.
    //
    // Quando o Mercado Livre tropeça, quem responde é o gateway dele, com uma
    // página HTML. `.json()` direto estourava `SyntaxError: Unexpected token
    // '<'`, o erro caía no catch geral lá de baixo e ia cru para a tela de
    // Pedidos do vendedor — uma mensagem que não explica nada e faz parecer
    // defeito do FORNEXA.
    const corpoDoPedido = await orderDetailResponse.text();

    const mlOrder = comoJson(corpoDoPedido);

    if (!orderDetailResponse.ok || !mlOrder) {
      // Instabilidade do lado deles passa; 404 e 403 não. Só a primeira vale
      // pedir reenvio — e vale muito: respondendo 200, o Mercado Livre dá a
      // notificação por entregue e a venda só entra se alguém lembrar de
      // clicar em "Sincronizar" dentro dos 30 dias que a busca alcança.
      const passageiro = !mlOrder || orderDetailResponse.status >= 500;

      if (webhookEventId) {
        await supabase
          .from("webhook_events")
          .update({
            status: "erro",
            erro_mensagem:
              `Falha ao buscar detalhes do pedido: o Mercado Livre respondeu ` +
              `${orderDetailResponse.status} com ${mlOrder ? "um erro" : "algo que não é JSON"}` +
              ` — ${corpoDoPedido.slice(0, 200)}`,
            processado_em: new Date().toISOString(),
          })
          .eq("id", webhookEventId);
      }

      return new Response(
        JSON.stringify({ received: !passageiro, retry: passageiro }),
        {
          status: passageiro ? 503 : 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const mlOrderId = String(mlOrder.id);
    const firstItem = mlOrder?.order_items?.[0];
    const mlItemId = firstItem?.item?.id;

    if (!mlItemId) {
      if (webhookEventId) {
        await supabase
          .from("webhook_events")
          .update({
            status: "erro",
            erro_mensagem: "Pedido sem item associado",
            processado_em: new Date().toISOString(),
          })
          .eq("id", webhookEventId);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Casar com o produto publicado e o fornecedor — mesma regra do
    // ml-sync-orders: sem fornecedor vinculado, não dá pra criar o pedido.
    const { data: userProduct } = await supabase
      .from("user_products")
      .select("*")
      .eq("user_id", vendedorId)
      .eq("ml_item_id", mlItemId)
      .maybeSingle();

    if (!userProduct) {
      // 'ignorado', nao 'erro'.
      //
      // Venda de anuncio que nao esta em Meus Produtos — criado direto no
      // Mercado Livre, ou de antes do FORNEXA. Nao e falha nossa: nao ha o que
      // processar, o pedido nao e daqui.
      //
      // Chamar isso de erro custava caro dos dois lados. Em 22/09/2026 eram
      // 18.367 linhas de 'erro' com esta mesma mensagem, ~1.500 por dia, 83%
      // de tudo que a tabela guardava — e as falhas de verdade ficavam
      // enterradas no meio. Do lado do vendedor, a tela de Pedidos mostrava
      // alarme vermelho pedindo para ele "corrigir" uma venda que nunca foi
      // do FORNEXA.
      //
      // A linha continua gravada, com a mensagem, para quem quiser auditar.
      if (webhookEventId) {
        await supabase
          .from("webhook_events")
          .update({
            status: "ignorado",
            erro_mensagem: `Nenhum produto encontrado para ml_item_id ${mlItemId}`,
            processado_em: new Date().toISOString(),
          })
          .eq("id", webhookEventId);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!userProduct.supplier_id) {
      if (webhookEventId) {
        await supabase
          .from("webhook_events")
          .update({
            status: "erro",
            erro_mensagem: "Produto sem fornecedor vinculado — pedido não pode ser criado",
            processado_em: new Date().toISOString(),
          })
          .eq("id", webhookEventId);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: supplier } = await supabase
      .from("suppliers")
      .select("*")
      .eq("id", userProduct.supplier_id)
      .maybeSingle();

    if (!supplier) {
      if (webhookEventId) {
        await supabase
          .from("webhook_events")
          .update({
            status: "erro",
            erro_mensagem: "Fornecedor vinculado ao produto não foi encontrado",
            processado_em: new Date().toISOString(),
          })
          .eq("id", webhookEventId);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Buscar dados de envio, quando disponíveis
    let trackingCode = "";
    let mlShipmentId: string | null = null;
    let mlShipmentSubstatus: string | null = null;
    // Ver o comentário no caminho do aviso de envio: `self_service` é o Flex.
    let mlLogisticType: string | null = null;
    let customerAddress = "Endereço não disponível via sincronização automática";
    let customerPhone = "Não informado";

    /**
     * Os custos reais do Mercado Livre: comissão e frete.
     *
     * Isto existia só no `ml-sync-orders`, que roda quando o vendedor abre a
     * tela de Pedidos. O webhook é o caminho NORMAL de entrada da venda, e
     * gravava o pedido sem nenhum dos dois. Quem não abria a tela ficava com
     * `lucro_liquido` calculado sobre comissão e frete zero — lucro bruto
     * mostrado como se fosse líquido.
     *
     * Em 09/10/2026 eram 71 pedidos pagos nessa situação, incluindo do mesmo
     * dia. Um deles: venda de R$ 9,80, custo R$ 5,00, "lucro" de R$ 7,60 numa
     * venda que, com comissão e frete, dá prejuízo.
     *
     * `sale_fee` vem por unidade em cada item; o frete só aparece em
     * `/shipments/{id}/costs`, em `senders[].cost` — o objeto do envio não
     * diz quanto o VENDEDOR paga.
     */
    let taxaMarketplace: number | null = null;
    let custoFrete: number | null = null;

    const itensDaVenda = Array.isArray(mlOrder?.order_items) ? mlOrder.order_items : [];

    if (itensDaVenda.length > 0) {
      taxaMarketplace = itensDaVenda.reduce(
        (soma: number, item: Record<string, unknown>) =>
          soma + Number(item?.sale_fee ?? 0) * Number(item?.quantity ?? 1),
        0
      );
    }

    const shippingId = mlOrder?.shipping?.id;

    if (shippingId) {
      mlShipmentId = String(shippingId);

      const shipmentResponse = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (shipmentResponse.ok) {
        const shipmentData = await shipmentResponse.json();
        trackingCode = shipmentData?.tracking_number ?? "";
        mlShipmentSubstatus = shipmentData?.substatus ?? null;
        mlLogisticType =
          shipmentData?.logistic_type ?? shipmentData?.logistic?.type ?? null;

        // Uma chamada a mais por venda nova, e nunca derruba o webhook:
        // custo é informação contábil, não operacional. Falhar aqui não pode
        // impedir o pedido de chegar ao fornecedor.
        try {
          const custosResposta = await fetch(
            `https://api.mercadolibre.com/shipments/${shippingId}/costs`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );

          if (custosResposta.ok) {
            const custos = await custosResposta.json();
            const remetentes = Array.isArray(custos?.senders) ? custos.senders : [];

            custoFrete = remetentes.reduce(
              (soma: number, r: Record<string, unknown>) => soma + Number(r?.cost ?? 0),
              0
            );
          } else if (custosResposta.status === 404) {
            // Envio por conta do comprador não gera custo para o vendedor.
            // Zero é resposta legítima, diferente de "não perguntamos".
            custoFrete = 0;
          }
        } catch (erroCusto) {
          console.error("Falha ao buscar custo de frete:", erroCusto);
        }

        const receiverAddress = shipmentData?.receiver_address;
        if (receiverAddress) {
          const partesEndereco = [
            receiverAddress.street_name,
            receiverAddress.street_number,
            receiverAddress.city?.name,
            receiverAddress.state?.name,
          ].filter(Boolean);

          if (partesEndereco.length > 0) {
            customerAddress = partesEndereco.join(", ");
          }

          if (receiverAddress.receiver_phone) {
            customerPhone = receiverAddress.receiver_phone;
          }
        }
      }
    }

    const buyer = mlOrder?.buyer ?? {};
    const customerName =
      [buyer.first_name, buyer.last_name].filter(Boolean).join(" ") ||
      buyer.nickname ||
      "Comprador Mercado Livre";
    const customerEmail: string | null = buyer.email ?? null;

    const quantidade = firstItem?.quantity ?? 1;
    const salePrice = Number(firstItem?.unit_price ?? userProduct.sale_price ?? 0);
    const profit = salePrice - Number(userProduct.supplier_price ?? 0);

    // 6. Inserir ou atualizar o pedido — igual ao ml-sync-orders, nunca
    // sobrescrevendo o status manual do vendedor em pedidos já existentes.
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("ml_order_id", mlOrderId)
      .maybeSingle();

    // Status do lado do Mercado Livre, distinto de orders.status, que é o
    // andamento interno. O portal do fornecedor só mostra pedido pago, então
    // venda cancelada ou aguardando pagamento some de lá sozinha — e volta a
    // aparecer se o pagamento for aprovado depois, porque o webhook avisa.
    const mlOrderStatus: string | null = mlOrder?.status ?? null;
    const mlOrderStatusDetail: string | null = mlOrder?.status_detail ?? null;

    if (existingOrder) {
      await supabase
        .from("orders")
        .update({
          ml_shipment_id: mlShipmentId,
          ml_shipment_substatus: mlShipmentSubstatus,
          ml_logistic_type: mlLogisticType,
          // Só sobrescreve o que foi medido agora: null aqui não apaga o
          // que o ml-sync-orders já tinha apurado.
          ...(taxaMarketplace !== null ? { taxa_marketplace: taxaMarketplace } : {}),
          ...(custoFrete !== null ? { custo_frete: custoFrete } : {}),
          ...(taxaMarketplace !== null || custoFrete !== null
            ? { custos_apurados_em: new Date().toISOString() }
            : {}),
          ml_shipment_visto_em: mlShipmentSubstatus ? new Date().toISOString() : null,
          ml_order_status: mlOrderStatus,
          ml_order_status_detail: mlOrderStatusDetail,
          tracking_code: trackingCode,
          customer_phone: customerPhone,
          customer_address: customerAddress,
          customer_email: customerEmail,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingOrder.id);
    } else {
      const { data: pedidoCriado } = await supabase.from("orders").insert({
        user_id: vendedorId,
        user_product_id: userProduct.id,
        product_id: userProduct.id,
        supplier_id: userProduct.supplier_id,
        product_name: userProduct.name,
        product_image_url: userProduct.image_url,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        supplier_name: supplier.name ?? "",
        supplier_company_name: supplier.company_name ?? supplier.companyName ?? "",
        // Vazios de propósito. As colunas continuam existindo porque o
        // pedido é lido com `select` de lista em vários lugares, mas o
        // contato do fornecedor não é mais copiado para dentro do pedido: a
        // linha de `orders` é do vendedor, e tudo que entra nela ele pode
        // ler. Contato de fornecedor, só no Admin.
        supplier_whatsapp: "",
        supplier_email: "",
        supplier_shipping_time: supplier.average_shipping_time ?? supplier.averageShippingTime ?? "",
        supplier_price: userProduct.supplier_price,
        sale_price: salePrice,
        profit,
        status: "pending",
        tracking_code: trackingCode,
        marketplace: userProduct.marketplace || "Mercado Livre",
        ml_order_id: mlOrderId,
        ml_shipment_id: mlShipmentId,
        ml_shipment_substatus: mlShipmentSubstatus,
        ml_logistic_type: mlLogisticType,
        taxa_marketplace: taxaMarketplace,
        custo_frete: custoFrete,
        custos_apurados_em:
          taxaMarketplace !== null || custoFrete !== null
            ? new Date().toISOString()
            : null,
        ml_shipment_visto_em: mlShipmentSubstatus ? new Date().toISOString() : null,
        ml_order_status: mlOrderStatus,
        ml_order_status_detail: mlOrderStatusDetail,
        quantidade,
        // A embalagem, congelada no dia da venda. Ver a migração
        // 20260906180000: mudança de preço do fornecedor não pode
        // reescrever dívida de pedido antigo.
        taxa_embalagem: Number(supplier.taxa_embalagem ?? 0),
      })
        .select("id, user_id, ml_order_id")
        .single();

      // A DC-e, na chegada da venda. Este e o caminho normal: o webhook chega
      // sozinho, e e nele que o relogio de 3 dias comeca a correr.
      //
      // Nao trava o webhook: falhar aqui deixaria o Mercado Livre reenviando o
      // evento e duplicando trabalho, quando o pedido ja entrou.
      if (pedidoCriado) {
        await emitirDceSePreciso(supabase, pedidoCriado, accessToken);
      }
    }

    if (webhookEventId) {
      await supabase
        .from("webhook_events")
        .update({
          status: "processado",
          processado_em: new Date().toISOString(),
        })
        .eq("id", webhookEventId);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro em ml-webhook-receiver:", err);

    if (webhookEventId) {
      await supabase
        .from("webhook_events")
        .update({
          status: "erro",
          erro_mensagem: String(err),
          processado_em: new Date().toISOString(),
        })
        .eq("id", webhookEventId);
    }

    // Mesmo em erro interno, respondemos 200 — o evento já está registrado
    // em webhook_events com status 'erro' para investigação posterior.
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});