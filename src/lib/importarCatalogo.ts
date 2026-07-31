/**
 * Leitura de planilha de catálogo.
 *
 * Escrito à mão em vez de usar biblioteca porque o formato é simples e o que
 * costuma quebrar não é o CSV em si, e sim o Excel brasileiro: separador ponto
 * e vírgula, vírgula decimal e arquivo em ANSI. É isso que este módulo trata.
 */

export interface ProdutoImportado {
  name: string;
  description: string;
  category: string;
  supplier_price: number;
  stock: number;
  image_url: string;
  images: string[];
}

export interface ErroDeLinha {
  linha: number;
  motivo: string;
}

export interface ResultadoDaLeitura {
  produtos: ProdutoImportado[];
  erros: ErroDeLinha[];
}

/** Nomes aceitos para cada coluna, em minúsculo e sem acento. */
const COLUNAS: Record<keyof ProdutoImportado | 'fotos', string[]> = {
  name: ['nome', 'produto', 'titulo'],
  description: ['descricao', 'descrição', 'detalhes'],
  category: ['categoria'],
  supplier_price: ['preco', 'preço', 'preco_fornecedor', 'custo', 'valor'],
  stock: ['estoque', 'quantidade', 'qtd'],
  image_url: ['foto', 'imagem', 'foto_principal', 'imagem_principal', 'url'],
  images: [],
  fotos: ['fotos', 'imagens', 'fotos_extras', 'imagens_extras'],
};

const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/**
 * Excel brasileiro salva com ponto e vírgula; o resto do mundo com vírgula.
 * Decide pelo que aparece mais na primeira linha.
 */
function detectarSeparador(primeiraLinha: string): string {
  const pontoEVirgula = (primeiraLinha.match(/;/g) || []).length;
  const virgula = (primeiraLinha.match(/,/g) || []).length;
  const tab = (primeiraLinha.match(/\t/g) || []).length;

  if (tab > pontoEVirgula && tab > virgula) {
    return '\t';
  }

  return pontoEVirgula >= virgula ? ';' : ',';
}

/** Divide respeitando aspas, para descrição com separador dentro não quebrar. */
function dividirLinha(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i += 1) {
    const caractere = linha[i];

    if (caractere === '"') {
      // Duas aspas seguidas dentro do campo representam uma aspa literal.
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }

      continue;
    }

    if (caractere === separador && !dentroDeAspas) {
      campos.push(atual);
      atual = '';
      continue;
    }

    atual += caractere;
  }

  campos.push(atual);

  return campos.map((campo) => campo.trim());
}

/**
 * Aceita "44,60", "44.60", "R$ 44,60" e "1.234,56".
 * O ponto é separador de milhar quando existe vírgula depois dele.
 */
function lerNumero(valor: string): number | null {
  const limpo = valor.replace(/[^\d.,-]/g, '').trim();

  if (!limpo) {
    return null;
  }

  const temVirgula = limpo.includes(',');
  const normalizado = temVirgula ? limpo.replace(/\./g, '').replace(',', '.') : limpo;

  const numero = Number(normalizado);

  return Number.isFinite(numero) ? numero : null;
}

/** Aceita fotos separadas por barra vertical, ponto e vírgula ou espaço. */
function lerFotos(valor: string): string[] {
  return valor
    .split(/[|;\s]+/)
    .map((url) => url.trim())
    .filter((url) => url.startsWith('http'));
}

export function lerPlanilha(texto: string): ResultadoDaLeitura {
  const linhas = texto
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((linha) => linha.trim().length > 0);

  if (linhas.length < 2) {
    return {
      produtos: [],
      erros: [{ linha: 0, motivo: 'A planilha está vazia ou só tem o cabeçalho.' }],
    };
  }

  const separador = detectarSeparador(linhas[0]);
  const cabecalho = dividirLinha(linhas[0], separador).map(semAcento);

  const indiceDe = (nomes: string[]) =>
    cabecalho.findIndex((coluna) => nomes.includes(coluna));

  const indices = {
    name: indiceDe(COLUNAS.name),
    description: indiceDe(COLUNAS.description),
    category: indiceDe(COLUNAS.category),
    supplier_price: indiceDe(COLUNAS.supplier_price),
    stock: indiceDe(COLUNAS.stock),
    image_url: indiceDe(COLUNAS.image_url),
    fotos: indiceDe(COLUNAS.fotos),
  };

  const faltando: string[] = [];

  if (indices.name < 0) faltando.push('nome');
  if (indices.supplier_price < 0) faltando.push('preco');

  if (faltando.length > 0) {
    return {
      produtos: [],
      erros: [
        {
          linha: 1,
          motivo: `Faltam colunas obrigatórias no cabeçalho: ${faltando.join(', ')}. Colunas encontradas: ${cabecalho.join(', ')}.`,
        },
      ],
    };
  }

  const produtos: ProdutoImportado[] = [];
  const erros: ErroDeLinha[] = [];

  linhas.slice(1).forEach((linha, posicao) => {
    // +2: a contagem começa em 1 e o cabeçalho ocupa a primeira linha, então
    // o número bate com o que a pessoa vê no Excel.
    const numeroDaLinha = posicao + 2;
    const campos = dividirLinha(linha, separador);

    const pegar = (indice: number) => (indice >= 0 ? campos[indice] ?? '' : '');

    const nome = pegar(indices.name);

    if (!nome) {
      erros.push({ linha: numeroDaLinha, motivo: 'Sem nome do produto.' });
      return;
    }

    const preco = lerNumero(pegar(indices.supplier_price));

    if (preco === null || preco <= 0) {
      erros.push({
        linha: numeroDaLinha,
        motivo: `Preço inválido: "${pegar(indices.supplier_price)}".`,
      });
      return;
    }

    const estoque = lerNumero(pegar(indices.stock));
    const fotos = lerFotos(pegar(indices.fotos));
    const principal = pegar(indices.image_url).trim();

    produtos.push({
      name: nome,
      description: pegar(indices.description) || nome,
      category: pegar(indices.category) || 'Geral',
      supplier_price: preco,
      stock: estoque !== null && estoque >= 0 ? Math.floor(estoque) : 0,
      image_url: principal.startsWith('http') ? principal : fotos[0] || '',
      images: principal.startsWith('http') ? fotos : fotos.slice(1),
    });
  });

  return { produtos, erros };
}

/**
 * Lê o arquivo em UTF-8 e, se aparecer o caractere de substituição, relê em
 * ISO-8859-1. É o caso do CSV salvo pelo Excel em ANSI, que sem isso chega
 * com os acentos embaralhados.
 */
export async function lerArquivo(arquivo: File): Promise<string> {
  const buffer = await arquivo.arrayBuffer();
  const comoUtf8 = new TextDecoder('utf-8').decode(buffer);

  if (!comoUtf8.includes('�')) {
    return comoUtf8;
  }

  return new TextDecoder('iso-8859-1').decode(buffer);
}

/** Modelo para o fornecedor preencher. Ponto e vírgula, que é o do Excel daqui. */
export const CSV_MODELO = [
  'nome;descricao;categoria;preco;estoque;foto;fotos',
  'Fone Bluetooth TWS;Fone sem fio com cancelamento de ruido;Eletronicos;19,90;50;https://exemplo.com/foto1.jpg;https://exemplo.com/foto2.jpg|https://exemplo.com/foto3.jpg',
  'Suporte Veicular Magnetico;Suporte para celular com fixacao no painel;Automotivo;12,50;120;https://exemplo.com/suporte.jpg;',
].join('\n');
