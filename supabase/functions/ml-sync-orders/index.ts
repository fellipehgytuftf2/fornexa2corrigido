// ============================================================================
// FORNEXA — ml-sync-orders
// ============================================================================
// Objetivo: buscar pedidos REAIS do Mercado Livre (GET /orders/search) e
// criar/atualizar registros na tabela `orders`, substituindo o fluxo manual
// de "Registrar venda" (que usava um cliente fictício aleatório).
//
// Regras de design importantes:
//   - Mantém a MESMA regra do "Registrar venda" manual: se o produto do
//     pedido não tiver fornecedor vinculado em user_products, o pedido é
//     PULADO (não criado) — não dá pra preencher as colunas obrigatórias de
//     fornecedor sem isso.
//   - NUNCA sobrescreve o `status` de um pedido já existente — o vendedor
//     controla o avanço do status manualmente dentro do FORNEXA (pendente →
//     enviado ao fornecedor → a caminho → entregue). A sincronização só
//     atualiza campos que vêm de fato do Mercado Livre (ml_shipment_id,
//     tracking_code, endereço/telefone do comprador quando disponíveis).
//   - Usa `ml_order_id` como chave de idempotência (índice único parcial no
//     banco) para nunca duplicar o mesmo pedido em execuções repetidas.
//
// Fluxo:
//   1. Valida o JWT do usuário
//   2. Busca a conexão ML do vendedor (renovando token se necessário)
//   3. Busca os pedidos recentes via GET /orders/search
//   4. Para cada pedido, tenta casar com um user_products via ml_item_id
//   5. Busca dados de envio (GET /shipments/{id}) quando disponível, para
//      preencher endereço/telefone/rastreio
//   6. Insere pedidos novos ou atualiza campos de rastreio dos existentes
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chaveSecreta, urlDoProjeto } from "../_shared/chaves.ts";
import { obterAccessToken } from "../_shared/tokenMercadoLivre.ts";

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

  try {
    // 1. Validar o usuário logado
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Token de autenticação ausente" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado ou token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vendedorId = userData.user.id;

    // 2. Buscar a conexão ML do vendedor
    const { data: connection, error: connectionError } = await supabase
      .from("ml_connections")
      .select("*")
      .eq("user_id", vendedorId)
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
      return new Response(
        JSON.stringify({ error: "Nenhuma conexão ativa com o Mercado Livre. Conecte sua conta em Integrações." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mlUserId = connection.external_account_id as string;

    const token = await obterAccessToken(supabase, connection);

    if (!token.ok) {
      console.error("Falha ao obter token antes de sincronizar pedidos:", token.motivo);
      return new Response(
        JSON.stringify({ error: "Sua conexão com o Mercado Livre expirou. Reconecte em Integrações." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = token.accessToken;

    // 3. Buscar pedidos recentes do Mercado Livre (últimos 30 dias, mais
    // recentes primeiro). O endpoint /orders/search é paginado; para manter
    // esta primeira versão simples, buscamos só a primeira página (50
    // pedidos mais recentes) — suficiente para uso manual via botão
    // "Sincronizar pedidos". Paginação completa fica como próximo passo se
    // o volume de pedidos crescer.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const ordersResponse = await fetch(
      `https://api.mercadolibre.com/orders/search?seller=${mlUserId}&order.date_created.from=${encodeURIComponent(
        thirtyDaysAgo
      )}&sort=date_desc&limit=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const ordersData = await ordersResponse.json();

    if (!ordersResponse.ok) {
      console.error("Falha ao buscar pedidos no Mercado Livre:", ordersData);
      await supabase.from("log_integracao_ml").insert({
        contexto: "ml-sync-orders",
        mensagem: "Falha ao buscar pedidos no Mercado Livre",
        detalhes: ordersData,
      });
      return new Response(
        JSON.stringify({ error: "Não foi possível buscar os pedidos no Mercado Livre." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mlOrders: any[] = ordersData?.results ?? [];

    let created = 0;
    let updated = 0;
    let skippedNoProduct = 0;
    let skippedNoSupplier = 0;
    const errors: { ml_order_id: string; motivo: string }[] = [];

    for (const mlOrder of mlOrders) {
      const mlOrderId = String(mlOrder.id);

      try {
        // 4. Casar o pedido com um produto publicado (via ml_item_id)
        const firstItem = mlOrder?.order_items?.[0];
        const mlItemId = firstItem?.item?.id;

        if (!mlItemId) {
          errors.push({ ml_order_id: mlOrderId, motivo: "Pedido sem item associado" });
          continue;
        }

        const { data: userProduct } = await supabase
          .from("user_products")
          .select("*")
          .eq("user_id", vendedorId)
          .eq("ml_item_id", mlItemId)
          .maybeSingle();

        if (!userProduct) {
          skippedNoProduct += 1;
          continue;
        }

        // Mesma regra do "Registrar venda" manual: sem fornecedor vinculado,
        // não dá pra preencher as colunas obrigatórias de fornecedor.
        if (!userProduct.supplier_id) {
          skippedNoSupplier += 1;
          continue;
        }

        const { data: supplier } = await supabase
          .from("suppliers")
          .select("*")
          .eq("id", userProduct.supplier_id)
          .maybeSingle();

        if (!supplier) {
          skippedNoSupplier += 1;
          continue;
        }

        // Verifica se este pedido já existe (idempotência via ml_order_id)
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("id, status")
          .eq("ml_order_id", mlOrderId)
          .maybeSingle();

        // 5. Buscar dados de envio (endereço, telefone, rastreio), quando
        // o pedido já tiver um shipment associado. Nem todo pedido recém
        // criado no ML já tem isso disponível — tratamos como opcional.
        let trackingCode = "";
        let mlShipmentId: string | null = null;
        let customerAddress = "Endereço não disponível via sincronização automática";
        let customerPhone = "Não informado";

        const shippingId = mlOrder?.shipping?.id;

        if (shippingId) {
          mlShipmentId = String(shippingId);

          const shipmentResponse = await fetch(
            `https://api.mercadolibre.com/shipments/${shippingId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );

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

        // Mercado Livre normalmente não expõe o e-mail real do comprador por
        // privacidade — fica como null quando indisponível (coluna aceita).
        const customerEmail: string | null = buyer.email ?? null;

        const quantidade = firstItem?.quantity ?? 1;
        const salePrice = Number(firstItem?.unit_price ?? userProduct.sale_price ?? 0);
        const profit = salePrice - Number(userProduct.supplier_price ?? 0);

        // ------------------------------------------------------------------
        // Custos reais do Mercado Livre
        // ------------------------------------------------------------------
        // Sem isto o lucro exibido é bruto: preço de venda menos preço do
        // fornecedor, ignorando o que o ML retém. Num anúncio acima de R$ 79,
        // onde o frete grátis entra e o vendedor banca parte dele, a diferença
        // entre o lucro exibido e o real chega a virar prejuízo.
        //
        // `sale_fee` vem por unidade em cada item, então multiplica pela
        // quantidade. O frete vem de uma chamada separada, porque o objeto do
        // envio não traz quanto o VENDEDOR paga — só `/costs` traz, em
        // `senders[].cost`.

        let taxaMarketplace: number | null = null;
        let custoFrete: number | null = null;

        const itens = Array.isArray(mlOrder?.order_items) ? mlOrder.order_items : [];

        if (itens.length > 0) {
          taxaMarketplace = itens.reduce(
            (soma: number, item: Record<string, unknown>) =>
              soma + Number(item?.sale_fee ?? 0) * Number(item?.quantity ?? 1),
            0
          );
        }

        if (shippingId) {
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
            // Custo é informação contábil, não operacional: falhar aqui não
            // pode impedir o pedido de chegar ao fornecedor.
            console.error("Falha ao buscar custo de frete:", erroCusto);
          }
        }

        const custosApurados =
          taxaMarketplace !== null || custoFrete !== null
            ? new Date().toISOString()
            : null;

        // Status do lado do Mercado Livre. Não se confunde com orders.status,
        // que é o andamento interno controlado por vendedor e fornecedor.
        // O portal do fornecedor só mostra pedido pago, então pagamento
        // recusado ou venda cancelada some de lá sozinho.
        const mlOrderStatus: string | null = mlOrder?.status ?? null;
        const mlOrderStatusDetail: string | null = mlOrder?.status_detail ?? null;

        if (existingOrder) {
          // Pedido já existe: atualiza SOMENTE campos que vêm do Mercado
          // Livre (rastreio/shipment/contato) — nunca o status, que é
          // controlado manualmente pelo vendedor no FORNEXA.
          const { error: updateError } = await supabase
            .from("orders")
            .update({
              ml_shipment_id: mlShipmentId,
              ml_order_status: mlOrderStatus,
              ml_order_status_detail: mlOrderStatusDetail,
              tracking_code: trackingCode,
              customer_phone: customerPhone,
              customer_address: customerAddress,
              customer_email: customerEmail,
              // Os custos só chegam depois que o ML fecha a cobrança, então
              // pedido antigo ganha o valor numa sincronização seguinte.
              taxa_marketplace: taxaMarketplace,
              custo_frete: custoFrete,
              custos_apurados_em: custosApurados,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingOrder.id);

          if (updateError) {
            errors.push({ ml_order_id: mlOrderId, motivo: updateError.message });
            continue;
          }

          updated += 1;
        } else {
          // Pedido novo: insere com status inicial 'pending', igual ao
          // fluxo manual de "Registrar venda".
          const { error: insertError } = await supabase.from("orders").insert({
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
            ml_order_status: mlOrderStatus,
            ml_order_status_detail: mlOrderStatusDetail,
            quantidade,
            taxa_marketplace: taxaMarketplace,
            custo_frete: custoFrete,
            custos_apurados_em: custosApurados,
          });

          if (insertError) {
            errors.push({ ml_order_id: mlOrderId, motivo: insertError.message });
            continue;
          }

          created += 1;
        }
      } catch (loopErr) {
        console.error(`Erro ao processar pedido ${mlOrderId}:`, loopErr);
        errors.push({ ml_order_id: mlOrderId, motivo: String(loopErr) });
      }
    }

    if (errors.length > 0) {
      await supabase.from("log_integracao_ml").insert({
        contexto: "ml-sync-orders",
        mensagem: "Alguns pedidos falharam durante a sincronização",
        detalhes: { vendedorId, errors },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_encontrados: mlOrders.length,
        criados: created,
        atualizados: updated,
        pulados_sem_produto: skippedNoProduct,
        pulados_sem_fornecedor: skippedNoSupplier,
        erros: errors.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erro em ml-sync-orders:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno ao sincronizar pedidos" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});