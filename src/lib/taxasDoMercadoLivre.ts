/**
 * Estimativa do que o Mercado Livre retém de cada venda.
 *
 * POR QUE ESTIMATIVA, E NÃO O NÚMERO EXATO:
 *
 * O valor exato só existe depois da venda — o ML fecha a comissão e o frete no
 * fechamento do pedido, e é isso que a sincronização grava em
 * `orders.taxa_marketplace` e `orders.custo_frete`. O Financeiro mostra esses
 * valores reais.
 *
 * Aqui o objetivo é outro: avisar ANTES de publicar. Sem isso, a pessoa escolhe
 * uma margem de 40% olhando um "lucro" que não desconta nada, publica, e só
 * descobre a conta verdadeira quando o dinheiro cai. Um número aproximado dito
 * na hora certa vale mais que um número exato dito tarde demais.
 *
 * As faixas abaixo mudam com o tempo e por categoria. Estão soltas aqui de
 * propósito, para serem fáceis de corrigir quando o ML mexer nas regras.
 */

/** Comissão do anúncio clássico. Varia por categoria; esta é a faixa comum. */
export const COMISSAO_CLASSICO = 0.12;

/** Comissão do anúncio premium, que parcela sem juros para o comprador. */
export const COMISSAO_PREMIUM = 0.17;

/**
 * Acima deste valor o Mercado Livre empurra frete grátis, e o vendedor banca
 * parte dele. É exatamente na virada desse limite que a conta costuma azedar.
 */
export const LIMITE_FRETE_GRATIS = 79;

/**
 * Quanto o vendedor costuma bancar de frete num produto leve com frete grátis.
 * O ML subsidia uma parte; o resto sai do bolso de quem vende.
 */
export const FRETE_ESTIMADO = 25;

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
 * busca e parcela sem juros, mas come cinco pontos a mais de comissão.
 */
export function calcularVenda(
  precoDeVenda: number,
  custoDoFornecedor: number,
  tipo: 'classico' | 'premium' = 'classico',
  /** Frete que o vendedor banca. Ausente = a estimativa padrão. */
  freteCustomizado?: number
): ContaDaVenda {
  const preco = Number(precoDeVenda) || 0;
  const custo = Number(custoDoFornecedor) || 0;

  const comissao = preco * (tipo === 'premium' ? COMISSAO_PREMIUM : COMISSAO_CLASSICO);

  const temFreteGratis = preco >= LIMITE_FRETE_GRATIS;
  const frete = temFreteGratis ? (freteCustomizado ?? FRETE_ESTIMADO) : 0;

  const lucro = preco - custo - comissao - frete;

  return {
    precoDeVenda: preco,
    custoDoFornecedor: custo,
    comissao,
    frete,
    lucro,
    margemReal: preco > 0 ? (lucro / preco) * 100 : 0,
    temFreteGratis,
  };
}

/**
 * A margem mínima para não sair no prejuízo, em porcentagem sobre o custo.
 *
 * Serve para responder a pergunta que a pessoa realmente tem na cabeça ao
 * arrastar o controle de margem: "a partir de quanto eu paro de perder
 * dinheiro?". Resolvido por busca simples porque o frete grátis cria um degrau
 * no meio da curva — não dá para isolar numa fórmula direta.
 */
export function margemMinimaSemPrejuizo(
  custoDoFornecedor: number,
  tipo: 'classico' | 'premium' = 'classico'
): number | null {
  const custo = Number(custoDoFornecedor) || 0;

  if (custo <= 0) {
    return null;
  }

  for (let margem = 1; margem <= 300; margem += 1) {
    const preco = custo * (1 + margem / 100);

    if (calcularVenda(preco, custo, tipo).lucro > 0) {
      return margem;
    }
  }

  return null;
}

/**
 * O preço que entrega o lucro desejado, já descontando comissão e frete.
 *
 * É a conta ao contrário da que existia. Antes o vendedor escolhia uma margem
 * sobre o custo e descobria depois que não sobrava nada — o que fez uma margem
 * de 40% virar prejuízo de R$ 2,50 num produto de R$ 97. Aqui ele diz quanto
 * quer que sobre, e o preço sai pronto.
 *
 * A álgebra:
 *
 *   preço = custo + comissão + frete + lucro
 *   comissão = preço x taxa
 *
 *   preço x (1 - taxa) = custo + frete + lucro
 *   preço = (custo + frete + lucro) / (1 - taxa)
 *
 * O frete cria um degrau: ele só existe acima do limite de frete grátis, e o
 * limite é sobre o próprio preço que estamos calculando. Por isso a conta é
 * feita duas vezes — primeiro sem frete, e de novo com frete se o resultado
 * passar do limite.
 */
export function precoParaLucroDesejado(
  custoDoFornecedor: number,
  lucroDesejado: number,
  opcoes?: {
    tipo?: 'classico' | 'premium';
    /** Frete que o vendedor banca. Ausente = a estimativa padrão. */
    frete?: number;
  }
): number {
  const custo = Number(custoDoFornecedor) || 0;
  const lucro = Number(lucroDesejado) || 0;

  const taxa = opcoes?.tipo === 'premium' ? COMISSAO_PREMIUM : COMISSAO_CLASSICO;
  const freteCheio = opcoes?.frete ?? FRETE_ESTIMADO;

  const calcular = (frete: number) => (custo + frete + lucro) / (1 - taxa);

  // Primeira tentativa: supondo que o anúncio fica abaixo do frete grátis.
  const semFrete = calcular(0);

  if (semFrete < LIMITE_FRETE_GRATIS) {
    return Math.ceil(semFrete * 100) / 100;
  }

  // Passou do limite: o frete entra e empurra o preço mais para cima.
  return Math.ceil(calcular(freteCheio) * 100) / 100;
}
