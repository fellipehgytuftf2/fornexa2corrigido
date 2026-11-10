/**
 * Programa de afiliados.
 *
 * Afiliado é um cliente que já comprou, pediu para divulgar e foi aceito. O
 * link dele só existe depois que o admin cola os dois checkouts da conta
 * dele — até lá, a conta dele mostra "aguardando" e mais nada.
 */

import { supabase } from './supabase';

export type SituacaoDoAfiliado = 'pendente' | 'aprovado' | 'recusado';

/** O que o próprio afiliado enxerga da situação dele. */
export interface MeuAfiliado {
  apelido: string;
  situacao: SituacaoDoAfiliado;
  checkout_basico: string;
  checkout_premium: string;
  decidido_em?: string | null;
  /**
   * O preço que a landing dele anuncia. Nulo é o preço da casa, e não zero:
   * quem não mexe acompanha o padrão para sempre, inclusive nos reajustes.
   */
  valor_basico?: number | null;
  valor_premium?: number | null;
}

/** Quem foi recusado espera isso antes de poder pedir de novo. */
export const ESPERA_DEPOIS_DA_RECUSA_EM_DIAS = 7;

/** Quando um recusado pode pedir de novo. Mesma conta que o banco faz. */
export function podePedirDeNovoEm(decididoEm: string | null | undefined): Date {
  const base = decididoEm ? new Date(decididoEm) : new Date();
  return new Date(base.getTime() + ESPERA_DEPOIS_DA_RECUSA_EM_DIAS * 86400000);
}

/** O que o admin enxerga: a situação mais quem é a pessoa. */
export interface AfiliadoDoAdmin extends MeuAfiliado {
  conta: string;
  nome: string | null;
  email: string | null;
  pedido_em: string;
}

/** Aprovado e com os dois checkouts no lugar: só aí o link vale. */
export function podeDivulgar(afiliado: {
  situacao: SituacaoDoAfiliado;
  checkout_basico: string;
  checkout_premium: string;
}): boolean {
  return (
    afiliado.situacao === 'aprovado' &&
    Boolean(afiliado.checkout_basico) &&
    Boolean(afiliado.checkout_premium)
  );
}

/** O endereço que o afiliado divulga. */
export function linkDoAfiliado(apelido: string): string {
  return `${window.location.origin}/${apelido}`;
}

/** A situação do afiliado logado. Nulo quer dizer que ele nunca pediu. */
export async function meuCadastroDeAfiliado(): Promise<MeuAfiliado | null> {
  const { data } = await supabase
    .from('afiliados')
    .select('apelido, situacao, checkout_basico, checkout_premium, decidido_em')
    .maybeSingle();

  return (data as MeuAfiliado) || null;
}

/** O cliente pede para entrar no programa. Devolve a situação que ficou. */
export async function pedirParaSerAfiliado(): Promise<SituacaoDoAfiliado> {
  const { data, error } = await supabase.rpc('pedir_para_ser_afiliado');

  if (error) {
    throw new Error(error.message);
  }

  return data as SituacaoDoAfiliado;
}

/** Vendas de um afiliado, contadas pelos checkouts dele. */
export interface NumerosDoAfiliado {
  conta: string;
  vendas: number;
  faturamento: number;
  clientes_ativos: number;
  clientes_perdidos: number;
  usando_ainda: number;
  ultima_venda: string | null;
}

// O erro do Supabase e um objeto comum, nao um Error. Quem chama testava
// `e instanceof Error` e caia no texto generico "Erro desconhecido",
// escondendo justamente o motivo -- foi assim que a recusa do banco ao
// co-produtor chegou na tela sem dizer o que era. Por isso vira Error aqui.
export async function desempenhoDosAfiliados(): Promise<NumerosDoAfiliado[]> {
  const { data, error } = await supabase.rpc('admin_desempenho_dos_afiliados');

  if (error) {
    throw new Error(error.message);
  }

  return (data as NumerosDoAfiliado[]) || [];
}

export async function listarAfiliadosDoAdmin(): Promise<AfiliadoDoAdmin[]> {
  const { data, error } = await supabase.rpc('admin_afiliados_cadastrados');

  if (error) {
    throw new Error(error.message);
  }

  return (data as AfiliadoDoAdmin[]) || [];
}

/** Aceita ou recusa quem pediu. */
export async function decidirAfiliado(conta: string, aprovado: boolean): Promise<void> {
  const { error } = await supabase
    .from('afiliados')
    .update({
      situacao: aprovado ? 'aprovado' : 'recusado',
      decidido_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq('conta', conta);

  if (error) {
    throw new Error(error.message);
  }
}

/** Cola os dois checkouts da conta do afiliado — a última porta antes do link. */
export async function salvarCheckoutDoAfiliado(
  conta: string,
  links: { basico: string; premium: string }
): Promise<void> {
  const { error } = await supabase
    .from('afiliados')
    .update({
      checkout_basico: links.basico.trim(),
      checkout_premium: links.premium.trim(),
      atualizado_em: new Date().toISOString(),
    })
    .eq('conta', conta);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Tira a pessoa do programa. O link para de vender na hora — quem abrir cai
 * no checkout da casa — e ela volta a ver "Quero ser afiliado". As vendas
 * passadas continuam em `pagamentos`; só deixam de aparecer no Desempenho.
 */
export async function removerAfiliado(conta: string): Promise<void> {
  const { data, error } = await supabase
    .from('afiliados')
    .delete()
    .eq('conta', conta)
    .select('conta');

  if (error) {
    throw new Error(error.message);
  }

  // Sem permissão, o banco não reclama: só não apaga nada. Melhor avisar do
  // que deixar o botão girando como se tivesse dado certo.
  if (!data?.length) {
    throw new Error('Nada foi removido. Confira se sua conta ainda é admin e tente de novo.');
  }
}

/**
 * O admin põe alguém no programa sem esperar o pedido.
 *
 * A conta precisa existir: afiliado é uma linha presa a uma conta, e não um
 * cadastro solto. Os checkouts nascem vazios de propósito -- enquanto
 * estiverem assim o link não vende, e a venda cai no checkout da casa em vez
 * de sumir.
 */
export async function criarAfiliado(email: string, apelido: string): Promise<void> {
  const { error } = await supabase.rpc('admin_criar_afiliado', {
    p_email: email.trim(),
    p_apelido: apelido.trim().toLowerCase(),
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * O preço que a landing deste afiliado anuncia.
 *
 * Nulo devolve o afiliado ao preço da casa -- é como o campo em branco chega
 * aqui, e é o que deve acontecer quando o admin apaga o que havia digitado.
 * Gravar zero faria a landing anunciar de graça.
 *
 * Quem cobra continua sendo o checkout dele na Applyfy. Este número só
 * escreve na tela, e combinar os dois é trabalho de quem preenche: não há
 * como ler o preço de dentro do checkout do afiliado para conferir.
 */
export async function salvarValoresDoAfiliado(
  conta: string,
  valores: { basico: number | null; premium: number | null }
): Promise<void> {
  const { error } = await supabase
    .from('afiliados')
    .update({
      valor_basico: valores.basico,
      valor_premium: valores.premium,
      atualizado_em: new Date().toISOString(),
    })
    .eq('conta', conta);

  if (error) {
    throw new Error(error.message);
  }
}

/** Troca o apelido, e com ele o endereço que o afiliado divulga. */
export async function trocarApelido(conta: string, apelido: string): Promise<void> {
  const { error } = await supabase
    .from('afiliados')
    .update({ apelido: apelido.trim().toLowerCase(), atualizado_em: new Date().toISOString() })
    .eq('conta', conta);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * O checkout de um afiliado, do jeito que a landing precisa: sem login, sem
 * ver a lista dos outros. Quem não foi aprovado, ou ainda não tem link
 * configurado, não responde nada — e a venda cai no checkout da casa.
 */
export async function buscarCheckoutDoAfiliado(
  apelido: string
): Promise<{
  basico: string;
  premium: string;
  valorBasico: number | null;
  valorPremium: number | null;
} | null> {
  try {
    const { data, error } = await supabase.rpc('checkout_do_afiliado', { p_codigo: apelido });

    if (error || !data || !data.length) {
      return null;
    }

    const linha = data[0] as MeuAfiliado;

    return {
      basico: linha.checkout_basico,
      premium: linha.checkout_premium,
      valorBasico: linha.valor_basico ?? null,
      valorPremium: linha.valor_premium ?? null,
    };
  } catch {
    return null;
  }
}
