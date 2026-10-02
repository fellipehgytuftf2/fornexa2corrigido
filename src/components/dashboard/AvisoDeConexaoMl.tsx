import { useEffect } from 'react';
import { useToast } from '../../lib/toast';

/**
 * O recado de quem acabou de voltar do Mercado Livre.
 *
 * POR QUE AQUI, E NÃO NA TELA DE INTEGRAÇÕES
 *
 * A autorização termina com o Mercado Livre devolvendo a pessoa para
 * `/dashboard?ml=conectado` — a tela inicial, e não a de Integrações, de onde
 * ela saiu. O aviso vivia só em Integrações, então ninguém o via: a conexão
 * dava certo em silêncio e a pessoa clicava em Conectar de novo, achando que
 * não tinha funcionado.
 *
 * Montado no layout, ele atende qualquer tela do painel onde a volta caia.
 *
 * O ERRO FICA MAIS TEMPO
 *
 * Sucesso é confirmação: lida em um instante. Erro às vezes pede uma decisão
 * — "esta conta já está ligada a outro FORNEXA" manda desconectar lá antes —
 * e seis segundos não bastam para ler e entender. Ele fica meio minuto, e tem
 * X para quem já leu.
 */
export default function AvisoDeConexaoMl() {
  const { mostrarToast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const estado = params.get('ml');

    if (!estado) return;

    if (estado === 'conectado') {
      mostrarToast('Conta conectada com sucesso!', 'sucesso');
    } else if (estado === 'erro') {
      const motivo = params.get('motivo');

      // O único motivo que a pessoa resolve sozinha merece ser dito em
      // português. Os outros são falha interna, e o código cru ajuda o suporte
      // a achar a causa.
      const explicacao =
        motivo === 'conta_ja_ligada'
          ? 'Esta conta do Mercado Livre já está conectada a outra conta do FORNEXA. Cada conta do Mercado Livre só pode estar ligada a uma. Desconecte-a lá antes, ou fale com o suporte.'
          : motivo
            ? `Não foi possível conectar ao Mercado Livre (motivo: ${motivo}).`
            : 'Não foi possível conectar ao Mercado Livre.';

      mostrarToast(explicacao, 'erro', 30000);
    }

    // Limpa o endereço para o recado não voltar a cada atualização da página.
    const limpo = new URL(window.location.href);
    limpo.searchParams.delete('ml');
    limpo.searchParams.delete('motivo');
    window.history.replaceState({}, '', limpo.pathname + limpo.search);
    // Roda uma vez, na entrada do painel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
