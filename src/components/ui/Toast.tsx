import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export type TipoDeToast = 'sucesso' | 'erro' | 'aviso';

interface Props {
  tipo: TipoDeToast;
  mensagem: string;
  /** Quanto tempo fica na tela, em milissegundos. */
  duracao: number;
  aoFechar: () => void;
}

const ESTILO: Record<TipoDeToast, { borda: string; icone: string; Icone: typeof CheckCircle }> = {
  sucesso: {
    borda: 'border-green-200 dark:border-green-800',
    icone: 'text-green-600 dark:text-green-400',
    Icone: CheckCircle,
  },
  erro: {
    borda: 'border-red-200 dark:border-red-800',
    icone: 'text-red-600 dark:text-red-400',
    Icone: AlertCircle,
  },
  aviso: {
    borda: 'border-amber-200 dark:border-amber-800',
    icone: 'text-amber-600 dark:text-amber-400',
    Icone: Info,
  },
};

/** Quanto dura a saída. Precisa bater com a duração da transição abaixo. */
const SAIDA = 300;

/**
 * Um recado que aparece por cima da página e sai sozinho.
 *
 * POR QUE NÃO BASTA A FAIXA DENTRO DA TELA
 *
 * A mensagem de sucesso vivia no meio do conteúdo. Quem estava com a página
 * rolada — que é o caso de quem acabou de voltar do Mercado Livre e cai no fim
 * da tela de Integrações — não via nada: o recado nascia fora do campo de
 * visão e sumia sozinho quatro segundos depois.
 *
 * Preso ao canto da janela, ele é visto de onde quer que a pessoa esteja
 * olhando.
 */
export default function Toast({ tipo, mensagem, duracao, aoFechar }: Props) {
  // Entra e sai com animação, e isso exige um estado próprio: remover o
  // elemento na hora cortaria a saída pela metade.
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    // Um quadro de atraso para o navegador pintar o estado inicial antes da
    // transição; sem ele o toast aparece pronto, sem deslizar.
    const entrada = requestAnimationFrame(() => setVisivel(true));

    const saida = setTimeout(() => setVisivel(false), duracao);
    const remocao = setTimeout(aoFechar, duracao + SAIDA);

    return () => {
      cancelAnimationFrame(entrada);
      clearTimeout(saida);
      clearTimeout(remocao);
    };
  }, [duracao, aoFechar]);

  const fecharAgora = () => {
    setVisivel(false);
    setTimeout(aoFechar, SAIDA);
  };

  const { borda, icone, Icone } = ESTILO[tipo];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border ${borda} bg-white dark:bg-navy-800 shadow-lg px-4 py-3.5 transition-all duration-300 ${
        visivel ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      <Icone className={`w-5 h-5 shrink-0 mt-0.5 ${icone}`} aria-hidden="true" />

      <p className="text-sm font-medium text-navy-900 dark:text-white flex-1 leading-relaxed">
        {mensagem}
      </p>

      <button
        type="button"
        onClick={fecharAgora}
        aria-label="Fechar aviso"
        className="text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors shrink-0"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
