import { useState } from 'react';
import { Copy, ExternalLink, Search, Share2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import ModalPortal from '../ui/modal-portal';

interface Props {
  /** O anúncio que vai ser divulgado. */
  produtoId: string;
  titulo: string;
  categoria: string;
  /** O mesmo endereço que o botão "Ver anúncio" abre. */
  linkDoAnuncio: string;
  aoFechar: () => void;
}

/**
 * O texto pronto para divulgar o anúncio fora do Mercado Livre.
 *
 * POR QUE NÃO PUBLICA SOZINHO
 *
 * Desde junho de 2026 a Meta não permite que ferramenta de terceiro publique
 * em grupo do Facebook, nem consulte grupos pela API. Qualquer coisa que
 * prometesse publicar por conta própria seria mentira — ou conta banida.
 *
 * O que dá para fazer, e é o que esta tela faz: deixar a mensagem escrita com
 * o link certo, abrir a busca de grupos do nicho e abrir o compartilhamento.
 * Os quatro passos que a pessoa fazia na mão viram três cliques, e quem
 * publica continua sendo ela.
 */
export default function DivulgarNoFacebook({
  produtoId,
  titulo,
  categoria,
  linkDoAnuncio,
  aoFechar,
}: Props) {
  const { mostrarToast } = useToast();

  const [mensagem, setMensagem] = useState(
    `Achei esse produto em promoção! ${titulo}\n${linkDoAnuncio}`
  );

  const registrar = (acao: 'copiou' | 'buscou_grupos' | 'compartilhou') => {
    // Medição não atrapalha a ação: se falhar, a pessoa nem fica sabendo, e o
    // texto continua copiado.
    supabase.rpc('registrar_divulgacao', {
      p_user_product_id: produtoId,
      p_acao: acao,
    });
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensagem);
    } catch {
      // Navegador antigo, ou página sem HTTPS: a área de transferência moderna
      // não existe. O caminho velho ainda funciona em todos eles.
      const campo = document.createElement('textarea');
      campo.value = mensagem;
      campo.style.position = 'fixed';
      campo.style.opacity = '0';
      document.body.appendChild(campo);
      campo.select();

      try {
        document.execCommand('copy');
      } catch {
        mostrarToast('Não foi possível copiar. Selecione o texto e copie na mão.', 'erro');
        document.body.removeChild(campo);
        return;
      }

      document.body.removeChild(campo);
    }

    registrar('copiou');
    mostrarToast('Texto copiado!', 'sucesso', 3000);
  };

  const buscarGrupos = () => {
    registrar('buscou_grupos');

    window.open(
      `https://www.facebook.com/search/groups/?q=${encodeURIComponent(categoria)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const compartilhar = () => {
    registrar('compartilhou');

    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(linkDoAnuncio)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const passos = [
    'Revise ou edite a mensagem abaixo — ela já vem com o link do seu anúncio.',
    'Copie o texto.',
    'Busque grupos do seu nicho, ou pule direto para compartilhar.',
    'Dentro do Facebook, cole o texto e publique no grupo ou no seu perfil.',
  ];

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 py-6">
        <div className="w-full max-w-xl max-h-full overflow-y-auto rounded-2xl bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 shadow-2xl">
          <div className="flex items-start justify-between gap-4 p-6 pb-0">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Share2
                  className="w-5 h-5 text-blue-600 dark:text-blue-400"
                  aria-hidden="true"
                />
              </span>

              <h2 className="text-lg font-bold text-navy-900 dark:text-white">
                Divulgar no Facebook
              </h2>
            </div>

            <button
              type="button"
              onClick={aoFechar}
              aria-label="Fechar"
              className="text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="p-6">
            <ol className="space-y-1.5 text-sm text-gray-600 dark:text-slate-300">
              {passos.map((passo, indice) => (
                <li key={passo} className="flex gap-2.5 leading-relaxed">
                  <span className="font-semibold text-navy-900 dark:text-white shrink-0">
                    {indice + 1}.
                  </span>
                  {passo}
                </li>
              ))}
            </ol>

            <label
              htmlFor="mensagem-da-divulgacao"
              className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500 mt-5 mb-2"
            >
              Mensagem
            </label>

            <textarea
              id="mensagem-da-divulgacao"
              value={mensagem}
              onChange={(evento) => setMensagem(evento.target.value)}
              rows={4}
              className="w-full px-3.5 py-3 rounded-xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-700 text-sm text-navy-900 dark:text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            />

            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              <button
                type="button"
                onClick={copiar}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-gold-hover"
              >
                <Copy className="w-4 h-4" aria-hidden="true" />
                Copiar texto
              </button>

              <button
                type="button"
                onClick={buscarGrupos}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-navy-700 px-4 py-3 text-sm font-semibold text-navy-900 dark:text-white transition-colors hover:bg-gray-50 dark:hover:bg-navy-700"
              >
                <Search className="w-4 h-4" aria-hidden="true" />
                Buscar grupos do nicho
              </button>

              <button
                type="button"
                onClick={compartilhar}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-navy-700 px-4 py-3 text-sm font-semibold text-navy-900 dark:text-white transition-colors hover:bg-gray-50 dark:hover:bg-navy-700"
              >
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
                Compartilhar
              </button>
            </div>

            {/* As duas coisas que a pessoa descobriria sozinha, do jeito ruim:
                que o Facebook ignora texto no compartilhamento, e que quem
                publica é ela. */}
            <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed mt-4">
              O compartilhamento do Facebook leva só o link — ele não aceita texto
              pronto, é limite deles. Por isso copie a mensagem antes e cole lá.
            </p>

            <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed mt-2">
              A publicação é feita por você, diretamente no Facebook. A FORNEXA só
              prepara o texto e os links para facilitar.
            </p>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
