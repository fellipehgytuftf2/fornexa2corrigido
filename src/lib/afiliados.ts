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
    .select('apelido, situacao, checkout_basico, checkout_premium')
    .maybeSingle();

  return (data as MeuAfiliado) || null;
}

/** O cliente pede para entrar no programa. Devolve a situação que ficou. */
export async function pedirParaSerAfiliado(): Promise<SituacaoDoAfiliado> {
  const { data, error } = await supabase.rpc('pedir_para_ser_afiliado');

  if (error) {
    throw error;
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

export async function desempenhoDosAfiliados(): Promise<NumerosDoAfiliado[]> {
  const { data, error } = await supabase.rpc('admin_desempenho_dos_afiliados');

  if (error) {
    throw error;
  }

  return (data as NumerosDoAfiliado[]) || [];
}

export async function listarAfiliadosDoAdmin(): Promise<AfiliadoDoAdmin[]> {
  const { data, error } = await supabase.rpc('admin_afiliados_cadastrados');

  if (error) {
    throw error;
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
    throw error;
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
    throw error;
  }
}

/** Troca o apelido, e com ele o endereço que o afiliado divulga. */
export async function trocarApelido(conta: string, apelido: string): Promise<void> {
  const { error } = await supabase
    .from('afiliados')
    .update({ apelido: apelido.trim().toLowerCase(), atualizado_em: new Date().toISOString() })
    .eq('conta', conta);

  if (error) {
    throw error;
  }
}

/**
 * O checkout de um afiliado, do jeito que a landing precisa: sem login, sem
 * ver a lista dos outros. Quem não foi aprovado, ou ainda não tem link
 * configurado, não responde nada — e a venda cai no checkout da casa.
 */
export async function buscarCheckoutDoAfiliado(
  apelido: string
): Promise<{ basico: string; premium: string } | null> {
  try {
    const { data, error } = await supabase.rpc('checkout_do_afiliado', { p_codigo: apelido });

    if (error || !data || !data.length) {
      return null;
    }

    const linha = data[0] as MeuAfiliado;

    return { basico: linha.checkout_basico, premium: linha.checkout_premium };
  } catch {
    return null;
  }
}
