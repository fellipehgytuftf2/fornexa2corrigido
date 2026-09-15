// Caminho 1 (preferido): loga na loja e usa a API interna dela para pegar
// TODOS os produtos com o preco real de dropship.
//
// O navegador (puppeteer-core + @sparticuz/chromium, que roda em ambiente
// serverless tipo Vercel) e usado SOMENTE para o login e pegar o cookie de
// sessao. A paginacao dos produtos e feita com fetch() puro, em paralelo,
// pra caber no tempo limite de uma funcao serverless.

import { htmlParaTexto, extrairCamposTexto, extrairDescricaoBreve, normalizarPeso } from "./parse.js";
import { mapComLimite } from "./concurrency.js";

const URL_LOJA = "https://msdigitaldrop.com.br/c/dropshippingsp";
// Testado localmente: a loja parece serializar requisicoes da mesma sessao
// (provavel lock de sessao do CodeIgniter no servidor) -- mais concorrencia
// nao acelera e chegou a piorar. Mantido baixo so para nao desperdicar
// conexoes; o gargalo real e no servidor, nao aqui.
const CONCORRENCIA_PAGINACAO = 4;
const MAX_PAGINAS = 200;

async function clicarPorTexto(page, seletorTag, texto, timeout = 15000) {
  await page.waitForFunction(
    (tag, alvo) => {
      const els = Array.from(document.querySelectorAll(tag));
      return els.some((el) => el.textContent && el.textContent.includes(alvo));
    },
    { timeout },
    seletorTag,
    texto
  );
  await page.evaluate(
    (tag, alvo) => {
      const els = Array.from(document.querySelectorAll(tag));
      const el = els.find((e) => e.textContent && e.textContent.includes(alvo));
      if (el) el.click();
    },
    seletorTag,
    texto
  );
}

async function lancarNavegador() {
  // 'puppeteer-core' + '@sparticuz/chromium' so sao importados aqui dentro
  // (nao no topo do arquivo) para o pacote pesado do chromium nunca ser
  // carregado nos caminhos que nao precisam de navegador.
  const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
    import("puppeteer-core"),
    import("@sparticuz/chromium"),
  ]);
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
}

async function logarEObterCookies(email, senha) {
  const browser = await lancarNavegador();
  try {
    const page = await browser.newPage();
    // forca layout desktop -- em viewport estreito o site troca pro menu
    // mobile e os links de login mudam de lugar
    await page.setViewport({ width: 1366, height: 900 });
    await page.goto(URL_LOJA, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 800));

    try {
      await clicarPorTexto(page, "button", "Compreendo!", 4000);
    } catch {
      // aviso de cookies pode nao aparecer -- nao e um erro
    }

    // "Fazer login" as vezes nao aparece como link separado (varia com o layout) --
    // "Minha Conta" e o ponto de entrada confiavel e leva ao mesmo fluxo de login
    // quando a sessao nao esta autenticada.
    try {
      await clicarPorTexto(page, "a", "Fazer login", 6000);
    } catch {
      await clicarPorTexto(page, "a", "Minha Conta");
    }
    await new Promise((r) => setTimeout(r, 1200));

    await clicarPorTexto(page, "button", "E-mail");
    await new Promise((r) => setTimeout(r, 1200));

    const campoEmail = await page.waitForSelector('input[type="email"], input[placeholder*="mail" i]', {
      timeout: 10000,
    });
    await campoEmail.type(email, { delay: 15 });

    await clicarPorTexto(page, "button", "Continuar com e-mail");
    await new Promise((r) => setTimeout(r, 1200));

    const campoSenha = await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await campoSenha.type(senha, { delay: 15 });
    await campoSenha.press("Enter");
    await new Promise((r) => setTimeout(r, 2000));

    const cookiesBrutos = await page.cookies();
    const cookies = {};
    for (const c of cookiesBrutos) {
      if (c.domain.includes("msdigitaldrop")) cookies[c.name] = c.value;
    }
    if (!cookies.ci_session) {
      throw new Error("login nao confirmado: cookie de sessao (ci_session) nao encontrado");
    }
    return cookies;
  } finally {
    await browser.close();
  }
}

function cabecalhoCookie(cookies) {
  return Object.entries(cookies)
    .map(([nome, valor]) => `${nome}=${valor}`)
    .join("; ");
}

async function descobrirTokenDaLoja(headersCookie) {
  const resposta = await fetch(URL_LOJA, { headers: { Cookie: headersCookie, "User-Agent": "Mozilla/5.0" } });
  const texto = await resposta.text();
  const m = texto.match(/carregar_produtos\/\d+\/[^/]+\/(\d+)/);
  if (!m) throw new Error("token interno da loja nao encontrado na pagina inicial");
  return m[1];
}

async function buscarPaginaDeProdutos(pagina, token, headersCookie) {
  const url = `${URL_LOJA}/carregar_produtos/${pagina}/todas/${token}`;
  const resposta = await fetch(url, {
    method: "POST",
    headers: { Cookie: headersCookie, "User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest" },
  });
  if (!resposta.ok) return [];
  const dados = await resposta.json();
  return dados.produtos || [];
}

function transformarProdutoLogado(bruto) {
  const produtoId = bruto.id != null ? String(bruto.id) : null;

  let precoDropship = null;
  if (typeof bruto.preco === "number") {
    precoDropship = `R$ ${bruto.preco.toFixed(2).replace(".", ",")}`;
  }

  const descricaoTexto = htmlParaTexto(bruto.descricao);
  const campos = extrairCamposTexto(descricaoTexto);

  const { altura, largura, comprimento } = bruto;
  let dimensoes = altura && largura && comprimento ? `${altura}x${largura}x${comprimento} cm` : null;
  dimensoes = dimensoes || campos.dimensoes;

  let peso = bruto.peso ? normalizarPeso(`${bruto.peso} g`) : null;
  peso = peso || campos.peso;

  const codigoBarras = bruto.cod_barras || campos.codigo_barras || null;
  const descricaoBreve = extrairDescricaoBreve(campos.descricao || descricaoTexto);

  // a API devolve uma lista de caminhos relativos ("produtos/xxx.webp"); monta URLs
  // completas via o CDN de imagens da FacilZap, ja pedindo um tamanho de miniatura
  const imagens = (bruto.imagens || []).map(
    (caminho) => `https://arquivos-cdn.facilzap.app.br/${caminho}?width=600&height=600&quality=85&format=webp`
  );

  // total_estoque e um numero direto na API -- usado pra manter o estoque no Supabase
  // em dia. Quando nao vem (undefined/null), fica null e quem grava no banco sabe
  // que deve deixar o valor que ja estava la, em vez de zerar por engano.
  const estoque = typeof bruto.total_estoque === "number" ? bruto.total_estoque : null;

  return {
    id: produtoId,
    nome: bruto.nome || null,
    preco: null,
    preco_dropship: precoDropship,
    categoria: bruto.categoria_nome || null,
    marca: campos.marca,
    modelo: campos.modelo,
    codigo_barras: codigoBarras,
    dimensoes,
    peso,
    descricao: descricaoBreve,
    imagem: imagens[0] || null,
    imagens,
    estoque,
    url: produtoId ? `${URL_LOJA}/produto/${produtoId}` : null,
    fonte: "login",
  };
}

// Ponto de entrada do caminho 1. Levanta um erro se qualquer etapa falhar
// (login, token, ou nenhum produto encontrado) -- quem chama decide o que
// fazer nesse caso (cair para o caminho 2).
export async function extrairViaLogin(email, senha) {
  if (!email || !senha) {
    throw new Error("MSDIGITAL_EMAIL / MSDIGITAL_SENHA nao configurados");
  }
  const cookies = await logarEObterCookies(email, senha);
  const headersCookie = cabecalhoCookie(cookies);
  const token = await descobrirTokenDaLoja(headersCookie);

  const produtosBrutos = [];
  let pagina = 1;
  while (pagina <= MAX_PAGINAS) {
    const loteDePaginasParaTestar = Array.from({ length: CONCORRENCIA_PAGINACAO }, (_, i) => pagina + i);
    const lotes = await mapComLimite(loteDePaginasParaTestar, CONCORRENCIA_PAGINACAO, (p) =>
      buscarPaginaDeProdutos(p, token, headersCookie)
    );
    let algumVazio = false;
    for (const lote of lotes) {
      if (lote.length === 0) {
        algumVazio = true;
        break;
      }
      produtosBrutos.push(...lote);
    }
    pagina += CONCORRENCIA_PAGINACAO;
    if (algumVazio) break;
  }

  if (produtosBrutos.length === 0) {
    throw new Error("login funcionou mas nenhum produto foi retornado pela API interna");
  }

  return produtosBrutos.map(transformarProdutoLogado);
}
