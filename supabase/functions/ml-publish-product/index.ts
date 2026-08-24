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

/**
 * Deixa a descrição no formato que o Mercado Livre chama de texto puro.
 *
 * Ele recusa com "The description must be in plain text" quando encontra
 * marcação. Como a descrição do catálogo pode ter vindo do site do fornecedor,
 * onde HTML é comum, a limpeza acontece aqui em vez de confiar na origem.
 */
function limparParaTextoPuro(texto: string): string {
  return texto
    // <br> e </p> viram quebra de linha antes de as tags sumirem, senão o
    // texto ficaria todo grudado numa linha só.
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    // Entidades mais comuns. O resto vira espaço em vez de ficar como "&nbsp;".
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, " ")
    // Caracteres de controle passam despercebidos e quebram validação.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 50000);
}

/**
 * Monta a lista de fotos do anúncio: a principal primeiro, depois as
 * adicionais, sem repetir e sem entradas vazias.
 *
 * O Mercado Livre aceita no máximo 10 por anúncio; acima disso recusa a
 * publicação inteira, então cortamos aqui em vez de perder o anúncio.
 */
function montarFotos(body: PublishBody): { source: string }[] {
  const urls = [body.announcement_image_url, ...(body.announcement_image_urls ?? [])]
    .map((url) => (url || "").trim())
    .filter((url) => url.length > 0);

  const semRepetir = [...new Set(urls)].slice(0, 10);

  return semRepetir.map((source) => ({ source }));
}

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
  /**
   * Fotos adicionais, na ordem. A principal continua em
   * announcement_image_url e não se repete aqui. Opcional: anúncio antigo e
   * produto com uma foto só seguem funcionando sem este campo.
   */
  announcement_image_urls?: string[];
  /** Unidades declaradas no anúncio. Ausente = 10, o padrão da tela. */
  announcement_quantity?: number;
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
    return "Sua conta do Mercado Livre ainda não está habilitada para vender. Costuma ser pendência de cadastro: endereço fiscal incompleto, documento não validado ou dados do Mercado Pago faltando. Abra 'Minha conta' no Mercado Livre e resolva o que ele apontar — pessoa física com CPF pode vender, então nem sempre é caso de abrir CNPJ.";
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

  // Vem sem `cause`, só com `error` no corpo — por isso é testado pela mensagem
  // e pelo campo de erro, e não pelos códigos de causa.
  const erro = String(itemData?.error ?? "");

  if (
    erro.includes("listing_type.temporarily_unavailable") ||
    message.toLowerCase().includes("listing type is temporarily unavailable")
  ) {
    return (
      'O Mercado Livre respondeu que o anúncio grátis está indisponível no momento e pediu para tentar de novo. ' +
      'Aguarde alguns minutos e publique outra vez. ' +
      'Se o erro insistir, é provável que a cota de anúncios grátis da sua conta tenha acabado — nesse caso só dá para publicar como anúncio pago, que tem comissão por venda.'
    );
  }

  if (causeCodes.includes("item.available_quantity")) {
    return "O Mercado Livre não aceitou a quantidade de unidades deste anúncio. Anúncio grátis aceita apenas 1 unidade.";
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

      // Uma pendência de cada vez confunde: a conta costuma ter mais de uma,
      // e resolver só a primeira não destrava nada. A mensagem lista todas e
      // manda o vendedor para a tela de Integrações, onde elas aparecem com
      // o que fazer e onde fazer.
      const tarefas: string[] = [];

      if (codes.includes("address_pending")) {
        tarefas.push("completar o endereço da conta, com CEP, número e complemento");
      }

      if (codes.includes("rejected_by_regulations")) {
        tarefas.push(
          "resolver o que o Mercado Livre aponta em 'Minha conta' — costuma ser documento não validado ou verificação de identidade pendente"
        );
      }

      const mensagem =
        tarefas.length > 0
          ? "O Mercado Livre ainda não liberou esta conta para vender. Falta " +
            tarefas.join("; e ") +
            ". Pessoa física com CPF pode vender: só abra CNPJ se o próprio Mercado Livre pedir. Em Integrações, no FORNEXA, a lista completa aparece com o passo a passo."
          : "O Mercado Livre ainda não liberou esta conta para vender. Abra Integrações no FORNEXA para ver a lista do que falta resolver na sua conta.";

      return new Response(
        JSON.stringify({ error: mensagem, ml_status_codes: codes }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Descobrir a categoria automaticamente
    //
    // A busca usa o NOME do produto, não o título do anúncio. O título é
    // cortado em 60 caracteres, que é o limite do Mercado Livre, e o corte cai
    // no meio de uma palavra — "...100 Mm Nf P" não casa com categoria
    // nenhuma. O nome vem inteiro e é o que descreve o produto de verdade.
    const termoDeBusca = (body.name || body.announcement_title || "").trim();

    const buscarCategoria = (termo: string) =>
      fetch(
        `https://api.mercadolibre.com/sites/MLB/domain_discovery/search?q=${encodeURIComponent(
          termo
        )}&limit=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

    let domainResponse = await buscarCategoria(termoDeBusca);
    let domainData = await domainResponse.json();
    let categoryId = domainData?.[0]?.category_id;

    // Segunda tentativa com as primeiras palavras: nome muito específico às
    // vezes não casa, enquanto "Caixa De Passagem De Agua" casa.
    if (!categoryId) {
      const termoCurto = termoDeBusca.split(/\s+/).slice(0, 5).join(" ");

      if (termoCurto && termoCurto !== termoDeBusca) {
        domainResponse = await buscarCategoria(termoCurto);
        domainData = await domainResponse.json();
        categoryId = domainData?.[0]?.category_id;
      }
    }

    if (!categoryId) {
      console.error("Falha ao identificar categoria do Mercado Livre:", domainData);
      await supabase.from("log_integracao_ml").insert({
        contexto: "ml-publish-product",
        mensagem: "Falha ao identificar categoria do Mercado Livre",
        detalhes: { resposta: domainData, termo_buscado: termoDeBusca },
      });
      return new Response(
        JSON.stringify({
          error:
            "Não foi possível identificar automaticamente a categoria do Mercado Livre para este produto. Tente ajustar o nome do produto no catálogo para algo mais comum, como \"Caixa de Passagem PVC\".",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3.5 Conferir as regras da categoria ANTES de tentar criar o item.
    //
    // Cada categoria do Mercado Livre publica preço mínimo, preço máximo e se
    // aceita anúncio. Sem esta checagem o erro só aparecia na criação, como
    // "item.price.invalid", e chegava ao vendedor como "o Mercado Livre
    // recusou a criação do anúncio" — sem dizer que o problema era o preço nem
    // qual o limite.
    //
    // O endpoint é público e não gasta o token do vendedor.
    const categoriaResponse = await fetch(
      `https://api.mercadolibre.com/categories/${categoryId}`
    );

    const categoriaData = await categoriaResponse.json().catch(() => null);
    const regras = categoriaData?.settings ?? {};

    if (categoriaResponse.ok && regras.listing_allowed === false) {
      await supabase.from("log_integracao_ml").insert({
        contexto: "ml-publish-product",
        mensagem: "Categoria não aceita anúncios",
        detalhes: { categoryId, nome: categoriaData?.name, regras },
      });

      return new Response(
        JSON.stringify({
          error:
            `A categoria "${categoriaData?.name ?? categoryId}" que o Mercado Livre escolheu para este produto não aceita anúncios novos. Ajuste o nome do produto no catálogo para algo mais específico, para que ele caia numa categoria mais precisa.`,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const precoPretendido = Math.round((body.announcement_price ?? 0) * 100) / 100;
    const minimo = Number(regras.minimum_price ?? 0);
    const maximo = regras.maximum_price === null ? null : Number(regras.maximum_price);

    const emReais = (valor: number) =>
      valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    if (categoriaResponse.ok && minimo > 0 && precoPretendido < minimo) {
      await supabase.from("log_integracao_ml").insert({
        contexto: "ml-publish-product",
        mensagem: "Preço abaixo do mínimo da categoria",
        detalhes: { categoryId, nome: categoriaData?.name, minimo, precoPretendido },
      });

      return new Response(
        JSON.stringify({
          error:
            `O Mercado Livre exige preço mínimo de ${emReais(minimo)} na categoria "${categoriaData?.name ?? categoryId}", e seu anúncio está em ${emReais(precoPretendido)}. Aumente a margem até passar desse valor.`,
          preco_minimo: minimo,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (categoriaResponse.ok && maximo !== null && maximo > 0 && precoPretendido > maximo) {
      await supabase.from("log_integracao_ml").insert({
        contexto: "ml-publish-product",
        mensagem: "Preço acima do máximo da categoria",
        detalhes: { categoryId, nome: categoriaData?.name, maximo, precoPretendido },
      });

      return new Response(
        JSON.stringify({
          error:
            `O Mercado Livre não aceita preço acima de ${emReais(maximo)} na categoria "${categoriaData?.name ?? categoryId}", e seu anúncio está em ${emReais(precoPretendido)}. Reduza a margem.`,
          preco_maximo: maximo,
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

    // Quantidade do anúncio.
    //
    // O ANÚNCIO GRÁTIS ACEITA UMA UNIDADE E SÓ. O Mercado Livre recusa a
    // publicação inteira com 400 e a mensagem:
    //
    //   "Available quantity max. value is 1 for category MLB1893,
    //    condition new and listing type free"
    //
    // Como a função prefere o tipo grátis sempre que ele existe — para não
    // cobrar do vendedor —, na prática quase todo anúncio daqui cai nesse
    // limite. Subir a quantidade sem olhar o tipo derrubou a publicação de
    // todos os produtos.
    //
    // Em anúncio pago o limite não existe, e aí vale usar mais de uma unidade:
    // com 1, o anúncio pausa por falta de estoque na primeira venda e some da
    // busca até alguém repor na mão. Nada disso tem a ver com o estoque do
    // fornecedor, que o FORNEXA não conhece — é só por quantas vendas o
    // anúncio se sustenta.
    const ehAnuncioGratis = listingTypeId === "free";

    const quantidadeDoAnuncio = ehAnuncioGratis
      ? 1
      : Math.min(999, Math.max(1, Math.floor(Number(body.announcement_quantity) || 10)));

    const itemPayload = {
      title: tituloFinal,
      category_id: categoryId,
      price: precoFinal,
      currency_id: "BRL",
      available_quantity: quantidadeDoAnuncio,
      buying_mode: "buy_it_now",
      listing_type_id: listingTypeId,
      condition: "new",
      pictures: montarFotos(body),
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
      const descricao = limparParaTextoPuro(body.announcement_description);

      // O Mercado Livre recusa POST quando o anúncio já nasce com uma
      // descrição, e nesse caso o caminho é PUT. Como não dá para saber de
      // fora qual é o caso, tenta POST e cai para PUT.
      //
      // api_version=2 em ambos: sem ele o erro vem genérico, e foi
      // justamente isso que dificultou descobrir a causa da primeira vez.
      const enviarDescricao = (metodo: "POST" | "PUT") =>
        fetch(
          `https://api.mercadolibre.com/items/${mlItemId}/description?api_version=2`,
          {
            method: metodo,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ plain_text: descricao }),
          }
        );

      let descriptionResponse = await enviarDescricao("POST");
      let metodoUsado = "POST";

      if (!descriptionResponse.ok) {
        descriptionResponse = await enviarDescricao("PUT");
        metodoUsado = "PUT";
      }

      if (!descriptionResponse.ok) {
        // Não é crítico o bastante pra reverter o anúncio já criado — só
        // registramos o problema para investigar depois.
        const descriptionError = await descriptionResponse.json().catch(() => null);
        await supabase.from("log_integracao_ml").insert({
          contexto: "ml-publish-product",
          mensagem: `Anúncio ${mlItemId} criado, mas falhou ao salvar descrição`,
          detalhes: {
            erro: descriptionError,
            metodo_final: metodoUsado,
            tamanho_enviado: descricao.length,
            // Os primeiros caracteres ajudam a identificar conteúdo recusado
            // sem despejar a descrição inteira no log.
            inicio_do_texto: descricao.slice(0, 120),
          },
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
