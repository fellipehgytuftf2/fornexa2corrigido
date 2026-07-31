// ============================================================================
// importar-catalogo-por-link
//
// Lê o catálogo de um fornecedor a partir do site dele.
//
// COMO FUNCIONA
// Busca a página informada, junta os links internos, abre cada um e procura
// JSON-LD com "@type": "Product". Devolve a lista para o admin conferir antes
// de importar.
//
// POR QUE JSON-LD
// Não é convenção de uma loja: é o padrão que o Google exige para mostrar
// preço no resultado de busca. Shopify, Nuvemshop, Loja Integrada,
// WooCommerce, VTEX e sites sob medida publicam. Ler o padrão faz o importador
// servir para fornecedor futuro sem código novo; ler o HTML faria um raspador
// por fornecedor.
//
// O QUE ELA NÃO FAZ
// Adivinhar. Sem dados estruturados, devolve a lista vazia com um aviso claro
// em vez de montar produto a partir de texto solto — catálogo inventado só
// seria descoberto depois de importado.
//
// Restrita a admin: busca URL arbitrária a partir do servidor.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chavePublica, chaveSecreta, urlDoProjeto } from '../_shared/chaves.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Teto de páginas por importação, para não estourar o tempo da função. */
const MAX_PAGINAS = 60;

/** Quantas páginas busca ao mesmo tempo. Baixo de propósito: é site de terceiro. */
const SIMULTANEAS = 5;

const TIMEOUT_POR_PAGINA = 12000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface ProdutoLido {
  name: string;
  description: string;
  category: string;
  supplier_price: number;
  stock: number;
  image_url: string;
  images: string[];
  sku: string;
  origem: string;
  disponivel: boolean;
}

async function buscar(url: string): Promise<string | null> {
  try {
    const resposta = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_POR_PAGINA),
      headers: {
        // Alguns sites devolvem página diferente para cliente sem navegador.
        'User-Agent': 'Mozilla/5.0 (compatible; FornexaBot/1.0)',
        Accept: 'text/html',
      },
    });

    if (!resposta.ok) {
      return null;
    }

    const tipo = resposta.headers.get('content-type') || '';

    if (!tipo.includes('html')) {
      return null;
    }

    return await resposta.text();
  } catch {
    return null;
  }
}

/** Links do mesmo domínio, absolutos e sem âncora nem repetição. */
function coletarLinks(html: string, base: string): string[] {
  const origem = new URL(base);
  const encontrados = new Set<string>();

  for (const achado of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const bruto = achado[1];

    if (!bruto || bruto.startsWith('#') || bruto.startsWith('mailto:') || bruto.startsWith('tel:')) {
      continue;
    }

    try {
      const url = new URL(bruto, base);

      if (url.hostname !== origem.hostname) {
        continue;
      }

      url.hash = '';
      encontrados.add(url.toString());
    } catch {
      // href malformado: ignora
    }
  }

  return [...encontrados];
}

/** Todos os blocos JSON-LD da página, já convertidos em objeto. */
function lerBlocosJsonLd(html: string): unknown[] {
  const blocos: unknown[] = [];

  const padrao = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const achado of html.matchAll(padrao)) {
    try {
      const conteudo = JSON.parse(achado[1].trim());

      // Alguns sites embrulham tudo em @graph ou num array.
      if (Array.isArray(conteudo)) {
        blocos.push(...conteudo);
      } else if (conteudo && typeof conteudo === 'object' && '@graph' in conteudo) {
        const grafo = (conteudo as { '@graph': unknown }) ['@graph'];
        blocos.push(...(Array.isArray(grafo) ? grafo : [grafo]));
      } else {
        blocos.push(conteudo);
      }
    } catch {
      // JSON quebrado no site de terceiro: ignora o bloco
    }
  }

  return blocos;
}

const ehTipo = (bloco: unknown, tipo: string): boolean => {
  const valor = (bloco as { '@type'?: unknown })?.['@type'];

  return Array.isArray(valor) ? valor.includes(tipo) : valor === tipo;
};

/** Preço pode vir em offers, num array de offers, ou dentro de priceSpecification. */
function lerPreco(offers: unknown): { preco: number; disponivel: boolean } {
  const primeira = Array.isArray(offers) ? offers[0] : offers;
  const oferta = primeira as Record<string, unknown> | undefined;

  const bruto =
    oferta?.price ??
    (oferta?.priceSpecification as Record<string, unknown> | undefined)?.price ??
    oferta?.lowPrice;

  const preco = Number(String(bruto ?? '').replace(',', '.'));

  const disponibilidade = String(oferta?.availability ?? '').toLowerCase();
  const disponivel = !disponibilidade || disponibilidade.includes('instock');

  return { preco: Number.isFinite(preco) ? preco : 0, disponivel };
}

function lerImagens(valor: unknown): string[] {
  const bruto = Array.isArray(valor) ? valor : [valor];

  return bruto
    .map((item) => {
      if (typeof item === 'string') return item;
      return (item as { url?: string })?.url ?? '';
    })
    .map((url) => url.replace(/\\\//g, '/').trim())
    .filter((url) => url.startsWith('http'));
}

/**
 * Termos que aparecem na trilha mas não são categoria de verdade. Sem esta
 * lista, uma loja com trilha "Início > Produtos > nome" classificaria o
 * catálogo inteiro como "Produtos", que não ajuda ninguém a filtrar.
 */
const TERMOS_GENERICOS = new Set([
  'inicio',
  'home',
  'produtos',
  'produto',
  'loja',
  'catalogo',
  'todos',
  'todos os produtos',
]);

const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/**
 * Categoria: o campo próprio quando existe, senão o item mais específico da
 * trilha de navegação antes do nome do produto.
 */
function lerCategoria(produto: Record<string, unknown>, blocos: unknown[]): string {
  const propria = produto.category;

  if (typeof propria === 'string' && propria.trim()) {
    return propria.trim();
  }

  const trilha = blocos.find((bloco) => ehTipo(bloco, 'BreadcrumbList')) as
    | { itemListElement?: { name?: string }[] }
    | undefined;

  // Do mais específico para o mais geral, pulando o último (o produto).
  const itens = (trilha?.itemListElement ?? []).slice(0, -1).reverse();

  for (const item of itens) {
    const nome = String(item?.name ?? '').trim();

    if (nome && !TERMOS_GENERICOS.has(semAcento(nome))) {
      return nome;
    }
  }

  return 'Geral';
}

function extrairProduto(html: string, url: string): ProdutoLido | null {
  const blocos = lerBlocosJsonLd(html);
  const bruto = blocos.find((bloco) => ehTipo(bloco, 'Product')) as
    | Record<string, unknown>
    | undefined;

  if (!bruto) {
    return null;
  }

  const nome = String(bruto.name ?? '').trim();

  if (!nome) {
    return null;
  }

  const { preco, disponivel } = lerPreco(bruto.offers);
  const imagens = lerImagens(bruto.image);

  return {
    name: nome,
    description: String(bruto.description ?? '').trim() || nome,
    category: lerCategoria(bruto, blocos),
    supplier_price: preco,
    // O padrão não traz quantidade; entra zerado para o admin ajustar.
    stock: 0,
    image_url: imagens[0] ?? '',
    images: imagens.slice(1),
    sku: String(bruto.sku ?? '').trim(),
    origem: url,
    disponivel,
  };
}

/** Executa em lotes, para não disparar dezenas de requisições de uma vez. */
async function emLotes<T, R>(itens: T[], tamanho: number, tarefa: (item: T) => Promise<R>) {
  const resultados: R[] = [];

  for (let i = 0; i < itens.length; i += tamanho) {
    const lote = itens.slice(i, i + tamanho);
    resultados.push(...(await Promise.all(lote.map(tarefa))));
  }

  return resultados;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = urlDoProjeto();
  const serviceRoleKey = chaveSecreta();
  const anonKey = chavePublica();

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'Função mal configurada no servidor.' }, 500);
  }

  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();

  if (!caller) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: perfil } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();

  if (perfil?.role !== 'admin') {
    return json({ error: 'Apenas administradores podem importar catálogo.' }, 403);
  }

  let payload: { url?: string };

  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const enderecoBruto = payload.url?.trim();

  if (!enderecoBruto) {
    return json({ error: 'Informe o endereço do site do fornecedor.' }, 400);
  }

  let endereco: string;

  try {
    const url = new URL(
      enderecoBruto.startsWith('http') ? enderecoBruto : `https://${enderecoBruto}`
    );

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('protocolo');
    }

    endereco = url.toString();
  } catch {
    return json({ error: 'Endereço inválido. Exemplo: https://loja.com.br' }, 400);
  }

  const inicial = await buscar(endereco);

  if (!inicial) {
    return json(
      { error: 'Não foi possível abrir esse endereço. Confira o link e tente de novo.' },
      422
    );
  }

  // A própria página pode ser um produto — é o caso de colar a URL de um item.
  const daPagina = extrairProduto(inicial, endereco);

  const links = coletarLinks(inicial, endereco).slice(0, MAX_PAGINAS);

  const lidos = await emLotes(links, SIMULTANEAS, async (link) => {
    const html = await buscar(link);
    return html ? extrairProduto(html, link) : null;
  });

  const encontrados = [daPagina, ...lidos].filter(Boolean) as ProdutoLido[];

  // O mesmo produto costuma aparecer por mais de um caminho.
  const porChave = new Map<string, ProdutoLido>();

  for (const produto of encontrados) {
    porChave.set(produto.sku || produto.name.toLowerCase(), produto);
  }

  const produtos = [...porChave.values()].filter((produto) => produto.supplier_price > 0);

  const semPreco = porChave.size - produtos.length;

  return json({
    produtos,
    paginas_lidas: links.length + 1,
    sem_preco: semPreco,
    aviso:
      produtos.length === 0
        ? 'Nenhum produto com dados estruturados foi encontrado. O site pode não publicar esse padrão, ou o catálogo pode estar em outro endereço do mesmo domínio.'
        : null,
  });
});
