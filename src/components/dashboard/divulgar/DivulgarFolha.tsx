import { X } from 'lucide-react';
import ModalPortal from '../../ui/modal-portal';
import { useTravaScrollDeFundo } from '../../../lib/useTravaScrollDeFundo';
import { AvisoDeQuemPublica, CampoDaMensagem, EscolhaDeTom, ListaDeCanais } from './partes';
import { formatarReais, useAberturaAnimada, useDivulgacao, type DadosDaDivulgacao } from './useDivulgacao';

/**
 * Formato "folha": sobe de baixo com a faixa azul petróleo e a mesma curva do
 * login — o mesmo gesto da entrada no FORNEXA, agora para divulgar.
 */
export default function DivulgarFolha({
  aoFechar,
  ...dados
}: DadosDaDivulgacao & { aoFechar: () => void }) {
  useTravaScrollDeFundo(true);
  const { aberto, fechar } = useAberturaAnimada(aoFechar, 520);
  const divulgacao = useDivulgacao(dados);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[200]">
        <button
          type="button"
          aria-label="Fechar"
          tabIndex={-1}
          onClick={fechar}
          className={`absolute inset-0 w-full h-full bg-navy-950/60 transition-opacity duration-300 motion-reduce:transition-none ${
            aberto ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="folha-titulo"
          className={`absolute inset-x-0 bottom-0 mx-auto w-full max-w-4xl max-h-[92dvh] flex flex-col rounded-t-[28px] overflow-hidden shadow-[0_-24px_60px_-20px_rgba(4,16,22,0.6)] transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none ${
            aberto ? 'translate-y-0' : 'translate-y-[110%]'
          }`}
        >
          <header className="relative bg-navy-950 text-white px-6 sm:px-8 pt-6 pb-14 shrink-0">
            <div className="flex items-center gap-4 sm:gap-5">
              {dados.imagem && (
                <img
                  src={dados.imagem}
                  alt=""
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover bg-white shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">Divulgar</p>
                <h2
                  id="folha-titulo"
                  className="font-display text-lg sm:text-2xl font-semibold tracking-tight leading-snug line-clamp-2 mt-1"
                >
                  {dados.titulo}
                </h2>
                {dados.preco ? (
                  <p className="text-sm text-slate-400 mt-1">
                    {formatarReais(dados.preco)}
                    {dados.lucro ? ` · você lucra ${formatarReais(dados.lucro)} por venda` : ''}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={fechar}
                aria-label="Fechar"
                className="w-11 h-11 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 shrink-0"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <svg
              aria-hidden="true"
              viewBox="0 0 390 60"
              preserveAspectRatio="none"
              className="absolute left-0 -bottom-px w-full h-12 block"
            >
              <path
                d="M0,40 C80,62 150,70 235,62 C310,55 360,30 390,0 L390,60 L0,60 Z"
                className="fill-white dark:fill-navy-800"
              />
            </svg>
          </header>

          <div className="bg-white dark:bg-navy-800 overflow-y-auto px-6 sm:px-8 pb-6 pt-1">
            <div
              className={`grid gap-6 md:grid-cols-[280px_minmax(0,1fr)] transition-all duration-500 delay-500 motion-reduce:transition-none ${
                aberto ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
            >
              <div className="flex flex-col gap-3 order-2 md:order-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  Levar para
                </p>
                <ListaDeCanais feito={divulgacao.feito} aoUsar={divulgacao.usarCanal} />
              </div>

              <div className="flex flex-col gap-3 order-1 md:order-2">
                <EscolhaDeTom tom={divulgacao.tom} aoEscolher={divulgacao.escolherTom} />
                <CampoDaMensagem
                  id="folha-mensagem"
                  valor={divulgacao.mensagem}
                  aoMudar={divulgacao.setMensagem}
                  linhas={7}
                />
                <AvisoDeQuemPublica />
              </div>
            </div>
          </div>
        </section>
      </div>
    </ModalPortal>
  );
}
