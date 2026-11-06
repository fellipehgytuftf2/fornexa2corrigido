import { X } from 'lucide-react';
import ModalPortal from '../../ui/modal-portal';
import { useTravaScrollDeFundo } from '../../../lib/useTravaScrollDeFundo';
import { AvisoDeQuemPublica, CampoDaMensagem, EscolhaDeTom, ListaDeCanais } from './partes';
import { formatarReais, useAberturaAnimada, useDivulgacao, type DadosDaDivulgacao } from './useDivulgacao';

/** Formato "gaveta": painel que desliza da direita, com a página visível ao lado. */
export default function DivulgarGaveta({
  aoFechar,
  ...dados
}: DadosDaDivulgacao & { aoFechar: () => void }) {
  useTravaScrollDeFundo(true);
  const { aberto, fechar } = useAberturaAnimada(aoFechar, 420);
  const divulgacao = useDivulgacao(dados);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[200]">
        <button
          type="button"
          aria-label="Fechar"
          tabIndex={-1}
          onClick={fechar}
          className={`absolute inset-0 w-full h-full bg-navy-950/50 transition-opacity duration-300 motion-reduce:transition-none ${
            aberto ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="gaveta-titulo"
          className={`absolute top-0 right-0 bottom-0 w-full sm:w-[480px] bg-white dark:bg-navy-800 shadow-[-24px_0_60px_-20px_rgba(4,16,22,0.45)] flex flex-col transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none ${
            aberto ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-start gap-4 p-6 pb-5 border-b border-gray-100 dark:border-navy-700">
            {dados.imagem && (
              <img src={dados.imagem} alt="" className="w-16 h-16 rounded-xl object-contain bg-white border border-gray-100 dark:border-navy-700 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                Divulgar
              </p>
              <h2
                id="gaveta-titulo"
                className="font-display text-lg font-semibold text-navy-900 dark:text-white leading-snug line-clamp-2 mt-0.5"
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

          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
            <section
              className={`flex flex-col gap-3 transition-all duration-500 delay-200 motion-reduce:transition-none ${
                aberto ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-6'
              }`}
            >
              <EscolhaDeTom tom={divulgacao.tom} aoEscolher={divulgacao.escolherTom} />
              <CampoDaMensagem
                id="gaveta-mensagem"
                valor={divulgacao.mensagem}
                aoMudar={divulgacao.setMensagem}
              />
            </section>

            <section
              className={`flex flex-col gap-3 transition-all duration-500 delay-300 motion-reduce:transition-none ${
                aberto ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-6'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                Levar para
              </p>
              <ListaDeCanais feito={divulgacao.feito} aoUsar={divulgacao.usarCanal} />
            </section>
          </div>

          <AvisoDeQuemPublica className="px-6 py-4 border-t border-gray-100 dark:border-navy-700" />
        </aside>
      </div>
    </ModalPortal>
  );
}
