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
//   2. SEMPRE responde 200 pro Mercado Livre (mesmo se o processamento
//      interno falhar) — isso evita que o ML fique reenviando a mesma
//      notificação em loop; o controle de falha fica só no nosso banco.
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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

    if (!isOrderTopic || !resource || !mlUserIdRaw) {
      if (webhookEventId) {
        await supabase
          .from("webhook_events")
          .update({
            status: "processado",
            erro_mensagem: isOrderTopic ? "Payload incompleto (sem resource/user_id)" : "Tópico não relacionado a pedidos, ignorado",
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

    // 3. Buscar os detalhes do pedido direto pelo "resource" que o webhook
    // já indica (ex: "/orders/1234567890")
    const orderDetailResponse = await fetch(`https://api.mercadolibre.com${resource}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const mlOrder = await orderDetailResponse.json();

    if (!orderDetailResponse.ok) {
      if (webhookEventId) {
        await supabase
          .from("webhook_events")
          .update({
            status: "erro",
            erro_mensagem: `Falha ao buscar detalhes do pedido: ${JSON.stringify(mlOrder)}`,
            processado_em: new Date().toISOString(),
          })
          .eq("id", webhookEventId);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      if (webhookEventId) {
        await supabase
          .from("webhook_events")
          .update({
            status: "erro",
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
        supplier_whatsapp: supplier.whatsapp ?? "",
        supplier_email: supplier.email ?? "",
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