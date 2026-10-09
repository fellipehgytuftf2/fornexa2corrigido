/**
 * O que o Mercado Livre retém de cada venda — medido, não suposto.
 *
 * POR QUE ISTO FOI REESCRITO EM 09/10/2026
 *
 * A versão anterior supunha 12% de comissão e frete ZERO abaixo de R$ 79. As
 * vendas reais dizem outra coisa:
 *
 *   faixa de preço      vendas   taxa real   frete por unidade (mediana)
 *   R$ 5,84 – 24,94       49       19,5%           R$  6,85
 *   R$ 26,59 – 49,99      59       17,1%           R$ 13,85
 *   R$ 50 – 72             6       15,8%           R$  8,65
 *   R$ 76 – 99,40          9       14,8%           R$ 14,45
 *   R$ 123 – 146           7       15,5%           R$ 18,60
 *   R$ 326 – 1.210         5       16,0%           R$ 24,45
 *
 * Entre R$ 150 e R$ 326 não houve nenhuma venda: esse pedaço usa o medido da
 * faixa de baixo, que é o vizinho mais próximo. Quando aparecerem vendas ali,
 * vale refazer a medição e trocar o número por dado.
 *
 * Duas conclusões, e as duas doem:
 *
 * 1. A comissão nunca foi 12%. Fica entre 15% e 19,5%, e é PIOR no produto
 *    barato — exatamente onde a margem já é apertada.
 *
 * 2. O frete existe em TODAS as faixas, inclusive abaixo de R$ 79. Supor zero
 *    ali foi o erro mais caro: num Furador de Coco vendido a R$ 22,46, o frete
 *    de R$ 13,85 transformou um "lucro" de R$ 13,71 em prejuízo de R$ 5,85. Nas
 *    duas faixas mais baratas, 108 vendas passaram por essa conta errada.
 *
 * O sistema já sabia disso DEPOIS da venda: `orders.taxa_marketplace` e
 * `orders.custo_frete` vêm do próprio Mercado Livre, e o Financeiro mostra o
 * número certo. O que faltava era dizer antes, na hora de escolher o preço.
 *
 * COMO REFAZER ESTA MEDIÇÃO
 *
 * A consulta está em `supabase/migrations/.../VERIFICACAO` e no histórico: a
 * ideia é dividir taxa e frete pela QUANTIDADE (eles são do pedido inteiro, e
 * o preço é unitário) e usar a mediana do frete, que resiste ao caso extremo —
 * uma venda teve R$ 57 de frete e distorcia a média sozinha.
 */

/** Uma faixa de preço, com o que o Mercado Livre cobrou nela de verdade. */
interface FaixaDeCusto {
  /** Até este preço de venda, por unidade. */
  ate: number;
  /** Comissão sobre o preço, medida. */
  comissao: number;
  /** Frete por unidade que o vendedor bancou, mediana medida. */
  frete: number;
}

/**
 * As faixas, medidas em 09/10/2026 sobre 135 vendas com custo apurado.
 *
 * O frete é monotônico de propósito: a faixa de R$ 50–72 mediu R$ 8,65, menos
 * que a faixa de baixo, com apenas 6 vendas. Em vez de deixar a amostra
 * pequena criar um degrau para baixo — que viraria promessa de lucro onde não
 * há —, cada faixa carrega pelo menos o frete da anterior. Errar para o lado
 * caro custa uma venda; errar para o barato custa dinheiro do vendedor.
 */
export const FAIXAS_DE_CUSTO: FaixaDeCusto[] = [
  { ate: 25, comissao: 0.195, frete: 6.85 },
  { ate: 50, comissao: 0.171, frete: 13.85 },
  { ate: 75, comissao: 0.158, frete: 13.85 },
  { ate: 100, comissao: 0.148, frete: 14.45 },
  { ate: 150, comissao: 0.155, frete: 18.6 },

  // De R$ 150 a R$ 300 não há venda medida: o pedaço seguinte da amostra
  // começa em R$ 326. Em vez de empurrar o anúncio de R$ 180 para os números
  // de um de R$ 1.200 — produto maior, mais pesado, frete de R$ 24 —, esta
  // faixa repete o medido mais próximo, que é o da faixa de baixo.
  //
  // É extrapolação dos dois jeitos; esta erra menos, e erra para perto.
  { ate: 300, comissao: 0.155, frete: 18.6 },

  { ate: Infinity, comissao: 0.16, frete: 24.45 },
];

/**
 * A comissão que ainda aparece escrita na tela, para o texto não mentir.
 *
 * Mantida porque o modal mostra "X% de comissão" ao lado da conta. É a faixa
 * mais comum entre as vendas medidas, não um número redondo escolhido a dedo.
 */
export const COMISSAO_CLASSICO = 0.17;

/** O premium parcela sem juros e cobra cerca de cinco pontos a mais. */
export const COMISSAO_PREMIUM = 0.22;

/**
 * Acima deste valor o Mercado Livre empurra frete grátis.
 *
 * Continua documentado porque explica POR QUE o frete aparece: abaixo dele o
 * vendedor só paga frete se tiver ligado frete grátis no anúncio — e as vendas
 * medidas mostram que muitos ligaram, sem perceber o tamanho da conta.
 */
export const LIMITE_FRETE_GRATIS = 79;

/** Qual faixa um preço ocupa. */
function faixaDe(preco: number): FaixaDeCusto {
  return FAIXAS_DE_CUSTO.find((faixa) => preco <= faixa.ate) ?? FAIXAS_DE_CUSTO[FAIXAS_DE_CUSTO.length - 1];
}

export interface ContaDaVenda {
  precoDeVenda: number;
  custoDoFornecedor: number;
  comissao: number;
  frete: number;
  /** O que sobra de verdade. Pode ser negativo. */
  lucro: number;
  /** Lucro sobre o preço de venda, em porcentagem. */
  margemReal: number;
  /** Verdadeiro quando o anúncio cai na faixa de frete grátis. */
  temFreteGratis: boolean;
}

/**
 * Refaz a conta da venda descontando o que o marketplace retém.
 *
 * `tipo` distingue o anúncio clássico do premium: o premium aparece melhor na
 * busca e parcela sem juros, mas come alguns pontos a mais de comissão.
 */
export function calcularVenda(
  precoDeVenda: number,
  custoDoFornecedor: number,
  tipo: 'classico' | 'premium' = 'classico',
  /** Frete que o vendedor banca. Ausente = o medido para a faixa. */
  freteCustomizado?: number
): ContaDaVenda {
  const preco = Number(precoDeVenda) || 0;
  const custo = Number(custoDoFornecedor) || 0;

  const faixa = faixaDe(preco);

  // O premium cobra a mais sobre a comissão medida da faixa, e não sobre um
  // número fixo: a diferença entre os dois é constante, a base não.
  const taxa = faixa.comissao + (tipo === 'premium' ? COMISSAO_PREMIUM - COMISSAO_CLASSICO : 0);

  const comissao = preco * taxa;
  const frete = freteCustomizado ?? faixa.frete;

  const lucro = preco - custo - comissao - frete;

  return {
    precoDeVenda: preco,
    custoDoFornecedor: custo,
    comissao,
    frete,
    lucro,
    margemReal: preco > 0 ? (lucro / preco) * 100 : 0,
    temFreteGratis: preco >= LIMITE_FRETE_GRATIS,
  };
}

/**
 * A margem mínima para não sair no prejuízo, em porcentagem sobre o custo.
 *
 * Responde a pergunta que a pessoa tem ao arrastar o controle de margem: "a
 * partir de quanto eu paro de perder dinheiro?". Por busca simples porque as
 * faixas criam degraus na curva — não dá para isolar numa fórmula direta.
 *
 * Vai até 900% porque, com frete de R$ 13 num produto de R$ 8, é aí que a
 * conta vira. Parar antes devolveria "não existe" para um caso que existe.
 */
export function margemMinimaSemPrejuizo(
  custoDoFornecedor: number,
  tipo: 'classico' | 'premium' = 'classico',
  /**
   * Frete que o vendedor banca. Zero para quem não tem frete grátis ligado —
   * sem isso a resposta exigia 200% de margem de quem não paga frete nenhum.
   */
  freteCustomizado?: number
): number | null {
  const custo = Number(custoDoFornecedor) || 0;

  if (custo <= 0) {
    return null;
  }

  for (let margem = 1; margem <= 900; margem += 1) {
    const preco = custo * (1 + margem / 100);

    if (calcularVenda(preco, custo, tipo, freteCustomizado).lucro > 0) {
      return margem;
    }
  }

  return null;
}

/**
 * O preço que entrega o lucro desejado, já descontando comissão e frete.
 *
 * É a conta ao contrário: o vendedor diz quanto quer que sobre, e o preço sai
 * pronto. Antes ele escolhia margem sobre o custo e descobria depois que não
 * sobrava nada.
 *
 * A álgebra, dentro de uma faixa:
 *
 *   preço = custo + comissão + frete + lucro
 *   comissão = preço x taxa
 *   preço = (custo + frete + lucro) / (1 - taxa)
 *
 * As faixas criam degraus: o preço calculado com a taxa de uma faixa pode cair
 * em outra, onde a taxa e o frete são diferentes. Por isso a conta é feita
 * faixa a faixa, e vale a primeira cujo resultado cai dentro dela mesma.
 */
export function precoParaLucroDesejado(
  custoDoFornecedor: number,
  lucroDesejado: number,
  opcoes?: {
    tipo?: 'classico' | 'premium';
    /** Frete que o vendedor banca. Ausente = o medido para a faixa. */
    frete?: number;
  }
): number {
  const custo = Number(custoDoFornecedor) || 0;
  const lucro = Number(lucroDesejado) || 0;
  const premium = opcoes?.tipo === 'premium';

  for (const faixa of FAIXAS_DE_CUSTO) {
    const taxa = faixa.comissao + (premium ? COMISSAO_PREMIUM - COMISSAO_CLASSICO : 0);
    const frete = opcoes?.frete ?? faixa.frete;

    const preco = (custo + frete + lucro) / (1 - taxa);

    // Caiu dentro da própria faixa: é este o preço.
    if (preco <= faixa.ate) {
      return Math.ceil(preco * 100) / 100;
    }
  }

  // Passou de todas: usa a última, que é a faixa aberta no topo.
  const ultima = FAIXAS_DE_CUSTO[FAIXAS_DE_CUSTO.length - 1];
  const taxa = ultima.comissao + (premium ? COMISSAO_PREMIUM - COMISSAO_CLASSICO : 0);

  return Math.ceil(((custo + (opcoes?.frete ?? ultima.frete) + lucro) / (1 - taxa)) * 100) / 100;
}
