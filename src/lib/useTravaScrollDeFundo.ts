import { useEffect } from 'react';

/**
 * Impede a página de fundo de rolar enquanto um modal está aberto.
 *
 * Sem isso, rolar com a roda do mouse dentro do modal move a tela de trás
 * assim que o conteúdo do modal chega ao fim — e ao fechar, o usuário está em
 * outro ponto da página.
 *
 * Também compensa a largura da barra de rolagem que some ao travar. Sem essa
 * compensação o conteúdo salta alguns pixels para o lado ao abrir e ao fechar,
 * que é aquele "tremor" comum em modais mal feitos.
 *
 * @param ativo normalmente o mesmo booleano que decide se o modal aparece
 */
export function useTravaScrollDeFundo(ativo: boolean) {
  useEffect(() => {
    if (!ativo) {
      return;
    }

    const overflowAnterior = document.body.style.overflow;
    const paddingAnterior = document.body.style.paddingRight;

    // Diferença entre a janela e a área útil: é o espaço que a barra ocupa.
    // Zero em telas de toque e em quem usa barra sobreposta.
    const larguraDaBarra = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';

    if (larguraDaBarra > 0) {
      document.body.style.paddingRight = `${larguraDaBarra}px`;
    }

    return () => {
      document.body.style.overflow = overflowAnterior;
      document.body.style.paddingRight = paddingAnterior;
    };
  }, [ativo]);
}
