// Caminho 2 (sem login): le o feed publico em markdown (catalogo.md) da loja
// dropshippingsp. Nao tem preco de dropship (o feed publico nao expoe), mas
// preenche preco_varejo a partir do catalogo publico da loja de varejo.
//
// Caminho 3 (ultimo recurso): descobre a URL do catalogo a partir do
// llms.txt do site, caso os links padrao mudem no futuro.

import { extrairCamposTexto, extrairPreco, extrairDescricaoBreve } from "./parse.js";
import { mapComLimite } from "./concurrency.js";

const BASE_URL = "https://msdigitaldrop.com.br/c/dropshippingsp";
const CATALOGO_URL = `${BASE_URL}/catalogo.md`;
const CATALOGO_URL_VAREJO = "https://msdigitaldrop.com.br/c/varejosp/catalogo.md";
const LLMS_TXT_URL = "https://msdigitaldrop.com.br/llms.txt";

const CONCORRENCIA_COMPLEMENTO = 25;
// 'imagem' nunca vem na linha do catalogo.md (so a pagina do produto tem foto) --
// por isso todo produto acaba passando pela pagina individual nesse caminho tambem.
const CAMPOS_ESSENCIAIS = ["marca", "modelo", "codigo_barras", "dimensoes", "peso", "descricao", "imagem"];

async function buscarTexto(url) {
  const resposta = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; CatalogoExtractor/1.0)" } });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} ao buscar ${url}`);
  return resposta.text();
}

function extrairSecao(texto, titulo) {
  const padrao = new RegExp(`##\\s*${titulo}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  const m = texto.match(padrao);
  return m ? m[1].trim() : "";
}

function parsearLinhaProduto(linha) {
  const m = linha
    .trim()
    .match(/^-\s*\[(.*?)\]\(([^)]*)\):\s*(.*)$/);
  if (!m) return null;
  const [, nome, url, resto] = m;
  const idx = resto.indexOf(" - ");
  const categoria = idx === -1 ? resto : resto.slice(0, idx);
  const camposTexto = idx === -1 ? "" : resto.slice(idx + 3);
  return { nome: nome.trim(), url: url.trim(), categoria: categoria.trim(), camposTexto };
}

function extrairImagens(texto) {
  const secao = extrairSecao(texto, "Imagens");
  if (!secao) return [];
  return Array.from(secao.matchAll(/https?:\/\/\S+/g)).map((m) => m[0]);
}

// A linha "**Disponibilidade:**" da pagina do produto, nas tres formas que a MS
// Digital usa hoje (varredura dos 870 produtos em 21/09/2026):
//
//   483x  "Em estoque (40 unidades)"   -> quantidade exata
//   376x  "Indisponivel no momento"    -> acabou; a loja NAO tira do catalogo
//    11x  "Disponivel"                 -> tem, mas nao diz quanto
//
// Antes, so a primeira forma era lida e as outras duas viravam null. Como quem
// grava so mexe em 'stock' quando vem numero, os 387 produtos sem numero
// ficavam com a quantidade da ultima vez que TIVERAM estoque -- e ainda eram
// marcados como disponiveis, porque apareceram na coleta do dia. Dava no
// vendedor anunciando o que o fornecedor nao tem.
//
// Devolve os dois lados separados de proposito:
//   estoque    numero, ou null quando a loja nao diz a quantidade
//   disponivel true/false, ou null quando a loja nao diz nada
// Null nos dois e "nao perguntei" -- quem grava mantem o que ja estava no banco.
function extrairDisponibilidade(texto) {
  const m = texto.match(/\*\*Disponibilidade:\*\*\s*(.*)/i);
  if (!m) return { estoque: null, disponivel: null };

  const linha = m[1].trim();

  const quantidade = linha.match(/\((\d+)\s*unidades?\)/i);
  if (quantidade) {
    const n = parseInt(quantidade[1], 10);
    return { estoque: n, disponivel: n > 0 };
  }

  // Sem acento e sem caixa: o site escreve "Indisponivel", mas nao custa
  // aceitar "indisponível" se um dia arrumarem o texto.
  const normal = linha
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/indisponiv|esgotad|sem estoque|fora de estoque/.test(normal)) {
    return { estoque: 0, disponivel: false };
  }

  if (/disponiv|em estoque/.test(normal)) {
    // Diz que tem, mas nao quanto. Nao inventa numero: so afirma que existe.
    return { estoque: null, disponivel: true };
  }

  return { estoque: null, disponivel: null };
}

async function buscarComplemento(produtoId) {
  try {
    const texto = await buscarTexto(`${BASE_URL}/produto/${produtoId}.md`);
    const secaoDescricao = extrairSecao(texto, "Descricao");
    const campos = secaoDescricao ? extrairCamposTexto(secaoDescricao) : {};
    const mCategoria = texto.match(/\*\*Categoria:\*\*\s*(.*)/);
    const imagens = extrairImagens(texto);
    return {
      categoria: mCategoria ? mCategoria[1].trim() : null,
      marca: campos.marca,
      modelo: campos.modelo,
      codigo_barras: campos.codigo_barras,
      dimensoes: campos.dimensoes,
      peso: campos.peso,
      descricao: secaoDescricao ? extrairDescricaoBreve(secaoDescricao) : null,
      imagem: imagens[0] || null,
      imagens,
      ...extrairDisponibilidade(texto),
    };
  } catch {
    return {};
  }
}

async function construirMapaPrecosVarejo() {
  try {
    const texto = await buscarTexto(CATALOGO_URL_VAREJO);
    const secaoProdutos = extrairSecao(texto, "Produtos");
    const mapa = {};
    for (const linha of secaoProdutos.split("\n")) {
      if (!linha.trim().startsWith("- [")) continue;
      const m = linha.trim().match(/^-\s*\[.*?\]\(([^)]*)\):\s*(.*)$/);
      if (!m) continue;
      const idMatch = m[1].match(/\/produto\/(\d+)\.md/);
      const preco = extrairPreco(m[2]);
      if (idMatch && preco) mapa[idMatch[1]] = preco;
    }
    return mapa;
  } catch {
    return {};
  }
}

async function rasparCatalogoPublico(catalogoUrl) {
  const textoCatalogo = await buscarTexto(catalogoUrl);
  const mapaPrecosVarejo = await construirMapaPrecosVarejo();
  const secaoProdutos = extrairSecao(textoCatalogo, "Produtos");

  const linhas = secaoProdutos.split("\n").filter((l) => l.trim().startsWith("- ["));
  const brutos = linhas.map(parsearLinhaProduto).filter(Boolean);

  const produtos = await mapComLimite(brutos, CONCORRENCIA_COMPLEMENTO, async (bruto) => {
    const idMatch = bruto.url.match(/\/produto\/(\d+)\.md/);
    const produtoId = idMatch ? idMatch[1] : null;
    const campos = extrairCamposTexto(bruto.camposTexto);

    const produto = {
      id: produtoId,
      nome: bruto.nome || null,
      preco: null,
      preco_varejo: produtoId ? mapaPrecosVarejo[produtoId] || null : null,
      categoria: bruto.categoria || null,
      marca: campos.marca,
      modelo: campos.modelo,
      codigo_barras: campos.codigo_barras,
      dimensoes: campos.dimensoes,
      peso: campos.peso,
      descricao: campos.descricao,
      imagem: null,
      imagens: [],
      estoque: null,
      disponivel: null,
      url: bruto.url || null,
      fonte: "feed_publico",
    };

    const faltaAlgo = CAMPOS_ESSENCIAIS.some((c) => !produto[c]);
    if (faltaAlgo && produtoId) {
      const complemento = await buscarComplemento(produtoId);
      for (const [chave, valor] of Object.entries(complemento)) {
        // 'estoque' e 'disponivel' ficam de fora: zero e false sao "falsy" mas
        // sao respostas legitimas, e o teste abaixo as jogaria no lixo.
        if (chave === "imagens" || chave === "estoque" || chave === "disponivel") continue;
        if (valor && !produto[chave]) produto[chave] = valor;
      }
      if (complemento.imagens && complemento.imagens.length) produto.imagens = complemento.imagens;
      if (!produto.imagem && complemento.imagem) produto.imagem = complemento.imagem;
      if (produto.estoque === null && typeof complemento.estoque === "number") produto.estoque = complemento.estoque;
      if (produto.disponivel === null && typeof complemento.disponivel === "boolean") {
        produto.disponivel = complemento.disponivel;
      }
    }
    return produto;
  });

  if (produtos.length === 0) {
    throw new Error("nenhum produto encontrado no feed publico");
  }
  return produtos;
}

export async function extrairViaFeedPublico() {
  return rasparCatalogoPublico(CATALOGO_URL);
}

// Ultimo recurso: descobre a URL do catalogo a partir do llms.txt, caso a
// URL padrao (catalogo.md) mude no futuro.
export async function extrairViaLlmsTxt() {
  const texto = await buscarTexto(LLMS_TXT_URL);
  const m = texto.match(/https:\/\/msdigitaldrop\.com\.br\/c\/dropshippingsp\/catalogo\.md/);
  const urlCatalogo = m ? m[0] : CATALOGO_URL;
  return rasparCatalogoPublico(urlCatalogo);
}
