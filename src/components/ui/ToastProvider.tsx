import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Toast from './Toast';
import type { TipoDeToast } from './Toast';
import { DURACAO_PADRAO, ToastContext } from '../../lib/toast';

interface Recado {
  id: number;
  tipo: TipoDeToast;
  mensagem: string;
  duracao: number;
}

/**
 * O lugar de onde qualquer tela manda um recado para o canto da janela.
 *
 * Fica acima das rotas para o recado sobreviver à navegação: quem clica em
 * algo e troca de tela no mesmo gesto continua vendo o que aconteceu.
 */
export default function ToastProvider({ children }: { children: ReactNode }) {
  const [recados, setRecados] = useState<Recado[]>([]);

  const mostrarToast = useCallback(
    (mensagem: string, tipo: TipoDeToast = 'sucesso', duracao = DURACAO_PADRAO) => {
      // O id vem do relógio mais um aleatório: dois recados disparados no
      // mesmo milissegundo (acontece em ação em lote) teriam a mesma chave e
      // o React descartaria um deles.
      const id = Date.now() + Math.random();

      setRecados((atuais) => [...atuais, { id, tipo, mensagem, duracao }]);
    },
    []
  );

  const fechar = useCallback((id: number) => {
    setRecados((atuais) => atuais.filter((recado) => recado.id !== id));
  }, []);

  const api = useMemo(() => ({ mostrarToast }), [mostrarToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      {typeof document !== 'undefined' &&
        createPortal(
          // `pointer-events-none` na pilha e `auto` em cada recado: o espaço
          // vazio ao redor continua clicável, e só o próprio aviso recebe o
          // clique do X.
          //
          // No celular ele encosta no topo e ocupa a largura; caixinha
          // espremida no canto de tela estreita fica ilegível.
          <div className="pointer-events-none fixed top-4 right-4 left-4 sm:left-auto z-[300] flex flex-col gap-2 sm:max-w-sm">
            {recados.map((recado) => (
              <Toast
                key={recado.id}
                tipo={recado.tipo}
                mensagem={recado.mensagem}
                duracao={recado.duracao}
                aoFechar={() => fechar(recado.id)}
              />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}
