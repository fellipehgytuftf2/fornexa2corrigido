import { supabase } from './supabase';

/**
 * Cupom de desconto da landing de oferta (fornexa.site/oferta).
 *
 * Cada influenciador tem um cupom (ex.: FORNEXA). Quem compra digita o cupom
 * na landing de oferta, ou chega por um link que já traz ele
 * (fornexa.site/oferta?cupom=FORNEXA). Na tela, a palavra "influenciador"
 * não aparece: para quem compra é só um cupom de desconto.
 *
 * Os cupons moram na tabela `cupons` (migration 20261118220000). Admin e
 * co-produtor cuidam deles na tela Afiliados → Influenciadores; a landing só
 * pergunta, um por vez, pela função `conferir_cupom`.
 */

export interface Influenciador {
  cupom: string;
  nome: string;
  perfil: string;
  /** Desconto que o cupom dá. Hoje sempre 50. */
  desconto: number | null;
  ativo: boolean;
}

const CHAVE = 'fornexa_cupom';

/** O preço cheio de cada plano na landing de oferta; o cupom traz de volta ao preço de sempre. */
export const PRECO_CHEIO_DA_OFERTA = { basico: 338, premium: 594 } as const;

/** Só letras e números, em maiúsculas: "bruno 10" e "BRUNO10" são o mesmo cupom. */
export const normalizarCupom = (texto: string) =>
  texto.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);

export type ResultadoDoCupom =
  | { ok: true; influenciador: Influenciador }
  | { ok: false; motivo: 'nao-existe' | 'inativo' | 'sem-conexao' };

/** Pergunta ao banco se o cupom existe e está ativo. */
export async function conferirCupom(texto: string): Promise<ResultadoDoCupom> {
  const cupom = normalizarCupom(texto);
  if (!cupom) return { ok: false, motivo: 'nao-existe' };

  const { data, error } = await supabase.rpc('conferir_cupom', { p_codigo: cupom });
  if (error) return { ok: false, motivo: 'sem-conexao' };

  const achado = (data as { codigo: string; nome: string; desconto: number; ativo: boolean }[] | null)?.[0];
  if (!achado) return { ok: false, motivo: 'nao-existe' };
  if (!achado.ativo) return { ok: false, motivo: 'inativo' };

  return {
    ok: true,
    influenciador: { cupom: achado.codigo, nome: achado.nome, perfil: '', desconto: achado.desconto, ativo: true },
  };
}

interface LinhaDoCupom {
  codigo: string;
  nome: string;
  perfil: string;
  desconto: number;
  ativo: boolean;
}

const daLinha = (linha: LinhaDoCupom): Influenciador => ({
  cupom: linha.codigo,
  nome: linha.nome,
  perfil: linha.perfil,
  desconto: linha.desconto,
  ativo: linha.ativo,
});

/** Todos os cupons, para a tela Influenciadores (admin e co-produtor). */
export async function listarCupons(): Promise<Influenciador[]> {
  const { data, error } = await supabase
    .from('cupons')
    .select('codigo, nome, perfil, desconto, ativo')
    .order('criado_em', { ascending: true });
  if (error) throw error;
  return (data as LinhaDoCupom[]).map(daLinha);
}

/** Cria o cupom. Erro com code 23505 = esse cupom já existe. */
export async function criarCupom(novo: Influenciador): Promise<Influenciador> {
  const { data, error } = await supabase
    .from('cupons')
    .insert({ codigo: novo.cupom, nome: novo.nome, perfil: novo.perfil, desconto: 50, ativo: true })
    .select('codigo, nome, perfil, desconto, ativo')
    .single();
  if (error) throw error;
  return daLinha(data as LinhaDoCupom);
}

export async function mudarAtivo(cupom: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from('cupons').update({ ativo }).eq('codigo', cupom);
  if (error) throw error;
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
