import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Desenha o conteúdo direto no corpo do documento, fora da árvore da página.
 *
 * POR QUE ISSO EXISTE
 *
 * Modal desenhado dentro da página disputa camada com cabeçalho e menu — e
 * perde de formas difíceis de prever. `backdrop-filter`, `position: sticky` e
 * `transform` criam contextos de empilhamento próprios, e o navegador compõe
 * alguns deles acima do modal mesmo quando o `z-index` diz o contrário.
 *
 * O sintoma que motivou isto: uma faixa do cabeçalho aparecendo nítida por
 * cima do fundo escurecido, com o avatar e o botão de sair brilhando sobre a
 * tela travada. Cada tentativa de consertar por `z-index` descobria outro
 * elemento fazendo o mesmo — foram quatro, em elementos diferentes.
 *
 * Preso ao corpo, o modal não tem ancestral capaz de competir com ele. A
 * classe inteira de problema deixa de existir, e não volta quando alguém
 * acrescentar um efeito novo no layout.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(children, document.body);
}
