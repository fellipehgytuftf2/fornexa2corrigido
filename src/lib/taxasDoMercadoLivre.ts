/**
 * O que o Mercado Livre retém de cada venda.
 *
 * REESCRITO EM 21/11/2026 COM A REGRA OFICIAL
 *
 * A versão de 09/10 media o frete pelas vendas e supunha frete ZERO abaixo de
 * R$ 79 para quem não tivesse frete grátis ligado. A Central de Ajuda do
 * Mercado Livre ("Custos dos Envios no Mercado Livre", válida para Coleta,
 * Agências e Full) diz outra coisa:
 *
 *   "O custo dos Envios no Mercado Livre se aplica a todas as vendas, mesmo
 *    que o comprador pague pelo envio."
 *
 * Ele depende do peso e das medidas da embalagem, do preço e da reputação. A
 * tabela abaixo é a oficial para reputação verde, MercadoLíder ou sem
 * reputação. Laranja e vermelha pagam bem mais (R$ 25,90 em vez de R$ 12,95 no
 * pacote leve a partir de R$ 79) — o valor exato, com a reputação de cada
 * vendedor, vem da função `ml-custo-de-envio`, que pergunta ao próprio
 * Mercado Livre. Esta tabela é a reserva quando a pergunta não responde.
 *
 * As vendas de 02/03 a 20/11/2026 confirmam a tabela (mediana de R$ 6,95 de
 * R$ 19 a 48,99; R$ 13,85 de R$ 79 a 99,99) e mostram o estrago de supor zero:
 * 292 de 486 vendas fecharam no prejuízo, perto de R$ 4.380 somados.
 *
 * A comissão continua vindo do Mercado Livre (`ml-taxa-do-anuncio`). As
 * porcentagens por faixa aqui são só a reserva, medidas nas vendas reais.
 */

/** Faixas de preço da tabela de envio, pelo limite de cima de cada uma. */
const COLUNAS_DE_PRECO = [18.99, 48.99, 78.99, 99.99, 119.99, 149.99, 199.99, Infinity];

/**
 * Custos dos Envios, reputação verde (Central de Ajuda do Mercado Livre,
 * consultada em 21/11/2026). Cada linha: peso máximo em kg e o custo em cada
 * coluna de preço acima.
 */
const TABELA_ENVIO_VERDE: Array<[number, number[]]> = [
  [0.3, [5.65, 6.85, 8.15, 12.95, 14.95, 16.95, 19.05, 21.65]],
  [0.5, [5.95, 6.95, 8.25, 13.85, 16.15, 18.15, 20.45, 23.25]],
  [1, [6.05, 7.15, 8.45, 14.45, 16.85, 19.05, 21.35, 24.45]],
  [1.5, [6.15, 7.35, 8.65, 14.75, 17.15, 19.45, 21.75, 25.45]],
  [2, [6.25, 7.45, 8.75, 15.05, 17.65, 19.85, 22.25, 25.55]],
  [3, [6.35, 8.65, 9.15, 16.45, 19.15, 21.65, 24.35, 27.05]],
  [4, [6.45, 8.75, 9.75, 17.85, 20.75, 23.35, 26.35, 29.25]],
  [5, [6.55, 8.85, 10.25, 19.75, 22.85, 26.05, 29.25, 32.45]],
  [6, [6.65, 8.95, 10.35, 25.95, 29.15, 33.35, 36.45, 40.85]],
  [7, [6.75, 9.05, 10.45, 27.55, 31.65, 36.75, 40.85, 45.25]],
  [8, [6.85, 9.25, 10.55, 29.45, 34.35, 39.25, 44.15, 49.35]],
  [9, [6.95, 9.35, 10.65, 30.25, 35.25, 40.35, 45.35, 50.75]],
  [10, [7.05, 9.45, 10.85, 38.25, 45.05, 51.95, 58.75, 65.85]],
  [11, [7.05, 9.65, 11.05, 41.65, 48.55, 55.45, 62.35, 69.35]],
  [13, [7.15, 10.05, 11.45, 42.55, 49.75, 56.85, 63.85, 70.95]],
  [15, [7.25, 10.25, 11.65, 45.55, 52.95, 60.55, 68.15, 75.65]],
  [17, [7.35, 10.45, 11.85, 48.95, 56.55, 64.05, 71.35, 79.35]],
  [20, [7.45, 10.65, 12.05, 55.15, 64.35, 73.55, 82.75, 91.95]],
  [25, [7.65, 11.05, 12.25, 64.55, 75.75, 85.45, 96.25, 106.85]],
  [30, [7.75, 11.25, 12.45, 66.45, 76.05, 86.25, 97.15, 107.85]],
];

/** Acima deste valor o frete grátis rápido é obrigatório e o vendedor paga. */
export const LIMITE_FRETE_GRATIS = 79;

/** Abaixo deste valor o custo de envio é no máximo metade do preço. */
export const LIMITE_PRODUTO_BARATO = 19;

/**
 * Custo de envio pela tabela oficial (reputação verde).
 *
 * `rapido` é o frete grátis rápido OPCIONAL abaixo de R$ 79: quem liga paga a
 * coluna de R$ 79 a 99,99, e a trava da metade do preço deixa de valer.
 * Sem peso conhecido, usa a linha de até 0,3 kg — a mais comum no catálogo.
 */
export function custoDeEnvioPelaTabela(preco: number, pesoG?: number | null, rapido = false): number {
  const kg = (Number(pesoG) || 0) / 1000;
  const linha = TABELA_ENVIO_VERDE.find(([maximo]) => kg <= maximo) ?? TABELA_ENVIO_VERDE[TABELA_ENVIO_VERDE.length - 1];

  if (rapido && preco < LIMITE_FRETE_GRATIS) {
    return linha[1][3];
  }

  const coluna = COLUNAS_DE_PRECO.findIndex((ate) => preco <= ate);
  const custo = linha[1][coluna === -1 ? COLUNAS_DE_PRECO.length - 1 : coluna];

  return preco < LIMITE_PRODUTO_BARATO ? Math.min(custo, preco / 2) : custo;
}

/** Comissão de reserva por faixa de preço, medida nas vendas reais. */
const COMISSAO_POR_FAIXA: Array<[number, number]> = [
  [25, 0.195],
  [50, 0.171],
  [75, 0.158],
  [100, 0.148],
  [Infinity, 0.155],
];

/** A comissão que ainda aparece escrita na tela quando não há a real. */
export const COMISSAO_CLASSICO = 0.17;

/** O premium parcela sem juros e cobra cerca de cinco pontos a mais. */
export const COMISSAO_PREMIUM = 0.22;

function comissaoEstimada(preco: number, tipo: 'classico' | 'premium'): number {
  const base = COMISSAO_POR_FAIXA.find(([ate]) => preco <= ate)?.[1] ?? 0.155;
  return base + (tipo === 'premium' ? COMISSAO_PREMIUM - COMISSAO_CLASSICO : 0);
}

export interface ContaDaVenda {
  precoDeVenda: number;
  custoDoFornecedor: number;
  comissao: number;
  frete: number;
  imposto: number;
  /** O que sobra de verdade. Pode ser negativo. */
  lucro: number;
  /** Lucro sobre o preço de venda, em porcentagem. */
  margemReal: number;
  /** Verdadeiro quando o anúncio cai na faixa de frete grátis obrigatório. */
  temFreteGratis: boolean;
}

export interface OpcoesDaConta {
  tipo?: 'classico' | 'premium';
  /** Custo de envio informado pelo Mercado Livre. Ausente = tabela oficial. */
  frete?: number;
  /** Comissão em reais informada pelo Mercado Livre. Ausente = estimativa. */
  comissao?: number;
  /** Peso da embalagem, para a tabela de envio. */
  pesoG?: number | null;
  /** Frete grátis rápido ligado abaixo de R$ 79. */
  freteRapido?: boolean;
  /** Imposto sobre a venda, em porcentagem (ex.: 4 para 4%). */
  impostoPct?: number;
  /**
   * Comissão como fração do preço, quando o Mercado Livre já respondeu para
   * este anúncio (a porcentagem é da categoria e não muda com o preço).
   */
  taxaPct?: number;
  /**
   * Um custo de envio que o Mercado Livre respondeu para um preço. Vale para
   * qualquer preço da mesma faixa da tabela; fora dela, volta à tabela.
   */
  freteReferencia?: { preco: number; valor: number };
}

/** Em qual coluna de preço da tabela de envio um preço cai. */
function colunaDoPreco(preco: number): number {
  const coluna = COLUNAS_DE_PRECO.findIndex((ate) => preco <= ate);
  return coluna === -1 ? COLUNAS_DE_PRECO.length - 1 : coluna;
}

function freteDaConta(preco: number, opcoes: OpcoesDaConta): number {
  if (opcoes.frete !== undefined) return opcoes.frete;

  const referencia = opcoes.freteReferencia;
  // Abaixo de R$ 19 o custo é "no máximo metade do preço": muda com o preço
  // dentro da faixa, então a referência só vale para o mesmo preço.
  const mesmaFaixa =
    referencia &&
    (opcoes.freteRapido && preco < LIMITE_FRETE_GRATIS
      ? referencia.preco < LIMITE_FRETE_GRATIS
      : colunaDoPreco(referencia.preco) === colunaDoPreco(preco) &&
        (preco >= LIMITE_PRODUTO_BARATO || referencia.preco === preco));

  return mesmaFaixa ? referencia.valor : custoDeEnvioPelaTabela(preco, opcoes.pesoG, opcoes.freteRapido);
}

/**
 * Refaz a conta da venda descontando tudo o que sai do preço.
 *
 * Aceita a assinatura antiga (tipo, frete, comissão por posição) para não
 * quebrar as telas que ainda a usam.
 */
export function calcularVenda(
  precoDeVenda: number,
  custoDoFornecedor: number,
  tipoOuOpcoes: 'classico' | 'premium' | OpcoesDaConta = 'classico',
  freteCustomizado?: number,
  comissaoReal?: number
): ContaDaVenda {
  const opcoes: OpcoesDaConta =
    typeof tipoOuOpcoes === 'object'
      ? tipoOuOpcoes
      : { tipo: tipoOuOpcoes, frete: freteCustomizado, comissao: comissaoReal };

  const preco = Number(precoDeVenda) || 0;
  const custo = Number(custoDoFornecedor) || 0;
  const tipo = opcoes.tipo ?? 'classico';

  const comissao = opcoes.comissao ?? preco * (opcoes.taxaPct ?? comissaoEstimada(preco, tipo));
  const frete = freteDaConta(preco, opcoes);
  const imposto = preco * ((Number(opcoes.impostoPct) || 0) / 100);

  const lucro = preco - custo - comissao - frete - imposto;

  return {
    precoDeVenda: preco,
    custoDoFornecedor: custo,
    comissao,
    frete,
    imposto,
    lucro,
    margemReal: preco > 0 ? (lucro / preco) * 100 : 0,
    temFreteGratis: preco >= LIMITE_FRETE_GRATIS,
  };
}

/**
 * A margem mínima (sobre o custo) para não sair no prejuízo.
 *
 * Por busca simples porque a tabela de envio cria degraus na curva. Usa a
 * tabela oficial e a comissão estimada: é a resposta "a partir de quanto eu
 * paro de perder dinheiro", não a conta final.
 */
export function margemMinimaSemPrejuizo(
  custoDoFornecedor: number,
  tipoOuOpcoes: 'classico' | 'premium' | OpcoesDaConta = 'classico',
  freteCustomizado?: number
): number | null {
  const custo = Number(custoDoFornecedor) || 0;
  if (custo <= 0) return null;

  const base: OpcoesDaConta =
    typeof tipoOuOpcoes === 'object' ? tipoOuOpcoes : { tipo: tipoOuOpcoes, frete: freteCustomizado };

  for (let margem = 1; margem <= 900; margem += 1) {
    const preco = custo * (1 + margem / 100);
    // Frete e comissão mudam com o preço: só o que o chamador fixou fica.
    const conta = calcularVenda(preco, custo, { ...base, comissao: undefined, frete: base.frete });
    if (conta.lucro > 0) return margem;
  }

  return null;
}

/**
 * O preço que entrega o lucro desejado, já descontando tudo.
 *
 * Busca de centavo em centavo porque comissão e envio mudam por faixa. É
 * barato: no pior caso, alguns milhares de contas.
 */
export function precoParaLucroDesejado(
  custoDoFornecedor: number,
  lucroDesejado: number,
  opcoes?: OpcoesDaConta
): number {
  const custo = Number(custoDoFornecedor) || 0;
  const lucro = Number(lucroDesejado) || 0;
  const teto = Math.max(50, (custo + lucro) * 4 + 200);

  for (let centavos = Math.max(100, Math.round(custo * 100)); centavos <= teto * 100; centavos += 5) {
    const preco = centavos / 100;
    const conta = calcularVenda(preco, custo, { ...opcoes, comissao: undefined });
    if (conta.lucro >= lucro) return preco;
  }

  return Math.ceil(teto * 100) / 100;
}

/**
 * O degrau dos R$ 79.
 *
 * A partir de R$ 79 o frete grátis rápido passa a ser do vendedor e o custo
 * de envio quase dobra (R$ 8,15 -> R$ 12,95 no pacote leve). Um preço logo
 * acima de R$ 79 pode deixar MENOS dinheiro que R$ 78,90. Quando isso
 * acontece, devolve a sugestão; senão, nulo.
 */
export function sugestaoDoDegrau79(
  precoDeVenda: number,
  custoDoFornecedor: number,
  opcoes?: OpcoesDaConta
): { preco: number; lucroAgora: number; lucroSugerido: number } | null {
  if (precoDeVenda < LIMITE_FRETE_GRATIS || precoDeVenda > 100) return null;

  const agora = calcularVenda(precoDeVenda, custoDoFornecedor, { ...opcoes, comissao: undefined });
  const sugerido = calcularVenda(78.9, custoDoFornecedor, {
    ...opcoes,
    comissao: undefined,
    frete: undefined,
    freteRapido: false,
  });

  return sugerido.lucro >= agora.lucro
    ? { preco: 78.9, lucroAgora: agora.lucro, lucroSugerido: sugerido.lucro }
    : null;
}

/**
 * O menor preço em que o lucro é pelo menos `margemPct` % do preço de venda.
 *
 * É o "lucro (%)" da calculadora: o vendedor diz quanto quer que sobre, sobre
 * o preço, e o preço sai pronto. Busca de centavo em centavo, porque comissão
 * e envio mudam por faixa.
 */
export function precoParaMargemDesejada(
  custoDoFornecedor: number,
  margemPct: number,
  opcoes?: OpcoesDaConta
): number | null {
  const custo = Number(custoDoFornecedor) || 0;
  const alvo = Number(margemPct) || 0;
  if (alvo >= 80) return null;

  const teto = Math.max(100, custo * 10 + 300);

  for (let centavos = Math.max(100, Math.round(custo * 100)); centavos <= teto * 100; centavos += 1) {
    const preco = centavos / 100;
    const conta = calcularVenda(preco, custo, { ...opcoes, comissao: undefined, frete: undefined });
    if (conta.lucro > 0 && conta.margemReal >= alvo) return preco;
  }

  return null;
}
