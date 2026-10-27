import { useEffect, useRef, useState } from 'react';

/**
 * Um número que sobe de 0 até o valor final, uma vez, ao carregar.
 *
 * `tabular-nums` existe para o número não mudar de largura enquanto conta: em
 * fonte comum o "1" é mais estreito que o "8", e o texto ao lado ficaria
 * tremendo a cada quadro.
 *
 * Quem pede menos movimento no sistema vê o valor final direto, sem contagem.
 */
export default function NumeroQueSobe({ valor }: { valor: number }) {
  const [atual, setAtual] = useState(0);
  const jaRodou = useRef(false);

  useEffect(() => {
    // Em desenvolvimento o React monta o componente duas vezes de propósito.
    // Sem esta trava a contagem recomeçaria no meio.
    if (jaRodou.current) return;
    jaRodou.current = true;

    let prefereParado = false;

    try {
      prefereParado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      prefereParado = false;
    }

    if (prefereParado) {
      setAtual(valor);
      return;
    }

    const DURACAO = 2000;
    const inicio = performance.now();
    let quadro = 0;

    const passo = (agora: number) => {
      const andamento = Math.min((agora - inicio) / DURACAO, 1);

      // Desacelera no fim: começa rápido e chega de mansinho no valor final.
      const suave = 1 - Math.pow(1 - andamento, 3);

      setAtual(Math.round(valor * suave));

      if (andamento < 1) quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);

    return () => cancelAnimationFrame(quadro);
  }, [valor]);

  return <span className="tabular-nums">{atual}</span>;
}
