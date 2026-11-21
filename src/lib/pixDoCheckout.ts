import { supabase } from './supabase';
import type { Plano } from './planos';

/**
 * Pix dentro do checkout da FORNEXA.
 *
 * A cobrança é criada pela API da Applyfy, no servidor (função `pix-criar`),
 * porque a chave secreta da API não pode ir para o navegador. O preço também
 * é decidido lá: o navegador só diz qual plano quer.
 *
 * O Pix não carrega dado sensível — é um código que o comprador paga no app
 * do banco. Cartão continua indo para o checkout da Applyfy.
 *
 * PRÉVIA: fora de fornexa.site (prévias da Vercel, localhost), quando a
 * função ainda não existe, a tela mostra um Pix de DEMONSTRAÇÃO, que não é um
 * código válido e não cobra nada. No ar, falha de verdade vira erro na tela.
 */

export interface CobrancaPix {
  transacao: string;
  /** Código "copia e cola" — o QR Code é desenhado a partir dele. */
  codigo: string;
  expiraEm: string | null;
  valor: number;
  demonstracao: boolean;
}

export interface DadosDoPix {
  plano: Plano['id'];
  nome: string;
  email: string;
  whatsapp: string;
  cpf: string;
  cupom?: string | null;
}

const ehPrevia = () =>
  typeof window !== 'undefined' && !window.location.hostname.endsWith('fornexa.site');

const PRECO_DA_DEMONSTRACAO: Record<Plano['id'], number> = { basico: 169, premium: 297 };

export async function criarCobrancaPix(dados: DadosDoPix): Promise<CobrancaPix> {
  const { data, error } = await supabase.functions.invoke('pix-criar', { body: dados });

  if (!error && data?.codigo && data?.transacao) {
    return {
      transacao: data.transacao,
      codigo: data.codigo,
      expiraEm: data.expiraEm ?? null,
      valor: Number(data.valor) || 0,
      demonstracao: false,
    };
  }

  if (ehPrevia()) {
    return {
      transacao: `demo-${Date.now()}`,
      codigo: 'PREVIA-FORNEXA-ESTE-PIX-E-SO-DEMONSTRACAO-NAO-E-UM-CODIGO-VALIDO',
      expiraEm: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      valor: PRECO_DA_DEMONSTRACAO[dados.plano],
      demonstracao: true,
    };
  }

  throw new Error((data as { erro?: string } | null)?.erro || 'Não foi possível gerar o Pix agora.');
}

/** Se o Pix já foi pago. Quem confirma é o aviso da Applyfy, gravado no servidor. */
export async function pixFoiPago(transacao: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('pix-status', { body: { transacao } });
  return !error && data?.pago === true;
}

export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

export function mascaraDeCpf(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}
