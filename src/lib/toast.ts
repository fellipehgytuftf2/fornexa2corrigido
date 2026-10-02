import { createContext, useContext } from 'react';
import type { TipoDeToast } from '../components/ui/Toast';

export interface ToastApi {
  /** Mostra um recado no canto da tela. Duração padrão: 6 segundos. */
  mostrarToast: (mensagem: string, tipo?: TipoDeToast, duracao?: number) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

/** Seis segundos: tempo de ler sem correr, e de sair sem incomodar. */
export const DURACAO_PADRAO = 6000;

/**
 * O atalho das telas.
 *
 * Fora do provedor ele não quebra a página: devolve uma função que não faz
 * nada. Recado perdido é menos grave que tela branca.
 */
export function useToast(): ToastApi {
  const contexto = useContext(ToastContext);

  return contexto ?? { mostrarToast: () => undefined };
}
