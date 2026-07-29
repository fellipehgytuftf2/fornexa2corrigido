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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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
      .eq("status", "connected")
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
    let accessToken = connection.access_token as string;

    // Renova o token se necessário (mesma lógica das outras funções)
    const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
    const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;

    if (expiresAt < fiveMinutesFromNow) {
      const refreshResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: Deno.env.get("ML_CLIENT_ID")!,
          client_secret: Deno.env.get("ML_CLIENT_SECRET")!,
          refresh_token: connection.refresh_token,
        }),
      });

      const refreshData = await refreshResponse.json();

      if (refreshResponse.ok) {
        accessToken = refreshData.access_token;
        const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

        await supabase
          .from("ml_connections")
          .update({
            access_token: refreshData.access_token,
            refresh_token: refreshData.refresh_token ?? connection.refresh_token,
            expires_at: newExpiresAt,
          })
          .eq("id", connection.id);
      } else {
        if (webhookEventId) {
          await supabase
            .from("webhook_events")
            .update({
              status: "erro",
              erro_mensagem: "Falha ao renovar token do vendedor ao processar webhook",
              processado_em: new Date().toISOString(),
            })
            .eq("id", webhookEventId);
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

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

    if (existingOrder) {
      await supabase
        .from("orders")
        .update({
          ml_shipment_id: mlShipmentId,
          tracking_code: trackingCode,
          customer_phone: customerPhone,
          customer_address: customerAddress,
          customer_email: customerEmail,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingOrder.id);
    } else {
      await supabase.from("orders").insert({
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
        quantidade,
      });
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