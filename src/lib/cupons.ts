/**
 * Cupom de influenciador.
 *
 * Cada influenciador tem um cupom (BRUNO10, MARI15...). Quem compra digita o
 * cupom antes de escolher o plano, ou chega por um link que já traz ele
 * (fornexa.site/?cupom=BRUNO10). O cupom fica guardado no navegador e vai
 * para a conta quando a pessoa se cadastra; quando o pagamento dessa conta
 * chega, a venda conta para o influenciador.
 *
 * PRÉVIA — branch feat/cupom-influenciador: a lista abaixo é de exemplo e
 * nada é gravado no banco ainda.
 */

export interface Influenciador {
  cupom: string;
  nome: string;
  perfil: string;
  /** Desconto que o cupom dá. Nulo: o cupom só rastreia, não muda o preço. */
  desconto: number | null;
  ativo: boolean;
}

export const INFLUENCIADORES_DE_EXEMPLO: Influenciador[] = [
  { cupom: 'BRUNO10', nome: 'Bruno Costa', perfil: '@brunovendeonline', desconto: 10, ativo: true },
  { cupom: 'MARI', nome: 'Mariana Lopes', perfil: '@mariempreende', desconto: null, ativo: true },
  { cupom: 'LUCASDROP', nome: 'Lucas Andrade', perfil: '@lucasdrop', desconto: 15, ativo: true },
  { cupom: 'RAFA', nome: 'Rafaela Nunes', perfil: '@rafanomercado', desconto: null, ativo: false },
];

const CHAVE = 'fornexa_cupom';

/** Só letras e números, em maiúsculas: "bruno 10" e "BRUNO10" são o mesmo cupom. */
export const normalizarCupom = (texto: string) =>
  texto.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);

export type ResultadoDoCupom =
  | { ok: true; influenciador: Influenciador }
  | { ok: false; motivo: 'nao-existe' | 'inativo' };

/** Confere o cupom. Na versão de verdade, pergunta ao banco. */
export function conferirCupom(texto: string): ResultadoDoCupom {
  const cupom = normalizarCupom(texto);
  const influenciador = INFLUENCIADORES_DE_EXEMPLO.find((item) => item.cupom === cupom);

  if (!influenciador) return { ok: false, motivo: 'nao-existe' };
  if (!influenciador.ativo) return { ok: false, motivo: 'inativo' };
  return { ok: true, influenciador };
}

export function guardarCupom(cupom: string | null) {
  try {
    if (cupom) localStorage.setItem(CHAVE, cupom);
    else localStorage.removeItem(CHAVE);
  } catch {
    // Sem armazenamento, o cupom vale só enquanto a página estiver aberta.
  }
}

export function cupomGuardado(): string | null {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

/** O cupom que veio no link (?cupom=), se houver. */
export function cupomDoLink(): string | null {
  try {
    const cupom = new URLSearchParams(window.location.search).get('cupom');
    return cupom ? normalizarCupom(cupom) : null;
  } catch {
    return null;
  }
}

/** Preço com o desconto do cupom, no formato da tela ("R$ 152,10"). */
export function precoComDesconto(preco: string, desconto: number | null): string | null {
  if (!desconto) return null;
  const numero = Number(preco.replace(/[^\d,]/g, '').replace(',', '.'));
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return (numero * (1 - desconto / 100)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
