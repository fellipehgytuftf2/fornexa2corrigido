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

    if (!isOrderTopic && !isShipmentTopic) {
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
              ml_liberacao_em:
                typeof buffering?.date === "string" ? buffering.date : null,
              tracking_code: envio?.tracking_number ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("ml_order_id", mlOrderDoEnvio)
            .eq("user_id", vendedorId);
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
    let customerAddress = "Endereço não disponível via sincronização automática";
    let customerPhone = "Não informado";

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