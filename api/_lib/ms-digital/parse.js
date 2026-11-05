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


function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Extrai o valor de um campo "Rotulo: valor" em texto livre, independente da
// posicao. O valor termina no proximo rotulo conhecido, uma linha em branco,
// ou o fim do texto. "N/A" conta como ausente (retorna null).
/**
 * Le o valor na tabela "Especificacoes" da pagina do produto.
 *
 * A pagina diz o peso duas vezes, e as duas versoes discordam:
 *
 *   Peso: 0.07            <- solto no topo, sem unidade
 *   | Peso | 70 g |       <- na tabela, com unidade
 *
 * A de cima e a que `extrairCampoGenerico` encontra, porque so entende
 * "Rotulo:". Sem unidade, 0.07 nao vira peso nenhum -- e foi assim que 611 dos
 * 848 produtos ficaram sem medida quando o Mercado Livre passou a exigi-la.
 *
 * A tabela e a fonte boa, entao e consultada primeiro.
 */
export function extrairDaTabela(texto, rotulos) {
  for (const rotulo of rotulos) {
    const m = texto.match(new RegExp(`\\|\\s*${escapeRegExp(rotulo)}\\s*\\|\\s*([^|\\n]+?)\\s*\\|`, "i"));
    if (m) {
      const valor = m[1].trim();
      if (!valor || valor.toUpperCase() === "N/A") return null;
      return valor;
    }
  }
  return null;
}

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

  // Tres casas, e nao duas, porque o kg passou a ser lido de volta em gramas
  // para o anuncio do Mercado Livre. Com duas casas, "1 g" virava "0.00 kg" e
  // a medida sumia; "45 g" virava 50 g. A resolucao agora e de 1 grama.
  return `${numero.toFixed(3)} kg`;
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
    // A tabela de especificacoes manda: ver o comentario de extrairDaTabela.
    dimensoes: extrairDaTabela(texto, ROTULOS_CAMPOS.dimensoes) ?? extrairCampoGenerico(texto, ROTULOS_CAMPOS.dimensoes),
    peso: normalizarPeso(extrairDaTabela(texto, ROTULOS_CAMPOS.peso) ?? extrairCampoGenerico(texto, ROTULOS_CAMPOS.peso)),
    homologacao: extrairCampoGenerico(texto, ROTULOS_CAMPOS.homologacao),
    descricao: null,
  };
}

// Resumo curto da descricao: corta antes de blocos de "caracteristicas" /
// "especificacoes", colapsa espacos e limita o tamanho.
/**
 * A descricao do produto, inteira.
 *
 * Ela nasceu "breve": cortava em 500 caracteres e, antes disso, jogava fora
 * tudo a partir de "Principais caracteristicas" -- que e onde moram a lista de
 * caracteristicas, os itens inclusos e as especificacoes. O anuncio no Mercado
 * Livre saia com um paragrafo e meio, e era essa a sensacao de "vem pela
 * metade".
 *
 * Agora so sai o que ja virou coluna propria: as linhas de rotulo do topo
 * (Marca, Modelo, Codigo de Barras, Dimensoes, Peso), que o anuncio recebe
 * como atributo e nao precisa repetir no texto.
 *
 * O limite continua existindo, alto, como defesa contra pagina quebrada que
 * devolve o site inteiro num campo so.
 */
export function extrairDescricaoBreve(textoBruto, limite = 5000) {
  let texto = String(textoBruto ?? "").replace(/\s+/g, " ").trim();

  // Tira os rotulos do topo, um a um, e nao linha a linha.
  //
  // Parte do catalogo escreve tudo colado, sem quebra nenhuma:
  //   "Marca: GenericoModelo: boomsbox 30 cmPeso: 1.44A Caixa de Som..."
  // Descartando a linha inteira, como se fazia, a descricao desses produtos
  // sumia por completo -- eram 68 produtos com descricao vazia no catalogo.
  //
  // O valor de cada rotulo termina onde o proximo rotulo comeca. No ultimo
  // deles nao ha proximo, e o texto do produto comeca colado no numero; por
  // isso ali o valor e so o numero, com unidade opcional.
  const rotulos = [...TODOS_ROTULOS, "Categoria", "Altura", "Largura", "Comprimento"]
    .map(escapeRegExp)
    .join("|");

  // O valor para em 60 caracteres de proposito. Sem esse teto, "Homologação:
  // N/A" ia ate o proximo "Marca:" -- que reaparece mais abaixo, na secao de
  // caracteristicas -- e levava junto o texto do produto inteiro.
  // Os dois-pontos sao opcionais: parte do catalogo escreve "Altura 5
  // Comprimento 17 Largura 14 Marca: Generica", misturando as duas formas na
  // mesma linha.
  const rotulo = `(?:${rotulos})\\b\\s*:?\\s*`;

  const ateOProximoRotulo = new RegExp(`^\\s*${rotulo}.{0,60}?(?=(?:${rotulos})\\b\\s*:?)`, "i");
  const soONumero = new RegExp(`^\\s*${rotulo}[\\d.,]+\\s*(?:kg|g|cm|mm|m)?\\s*`, "i");
  const rotuloSozinho = new RegExp(`^\\s*${rotulo}(?:N/A)?\\s*(?=[A-ZÀ-Ú])`);

  for (let passo = 0; passo < 12; passo += 1) {
    const antes = texto;

    texto = texto.replace(ateOProximoRotulo, "");
    if (texto === antes) texto = texto.replace(soONumero, "");
    if (texto === antes) texto = texto.replace(rotuloSozinho, "");
    if (texto === antes) break;

    texto = texto.trim();
  }

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
