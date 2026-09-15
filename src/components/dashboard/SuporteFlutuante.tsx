import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Headset, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import MinhaConversaDeSuporte from './MinhaConversaDeSuporte';
import SuporteAdmin from './SuporteAdmin';

/**
 * O suporte, num balão no canto inferior direito.
 *
 * POR QUE FLUTUANTE, E NÃO UMA PÁGINA
 *
 * A dúvida nasce no meio de outra coisa — publicando um anúncio, olhando um
 * pedido travado. Item de menu obriga a sair de onde o problema está, e quem
 * sai perde o print que ia mandar. O balão fica onde a pessoa já está.
 *
 * É também o formato que todo mundo já conhece de outros sites, então ninguém
 * precisa aprender que ali se fala com gente.
 *
 * DOS DOIS LADOS
 *
 * Para quem pergunta, abre a própria conversa. Para o admin, abre a lista de
 * quem escreveu — ele responde de onde estiver, sem largar a tela em que
 * estava. O painel dele é mais largo porque tem lista e conversa lado a lado.
 */
export default function SuporteFlutuante() {
  const [aberto, setAberto] = useState(false);
  const [ehAdmin, setEhAdmin] = useState<boolean | null>(null);
  const [naoLidas, setNaoLidas] = useState(0);

  useEffect(() => {
    let vivo = true;
    let papelAdmin = false;

    /**
     * Quantas mensagens esperam por quem está olhando.
     *
     * Para o admin, conversas sem resposta. Para o resto, respostas que ele
     * ainda não leu. São perguntas diferentes com o mesmo destino: o número
     * vermelho no balão.
     */
    const contar = async () => {
      const { data } = await supabase.rpc(
        papelAdmin ? 'suporte_esperando' : 'suporte_nao_lidas'
      );

      if (vivo) setNaoLidas(Number(data ?? 0));
    };

    const conferir = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !vivo) return;

      const { data: perfil } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle<{ role: string | null }>();

      if (!vivo) return;

      papelAdmin = perfil?.role === 'admin';
      setEhAdmin(papelAdmin);

      await contar();
    };

    conferir();

    // De minuto em minuto. Não é conversa em tempo real — é aviso de que
    // alguém está esperando, e um minuto de atraso nisso não muda nada. Com
    // tempo real seria uma conexão aberta por aba, o dia todo, para mostrar um
    // algarismo que quase sempre é zero.
    const relogio = window.setInterval(contar, 60000);

    // Voltar para a aba confere na hora: quem passou meia hora no Mercado
    // Livre volta querendo saber o que chegou, não esperar o próximo minuto.
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') contar();
    };

    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      vivo = false;
      window.clearInterval(relogio);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, []);

  // O painel ficava aberto por cima de tudo: abrir o menu ou trocar de página
  // deixava o chat tapando a tela que a pessoa foi buscar.
  const painel = useRef<HTMLDivElement | null>(null);
  const botao = useRef<HTMLButtonElement | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    setAberto(false);
  }, [pathname]);

  useEffect(() => {
    if (!aberto) return;

    const aoClicar = (evento: MouseEvent | TouchEvent) => {
      const alvo = evento.target as Node;

      // Só conta clique na tela do app. Janela aberta por cima (perfil do
      // cliente, foto ampliada) é montada fora dela, e clicar ali não é sair
      // do suporte.
      if (!document.getElementById('root')?.contains(alvo)) return;
      if (painel.current?.contains(alvo) || botao.current?.contains(alvo)) return;

      setAberto(false);
    };

    document.addEventListener('mousedown', aoClicar);
    document.addEventListener('touchstart', aoClicar);

    return () => {
      document.removeEventListener('mousedown', aoClicar);
      document.removeEventListener('touchstart', aoClicar);
    };
  }, [aberto]);

  // Enquanto não se sabe o papel, não aparece: um balão que troca de conteúdo
  // depois de aberto pisca na cara de quem clicou.
  if (ehAdmin === null) return null;

  // Abrir zera o aviso: a conversa marca como lida ao carregar.
  const alternar = () => {
    setAberto((estava) => !estava);
    setNaoLidas(0);
  };

  return (
    <>
      {aberto && (
        <div
          ref={painel}
          className={`fixed bottom-24 right-4 sm:right-6 z-[120] flex flex-col rounded-2xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-800 shadow-2xl overflow-hidden ${
            ehAdmin
              ? 'w-[min(940px,calc(100vw-2rem))] h-[min(640px,calc(100vh-10rem))]'
              : 'w-[min(400px,calc(100vw-2rem))] h-[min(560px,calc(100vh-10rem))]'
          }`}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-navy-700 shrink-0">
            <p className="font-semibold text-navy-900 dark:text-white flex items-center gap-2">
              <Headset className="w-4 h-4 text-gold" aria-hidden="true" />
              {ehAdmin ? 'Conversas de suporte' : 'Suporte'}
            </p>

            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar"
              className="p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {ehAdmin ? (
              <SuporteAdmin semMoldura />
            ) : (
              <div className="h-full flex flex-col">
                <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed mb-3">
                  Dúvida sobre o sistema, conta ou cobrança. Para problema num
                  pedido, use Chamados — ele avisa o fornecedor junto.
                </p>

                <MinhaConversaDeSuporte />
              </div>
            )}
          </div>
        </div>
      )}

      <button
        ref={botao}
        type="button"
        onClick={alternar}
        aria-label={aberto ? 'Fechar suporte' : 'Abrir suporte'}
        className="fixed bottom-6 right-4 sm:right-6 z-[120] w-14 h-14 rounded-full bg-navy-900 dark:bg-gold text-white dark:text-navy-900 shadow-xl flex items-center justify-center hover:opacity-90 transition-opacity"
      >
        {aberto ? <X className="w-6 h-6" /> : <Headset className="w-6 h-6" />}

        {(!aberto || ehAdmin) && naoLidas > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center tabular-nums">
            {naoLidas}
          </span>
        )}
      </button>
    </>
  );
}
