// ============================================================================
// FORNEXA — ml-publish-product
// ============================================================================
// Objetivo: publicar um anúncio DE VERDADE no Mercado Livre via API oficial,
// a partir dos dados de um produto do catálogo + margem definida pelo
// vendedor. Substitui o antigo fluxo, que só simulava a publicação com uma
// barra de progresso e salvava o produto direto no Supabase sem nunca
// chamar a API do Mercado Livre.
//
// Fluxo:
//   1. Valida o JWT do usuário (igual ml-oauth-start)
//   2. Busca a conexão ML do vendedor (precisa estar status = 'connected')
//   3. Descobre automaticamente a categoria do Mercado Livre a partir do
//      título do anúncio (endpoint de domain_discovery)
//   4. Descobre o(s) tipo(s) de anúncio disponíveis pra essa categoria
//      nessa conta, e usa o primeiro disponível
//   4.5 Busca os atributos obrigatórios da categoria e tenta preenchê-los
//      automaticamente — inclusive atributos do tipo lista (ex: "Tipo de
//      produto"), que exigem um value_id válido dentro das opções
//      permitidas pela categoria, não texto livre
//   5. Cria o item via POST /items
//   6. Envia a descrição via POST /items/{id}/description (endpoint
//      separado — a API do ML não aceita descrição no payload de criação)
//   7. Salva o resultado em user_products (ml_item_id, status, published_at)
//
// Espera um body JSON com os dados já calculados pelo front-end:
// {
//   catalog_product_id, supplier_id, name, image_url,
//   supplier_price, sale_price, margin,
//   announcement_title, announcement_description,
//   announcement_category, announcement_price, announcement_image_url
// }
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chaveSecreta, urlDoProjeto } from "../_shared/chaves.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PublishBody {
  catalog_product_id?: string;
  supplier_id: string;
  name: string;
  image_url: string;
  supplier_price: number;
  sale_price: number;
  margin: number;
  announcement_title: string;
  announcement_description: string;
  announcement_category?: string;
  announcement_price: number;
  announcement_image_url: string;
}

// Traduz erros conhecidos e recorrentes da API do Mercado Livre em mensagens
// amigáveis para o vendedor, já indicando o que fazer. Cobre casos que
// acontecem na conta do vendedor (não são bugs do FORNEXA) e que, sem essa
// tradução, apareceriam como um erro genérico e confuso.
function traduzirErroMercadoLivre(itemData: any): string | null {
  const message = itemData?.message ?? "";
  const cause = Array.isArray(itemData?.cause) ? itemData.cause : [];
  const causeCodes = cause.map((c: any) => c?.code ?? "").join(" ");

  if (message === "seller.unable_to_list" || causeCodes.includes("rejected_by_regulations")) {
    return "Sua conta do Mercado Livre ainda não está habilitada para vender. Isso geralmente acontece por pendência no cadastro fiscal (Faturador / NF-e) ou dados de endereço. Acesse 'Faturador' nas configurações da sua conta do Mercado Livre para verificar o que falta — normalmente é necessário ter CNPJ (ex: MEI) e o emissor de nota fiscal ativo.";
  }

  if (causeCodes.includes("address_pending")) {
    return "Falta confirmar o endereço fiscal da sua conta do Mercado Livre. Acesse 'Seu perfil' nas configurações da conta para revisar.";
  }

  if (causeCodes.includes("item.attributes.missing_required")) {
    return "Essa categoria do Mercado Livre exige informações adicionais do produto (como marca ou modelo) que ainda não conseguimos preencher automaticamente.";
  }

  if (causeCodes.includes("item.title.invalid_length") || causeCodes.includes("item.title")) {
    return "O título do anúncio não atende às regras do Mercado Livre (muito curto, muito longo ou com caracteres inválidos). Revise o título do produto.";
  }

  if (causeCodes.includes("item.price")) {
    return "O preço informado não é aceito pelo Mercado Livre para esta categoria. Revise o valor de venda.";
  }

  return null;
}

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
    const body: PublishBody = await req.json();

    if (!body.announcement_title || !body.announcement_price || !body.announcement_image_url) {
      return new Response(
        JSON.stringify({ error: "Dados obrigatórios do anúncio ausentes (título, preço ou imagem)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1.5 Verifica se este usuário é admin (coluna role já existente em
    // profiles). Só para role === 'admin', o título do anúncio recebe um
    // prefixo de aviso de teste — clientes reais do FORNEXA (role 'user')
    // nunca são afetados por isso.
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", vendedorId)
      .maybeSingle();

    if (profileError) {
      // Não bloqueia a publicação por causa disso, mas registra pra
      // investigar — mesmo padrão de bug já visto antes no projeto (falta
      // de GRANT para service_role causando falha silenciosa em leituras).
      console.error("Falha ao consultar profiles para checagem de admin:", profileError);
      await supabase.from("log_integracao_ml").insert({
        contexto: "ml-publish-product",
        mensagem: "Falha ao consultar profiles (checagem de admin)",
        detalhes: { vendedorId, profileError },
      });
    }

    const isTestAdmin = profileData?.role === "admin";
    const TEST_TITLE_PREFIX = "[TESTE - NÃO COMPRAR] ";

    // 2. Buscar a conexão ML do vendedor
    const { data: connection, error: connectionError } = await supabase
      .from("ml_connections")
      .select("*")
      .eq("user_id", vendedorId)
      .eq("status", "connected")
      .maybeSingle();

    if (connectionError || !connection) {
      return new Response(
        JSON.stringify({ error: "Nenhuma conexão ativa com o Mercado Livre. Conecte sua conta em Integrações." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = connection.access_token as string;
    const mlUserId = connection.external_account_id as string;

    // Se o token já expirou (ou está perto de expirar), tenta renovar antes
    // de seguir — evita falhar a publicação por causa de um token vencido.
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
        console.error("Falha ao renovar token antes de publicar:", refreshData);
        await supabase.from("log_integracao_ml").insert({
          contexto: "ml-publish-product",
          mensagem: "Falha ao renovar token antes de publicar",
          detalhes: refreshData,
        });
        return new Response(
          JSON.stringify({ error: "Sua conexão com o Mercado Livre expirou. Reconecte em Integrações." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 2.5 Checagem proativa: confirma se a conta está habilitada a vender
    // ANTES de gastar chamadas com descoberta de categoria/tipo de anúncio.
    // Evita desperdiçar tempo e retorna uma mensagem clara e acionável
    // (em vez do erro genérico "seller.unable_to_list" que a API devolveria
    // só na hora de criar o item).
    const sellerStatusResponse = await fetch(
      `https://api.mercadolibre.com/users/${mlUserId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const sellerStatusData = await sellerStatusResponse.json();

    if (sellerStatusResponse.ok && sellerStatusData?.status?.sell?.allow === false) {
      const codes: string[] = sellerStatusData?.status?.sell?.codes ?? [];
      console.error("Conta não habilitada para vender:", codes);
      await supabase.from("log_integracao_ml").insert({
        contexto: "ml-publish-product",
        mensagem: "Conta não habilitada para vender no Mercado Livre",
        detalhes: sellerStatusData?.status,
      });

      let mensagem =
        "Sua conta do Mercado Livre ainda não está habilitada para vender. Verifique as pendências na sua conta do Mercado Livre.";

      if (codes.includes("rejected_by_regulations")) {
        mensagem =
          "Sua conta do Mercado Livre ainda não está habilitada para vender por pendência fiscal. Acesse 'Faturador' nas configurações da sua conta do Mercado Livre — normalmente é necessário ter CNPJ (ex: MEI) e o emissor de nota fiscal ativo.";
      } else if (codes.includes("address_pending")) {
        mensagem =
          "Falta confirmar o endereço fiscal da sua conta do Mercado Livre. Acesse 'Seu perfil' nas configurações da conta para revisar.";
      }

      return new Response(
        JSON.stringify({ error: mensagem, ml_status_codes: codes }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Descobrir a categoria automaticamente a partir do título
    const domainResponse = await fetch(
      `https://api.mercadolibre.com/sites/MLB/domain_discovery/search?q=${encodeURIComponent(
        body.announcement_title
      )}&limit=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const domainData = await domainResponse.json();
    const categoryId = domainData?.[0]?.category_id;

    if (!domainResponse.ok || !categoryId) {
      console.error("Falha ao identificar categoria do Mercado Livre:", domainData);
      await supabase.from("log_integracao_ml").insert({
        contexto: "ml-publish-product",
        mensagem: "Falha ao identificar categoria do Mercado Livre",
        detalhes: domainData,
      });
      return new Response(
        JSON.stringify({
          error: "Não foi possível identificar automaticamente a categoria do Mercado Livre para este título.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Descobrir o tipo de anúncio disponível pra essa categoria/conta
    const listingTypesResponse = await fetch(
      `https://api.mercadolibre.com/users/${mlUserId}/available_listing_types?category_id=${categoryId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const listingTypesData = await listingTypesResponse.json();
    // A API do Mercado Livre devolve os tipos disponíveis no campo "available"
    // (não "listing_type_options" como eu tinha assumido inicialmente).
    // Preferimos "free" se estiver disponível (sem custo pro vendedor);
    // senão usamos o primeiro tipo pago da lista.
    const availableTypes = listingTypesData?.available ?? [];
    const freeType = availableTypes.find((t: { id: string }) => t.id === "free");
    const listingTypeId = freeType?.id ?? availableTypes?.[0]?.id;

    if (!listingTypesResponse.ok || !listingTypeId) {
      console.error("Falha ao identificar tipo de anúncio disponível:", listingTypesData);
      await supabase.from("log_integracao_ml").insert({
        contexto: "ml-publish-product",
        mensagem: "Falha ao identificar tipo de anúncio disponível",
        detalhes: listingTypesData,
      });
      return new Response(
        JSON.stringify({
          error: "Não foi possível identificar um tipo de anúncio disponível para essa categoria na sua conta.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4.5 Buscar atributos obrigatórios da categoria e preencher os que
    // sabemos resolver automaticamente.
    //
    // Existem dois tipos de atributo relevantes aqui:
    //   - Texto livre (value_type: "string" ou similar), como Marca/Modelo:
    //     aceitam qualquer valor em `value_name`.
    //   - Lista fechada (value_type: "list"), como "Tipo de produto":
    //     o Mercado Livre só aceita um `value_id` dentre as opções que a
    //     própria categoria permite — não aceita texto livre. Por isso
    //     buscamos as opções (`attr.values`) e tentamos achar uma opção
    //     "genérica" (Outro/Genérico/Não especificado); se não achar,
    //     caímos na primeira opção disponível como fallback.
    //
    // Isso resolve o erro "Essa categoria do Mercado Livre também exige
    // preencher: Tipo de produto" — antes, atributos de lista fora do mapa
    // fixo caíam direto em "não resolvido" e bloqueavam a publicação.
    const categoryAttributesResponse = await fetch(
      `https://api.mercadolibre.com/categories/${categoryId}/attributes`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const categoryAttributesData = await categoryAttributesResponse.json();

    const itemAttributes: { id: string; value_name?: string; value_id?: string }[] = [];
    const unresolvedRequiredAttributes: string[] = [];

    // Valores padrão para atributos de texto livre com id conhecido.
    const defaultTextAttributeValues: Record<string, string> = {
      BRAND: "Genérica",
      MODEL: "Não especificado",
    };

    // Palavras que indicam uma opção "genérica" dentro de uma lista de
    // valores permitidos (ex: nas opções de "Tipo de produto", "Gênero").
    const genericValuePattern = /gen[eé]ric|outro|n[aã]o especificado|other|unissex/i;

    if (categoryAttributesResponse.ok && Array.isArray(categoryAttributesData)) {
      for (const attr of categoryAttributesData) {
        const isRequired = attr?.tags?.required === true;
        if (!isRequired) continue;

        // Caso 1: atributo de texto livre com valor padrão já conhecido
        const defaultText = defaultTextAttributeValues[attr.id];
        if (defaultText) {
          itemAttributes.push({ id: attr.id, value_name: defaultText });
          continue;
        }

        // Caso 2: atributo com uma lista fechada de opções — precisa de
        // value_id, não texto livre. Detectamos isso pela PRESENÇA do array
        // `values`, não pelo campo `value_type`: o Mercado Livre pode
        // devolver `value_type: "string"` mesmo quando o atributo só aceita
        // um value_id de uma lista fechada (foi o caso real encontrado em
        // "Tipo de produto" na categoria de desempenadeiras).
        if (Array.isArray(attr.values) && attr.values.length > 0) {
          const genericOption = attr.values.find((v: any) => genericValuePattern.test(v?.name ?? ""));
          const chosen = genericOption ?? attr.values[0]; // fallback: primeira opção disponível

          itemAttributes.push({ id: attr.id, value_id: chosen.id, value_name: chosen.name });
          continue;
        }

        // Caso 3: não sabemos resolver este atributo automaticamente
        unresolvedRequiredAttributes.push(attr.name ?? attr.id);
      }
    }

    if (unresolvedRequiredAttributes.length > 0) {
      console.error(
        "Categoria exige atributos que não sabemos preencher automaticamente:",
        unresolvedRequiredAttributes
      );

      await supabase.from("log_integracao_ml").insert({
        contexto: "ml-publish-product",
        mensagem: "Categoria exige atributos obrigatórios não suportados automaticamente",
        detalhes: { categoryId, unresolvedRequiredAttributes },
      });
      return new Response(
        JSON.stringify({
          error: `Essa categoria do Mercado Livre também exige preencher: ${unresolvedRequiredAttributes.join(
            ", "
          )}. Ainda não conseguimos preencher esses campos automaticamente.`,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Criar o item no Mercado Livre
    // Título com prefixo de teste aplicado somente para role 'admin' —
    // clientes reais do FORNEXA publicam com o título normal, sem prefixo.
    const tituloFinal = isTestAdmin
      ? `${TEST_TITLE_PREFIX}${body.announcement_title}`.slice(0, 60)
      : body.announcement_title.slice(0, 60); // ML limita título a 60 caracteres

    // O Mercado Livre aceita no máximo 2 casas decimais para o Real (BRL).
    // Preços calculados por margem/porcentagem no front-end podem gerar
    // valores como 10.925 — arredondamos aqui como proteção final antes
    // de enviar, mesmo que o ideal seja também corrigir isso na origem.
    const precoFinal = Math.round(body.announcement_price * 100) / 100;

    const itemPayload = {
      title: tituloFinal,
      category_id: categoryId,
      price: precoFinal,
      currency_id: "BRL",
      available_quantity: 1,
      buying_mode: "buy_it_now",
      listing_type_id: listingTypeId,
      condition: "new",
      pictures: [{ source: body.announcement_image_url }],
      attributes: itemAttributes,
    };

    const createItemResponse = await fetch("https://api.mercadolibre.com/items", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(itemPayload),
    });

    const itemData = await createItemResponse.json();

    if (!createItemResponse.ok) {
      console.error("Falha ao criar item no Mercado Livre:", itemData);
      await supabase.from("log_integracao_ml").insert({
        contexto: "ml-publish-product",
        mensagem: "Falha ao criar item no Mercado Livre",
        detalhes: itemData,
      });
      const mensagemAmigavel = traduzirErroMercadoLivre(itemData);
      // Corrigido: itemData.cause pode vir como array VAZIO ([]), que não é
      // null/undefined — então "??" não pulava para itemData.message como
      // deveria, escondendo a mensagem de erro real. Agora checamos se o
      // array realmente tem conteúdo antes de usá-lo.
      const causaComConteudo = Array.isArray(itemData?.cause) && itemData.cause.length > 0
        ? itemData.cause
        : (itemData?.message ?? itemData);

      return new Response(
        JSON.stringify({
          error: mensagemAmigavel ?? "O Mercado Livre recusou a criação do anúncio.",
          detalhes: causaComConteudo,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mlItemId = itemData.id as string;

    // 6. Enviar a descrição (endpoint separado na API do Mercado Livre)
    if (body.announcement_description) {
      const descriptionResponse = await fetch(
        `https://api.mercadolibre.com/items/${mlItemId}/description`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ plain_text: body.announcement_description.slice(0, 50000) }),
        }
      );

      if (!descriptionResponse.ok) {
        // Não é crítico o bastante pra reverter o anúncio já criado — só
        // registramos o problema para investigar depois.
        const descriptionError = await descriptionResponse.json().catch(() => null);
        await supabase.from("log_integracao_ml").insert({
          contexto: "ml-publish-product",
          mensagem: `Anúncio ${mlItemId} criado, mas falhou ao salvar descrição`,
          detalhes: descriptionError,
        });
      }
    }

    // 7. Salvar o produto publicado em user_products
    const { data: savedProduct, error: saveError } = await supabase
      .from("user_products")
      .insert({
        user_id: vendedorId,
        catalog_product_id: body.catalog_product_id ?? null,
        supplier_id: body.supplier_id,
        name: body.name,
        image_url: body.image_url,
        supplier_price: body.supplier_price,
        sale_price: body.sale_price,
        margin: body.margin,
        status: "active",
        marketplace: "Mercado Livre",
        announcement_title: tituloFinal,
        announcement_description: body.announcement_description,
        announcement_category: body.announcement_category ?? categoryId,
        announcement_price: precoFinal,
        announcement_image_url: body.announcement_image_url,
        published_at: new Date().toISOString(),
        ml_item_id: mlItemId,
      })
      .select("*")
      .single();

    if (saveError) {
      // O anúncio JÁ FOI criado no Mercado Livre nesse ponto — não dá mais
      // pra "cancelar" silenciosamente. Registramos bem o erro pra permitir
      // reconciliar manualmente depois, mas avisamos o vendedor do estado
      // real (anúncio no ar, mas não sincronizado no FORNEXA ainda).
      await supabase.from("log_integracao_ml").insert({
        contexto: "ml-publish-product",
        mensagem: `Anúncio ${mlItemId} criado no ML, mas falhou ao salvar em user_products`,
        detalhes: saveError,
      });
      return new Response(
        JSON.stringify({
          error: "O anúncio foi publicado no Mercado Livre, mas houve uma falha ao salvar no FORNEXA. Contate o suporte informando o item " + mlItemId,
          ml_item_id: mlItemId,
          permalink: itemData.permalink,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        ml_item_id: mlItemId,
        permalink: itemData.permalink,
        product: savedProduct,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erro em ml-publish-product:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno ao publicar anúncio" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
