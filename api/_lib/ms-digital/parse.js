// Funcoes de parsing de texto, portadas do extrair_catalogo.py (mesma logica,
// so reescrita em JS). Usadas tanto pelo caminho logado (API interna) quanto
// pelo caminho publico (feed markdown) para extrair marca/modelo/descricao etc.

const ROTULOS_CAMPOS = {
  marca: ["Marca"],
  modelo: ["Modelo"],
  codigo_barras: ["Código Barras", "Codigo de barras", "Código de Barras", "Codigo Barras"],
  dimensoes: ["Dimensões", "Dimensoes"],
  peso: ["Peso"],
  homologacao: ["Homologação", "Homologacao"],
};
const TODOS_ROTULOS = Object.values(ROTULOS_CAMPOS).flat();

const CABECALHOS_DE_CORTE = [
  "principais características",
  "características principais",
  "especificações técnicas",
  "especificações:",
  "itens inclusos",
  "conteúdo da embalagem",
  "itens incluídos",
  "especificações",
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Extrai o valor de um campo "Rotulo: valor" em texto livre, independente da
// posicao. O valor termina no proximo rotulo conhecido, uma linha em branco,
// ou o fim do texto. "N/A" conta como ausente (retorna null).
export function extrairCampoGenerico(texto, rotulos) {
  const outros = TODOS_ROTULOS.filter((r) => !rotulos.includes(r));
  const fronteira = outros.map(escapeRegExp).join("|");
  for (const rotulo of rotulos) {
    const padrao = new RegExp(
      `${escapeRegExp(rotulo)}\\s*:\\s*(.*?)(?=\\s*(?:${fronteira})\\s*:|\\n\\s*\\n|$)`,
      "s"
    );
    const m = texto.match(padrao);
    if (m) {
      const valor = m[1].replace(/\s+/g, " ").trim();
      if (!valor || valor.toUpperCase() === "N/A") return null;
      return valor;
    }
  }
  return null;
}

const PADRAO_CAMPOS_ORDENADOS = new RegExp(
  "Marca:\\s*(.*?)\\s*Modelo:\\s*(.*?)\\s*" +
    "(?:Código Barras|Codigo de barras):\\s*(.*?)\\s*" +
    "(?:Dimensões|Dimensoes):\\s*(.*?)\\s*Peso:\\s*(.*?)\\s*" +
    "(?:Homologação|Homologacao):\\s*(\\S+)\\s*(.*)",
  "s"
);

// Normaliza peso para "X.XX kg". Aceita "1.17 kg" ou "360 g" (da tabela/API).
export function normalizarPeso(valorBruto) {
  if (!valorBruto) return null;
  const valor = valorBruto.trim();
  if (valor.toUpperCase() === "N/A") return null;
  const m = valor.match(/(\d[\d.,]*)\s*(kg|g)\b/i);
  if (!m) return valor;
  let numero = parseFloat(m[1].includes(",") ? m[1].replace(/\./g, "").replace(",", ".") : m[1]);
  if (Number.isNaN(numero)) return valor;
  if (m[2].toLowerCase() === "g") numero = numero / 1000;
  return `${numero.toFixed(2)} kg`;
}

export function extrairPreco(texto) {
  const m = texto.match(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d+)?)/);
  return m ? `R$ ${m[1]}` : null;
}

// Extrai marca/modelo/codigo_barras/dimensoes/peso/homologacao (e, quando o
// padrao rigido bate, a descricao) de um bloco de texto livre.
export function extrairCamposTexto(texto) {
  if (texto.trim().startsWith("Marca:")) {
    const m = texto.match(PADRAO_CAMPOS_ORDENADOS);
    if (m) {
      const [, marca, modelo, codigoBarras, dimensoes, peso, homologacao, descricao] = m;
      return {
        marca: marca.trim() || null,
        modelo: modelo.trim() || null,
        codigo_barras: codigoBarras.trim() || null,
        dimensoes: dimensoes.trim() || null,
        peso: normalizarPeso(peso),
        homologacao: homologacao.toUpperCase() === "N/A" ? null : homologacao,
        descricao: descricao.trim() || null,
      };
    }
  }
  return {
    marca: extrairCampoGenerico(texto, ROTULOS_CAMPOS.marca),
    modelo: extrairCampoGenerico(texto, ROTULOS_CAMPOS.modelo),
    codigo_barras: extrairCampoGenerico(texto, ROTULOS_CAMPOS.codigo_barras),
    dimensoes: extrairCampoGenerico(texto, ROTULOS_CAMPOS.dimensoes),
    peso: normalizarPeso(extrairCampoGenerico(texto, ROTULOS_CAMPOS.peso)),
    homologacao: extrairCampoGenerico(texto, ROTULOS_CAMPOS.homologacao),
    descricao: null,
  };
}

// Resumo curto da descricao: corta antes de blocos de "caracteristicas" /
// "especificacoes", colapsa espacos e limita o tamanho.
export function extrairDescricaoBreve(textoBruto, limite = 500) {
  let linhas = textoBruto.split("\n");
  const padraoRotulo = new RegExp(
    "^\\s*(?:" + TODOS_ROTULOS.map(escapeRegExp).join("|") + "|Categoria)\\s*:"
  );
  while (linhas.length && padraoRotulo.test(linhas[0])) {
    linhas.shift();
    while (linhas.length && !linhas[0].trim()) linhas.shift();
  }
  let texto = linhas.join("\n");

  const textoMin = texto.toLowerCase();
  const posicoes = CABECALHOS_DE_CORTE.map((c) => textoMin.indexOf(c)).filter((p) => p !== -1);
  if (posicoes.length && Math.min(...posicoes) >= 20) {
    texto = texto.slice(0, Math.min(...posicoes));
  }

  texto = texto.replace(/\s+/g, " ").trim();
  if (texto.length > limite) {
    texto = texto.slice(0, limite).split(" ").slice(0, -1).join(" ") + "...";
  }
  return texto || null;
}

// Converte um trecho de HTML (campo 'descricao' da API logada) em texto simples.
export function htmlParaTexto(htmlBruto) {
  if (!htmlBruto) return "";
  let texto = htmlBruto.replace(/<[^>]+>/g, "\n");
  texto = texto
    .replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&atilde;/g, "ã")
    .replace(/&otilde;/g, "õ").replace(/&ccedil;/g, "ç").replace(/&ecirc;/g, "ê")
    .replace(/&acirc;/g, "â").replace(/&ocirc;/g, "ô").replace(/&Aacute;/g, "Á")
    .replace(/&Eacute;/g, "É").replace(/&Oacute;/g, "Ó").replace(/&Atilde;/g, "Ã")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&ordf;/g, "ª").replace(/&deg;/g, "°");
  return texto;
}
