import { Check, ImageIcon, User, X } from 'lucide-react';
import ModalPortal from '../../ui/modal-portal';
import { useTravaScrollDeFundo } from '../../../lib/useTravaScrollDeFundo';
import { AvisoDeQuemPublica, CampoDaMensagem, EscolhaDeTom, IconeDoCanal } from './partes';
import {
  CANAIS,
  formatarReais,
  useAberturaAnimada,
  useDivulgacao,
  type DadosDaDivulgacao,
} from './useDivulgacao';

/**
 * Formato "estúdio": janela grande com a prévia do post do lado — a pessoa vê
 * como o anúncio vai aparecer no grupo antes de copiar.
 */
export default function DivulgarEstudio({
  aoFechar,
  ...dados
}: DadosDaDivulgacao & { aoFechar: () => void }) {
  useTravaScrollDeFundo(true);
  const { aberto, fechar } = useAberturaAnimada(aoFechar, 260);
  const divulgacao = useDivulgacao(dados);

  // O link vira o card de baixo no Facebook; no texto da prévia ele sai.
  const textoDaPrevia = divulgacao.mensagem.replace(dados.linkDoAnuncio, '').trim();
  let dominio = 'mercadolivre.com.br';
  try {
    dominio = new URL(dados.linkDoAnuncio).hostname.replace(/^www\./, '');
  } catch {
    // Link fora do padrão: fica o domínio genérico.
  }

  return (
    <ModalPortal>
      <div
        className={`fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 bg-navy-950/60 transition-opacity duration-200 motion-reduce:transition-none ${
          aberto ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          type="button"
          aria-label="Fechar"
          tabIndex={-1}
          onClick={fechar}
          className="absolute inset-0 w-full h-full cursor-default"
        />

        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="estudio-titulo"
          className={`relative w-full max-w-5xl max-h-full overflow-y-auto rounded-3xl bg-white dark:bg-navy-800 shadow-2xl transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none ${
            aberto ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-3'
          }`}
        >
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="bg-gray-50 dark:bg-navy-900 p-6 sm:p-8 flex flex-col gap-4 lg:rounded-l-3xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                Como vai aparecer no grupo
              </p>

              <article className="rounded-2xl bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 overflow-hidden shadow-sm">
                <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                  <span className="w-10 h-10 rounded-full bg-navy-900 text-gold flex items-center justify-center">
                    <User className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-navy-900 dark:text-white">Seu nome</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">no grupo · agora</p>
                  </div>
                </div>
                <p className="px-4 pb-3 text-sm leading-relaxed text-navy-900 dark:text-slate-100 whitespace-pre-line">
                  {textoDaPrevia}
                </p>
                <div className="border-t border-gray-100 dark:border-navy-700 bg-gray-50 dark:bg-navy-900">
                  {dados.imagem ? (
                    <img src={dados.imagem} alt="" className="w-full aspect-[1.91/1] object-contain bg-white" />
                  ) : (
                    <div className="w-full aspect-[1.91/1] flex items-center justify-center text-gray-400">
                      <ImageIcon className="w-8 h-8" aria-hidden="true" />
                    </div>
                  )}
                  <div className="px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400">
                      {dominio}
                    </p>
                    <p className="text-sm font-semibold text-navy-900 dark:text-white line-clamp-2 mt-0.5">
                      {dados.titulo}
                    </p>
                  </div>
                </div>
              </article>

              <p className="text-xs leading-relaxed text-gray-500 dark:text-slate-400">
                A foto e o título do card vêm do próprio Mercado Livre quando o link é colado. A
                prévia é aproximada.
              </p>
            </div>

            <div className="p-6 sm:p-8 flex flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                    Divulgar
                  </p>
                  <h2
                    id="estudio-titulo"
                    className="font-display text-xl font-semibold text-navy-900 dark:text-white leading-snug line-clamp-2 mt-0.5"
                  >
                    {dados.titulo}
                  </h2>
                  {dados.preco ? (
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                      {formatarReais(dados.preco)}
                      {dados.lucro ? ` · você lucra ${formatarReais(dados.lucro)}` : ''}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={fechar}
                  aria-label="Fechar"
                  className="w-11 h-11 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-navy-700 shrink-0"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>

              <EscolhaDeTom tom={divulgacao.tom} aoEscolher={divulgacao.escolherTom} />
              <CampoDaMensagem
                id="estudio-mensagem"
                valor={divulgacao.mensagem}
                aoMudar={divulgacao.setMensagem}
              />

              <div className="grid grid-cols-2 gap-2.5">
                {CANAIS.map((canal) => {
                  const pronto = divulgacao.feito === canal.id;
                  const principal = canal.id === 'grupos';
                  return (
                    <button
                      key={canal.id}
                      type="button"
                      onClick={() => divulgacao.usarCanal(canal.id)}
                      className={`min-h-[52px] inline-flex items-center justify-center gap-2 px-3 rounded-xl text-sm font-semibold border transition-colors ${
                        pronto
                          ? 'bg-gold/20 border-gold text-navy-900 dark:text-white'
                          : principal
                            ? 'bg-gold border-gold text-navy-900 hover:bg-gold-hover'
                            : 'border-gray-200 dark:border-navy-700 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700'
                      }`}
                    >
                      {pronto ? (
                        <Check className="w-4 h-4" strokeWidth={2.6} aria-hidden="true" />
                      ) : (
                        <IconeDoCanal canal={canal.id} className="w-4 h-4" />
                      )}
                      {pronto ? 'Feito!' : canal.nome}
                    </button>
                  );
                })}
              </div>

              <AvisoDeQuemPublica />
            </div>
          </div>
        </section>
      </div>
    </ModalPortal>
  );
}
