import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import ModalPortal from '../../ui/modal-portal';
import { useTravaScrollDeFundo } from '../../../lib/useTravaScrollDeFundo';
import { CampoDaMensagem, EscolhaDeTom, IconeDoCanal } from './partes';
import { CANAIS, useAberturaAnimada, useDivulgacao, type DadosDaDivulgacao } from './useDivulgacao';
import DivulgarFolha from './DivulgarFolha';

export interface Ancora {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

const LARGURA = 400;
const ALTURA_ESTIMADA = 380;
const MARGEM = 12;

/**
 * Formato "balão": nasce do próprio botão Divulgar, sem tirar a pessoa da
 * página. Um clique por canal — o bloco copia o texto certo e já abre o lugar.
 *
 * Em tela de celular, ou sem a posição do botão, vira a folha que sobe: um
 * balão de 400px não cabe ali.
 */
export default function DivulgarBalao(
  props: DadosDaDivulgacao & { aoFechar: () => void; ancora: Ancora | null }
) {
  const cabeBalao =
    props.ancora !== null && typeof window !== 'undefined' && window.innerWidth >= 640;

  if (!cabeBalao) {
    const { ancora: _ancora, ...resto } = props;
    void _ancora;
    return <DivulgarFolha {...resto} />;
  }

  return <Balao {...props} ancora={props.ancora as Ancora} />;
}

function Balao({
  aoFechar,
  ancora,
  ...dados
}: DadosDaDivulgacao & { aoFechar: () => void; ancora: Ancora }) {
  useTravaScrollDeFundo(true);
  const { aberto, fechar } = useAberturaAnimada(aoFechar, 260);
  const divulgacao = useDivulgacao(dados);
  const [verMensagem, setVerMensagem] = useState(false);

  const centroDoBotao = ancora.left + ancora.width / 2;
  const esquerda = Math.min(
    Math.max(centroDoBotao - 70, MARGEM),
    window.innerWidth - LARGURA - MARGEM
  );
  const cabeEmbaixo = ancora.bottom + MARGEM + ALTURA_ESTIMADA < window.innerHeight;
  const posicao = cabeEmbaixo
    ? { top: ancora.bottom + MARGEM }
    : { bottom: window.innerHeight - ancora.top + MARGEM };
  const setaEsquerda = centroDoBotao - esquerda - 8;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[200]">
        <button
          type="button"
          aria-label="Fechar"
          tabIndex={-1}
          onClick={fechar}
          className={`absolute inset-0 w-full h-full bg-navy-950/20 cursor-default transition-opacity duration-200 motion-reduce:transition-none ${
            aberto ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="balao-titulo"
          style={{
            left: esquerda,
            width: LARGURA,
            ...posicao,
            transformOrigin: `${setaEsquerda + 8}px ${cabeEmbaixo ? '0' : '100%'}`,
          }}
          className={`absolute rounded-3xl bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 p-5 shadow-[0_30px_60px_-20px_rgba(4,16,22,0.45)] transition-all duration-[450ms] ease-[cubic-bezier(.3,1.35,.45,1)] motion-reduce:transition-none ${
            aberto ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.35]'
          }`}
        >
          <span
            aria-hidden="true"
            style={{ left: setaEsquerda }}
            className={`absolute w-4 h-4 rotate-45 bg-white dark:bg-navy-800 border-gray-200 dark:border-navy-700 ${
              cabeEmbaixo ? '-top-2 border-l border-t' : '-bottom-2 border-r border-b'
            }`}
          />

          <h2 id="balao-titulo" className="font-display text-base font-semibold text-navy-900 dark:text-white">
            Divulgar em um clique
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5 mb-4">
            Cada botão copia o texto certo e já abre o lugar.
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            {CANAIS.map((canal, indice) => {
              const pronto = divulgacao.feito === canal.id;
              return (
                <button
                  key={canal.id}
                  type="button"
                  onClick={() => divulgacao.usarCanal(canal.id)}
                  style={{ transitionDelay: aberto ? `${120 + indice * 60}ms` : '0ms' }}
                  className={`min-h-[104px] flex flex-col items-start gap-1.5 p-3.5 rounded-2xl border text-left transition-all duration-[450ms] ease-[cubic-bezier(.3,1.4,.45,1)] motion-reduce:transition-none ${
                    aberto ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-90'
                  } ${
                    pronto
                      ? 'border-gold bg-gold/15'
                      : 'border-gray-200 dark:border-navy-700 hover:border-navy-900 dark:hover:border-slate-400'
                  }`}
                >
                  <span
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      pronto ? 'bg-gold text-navy-900' : 'bg-navy-900 text-gold dark:bg-navy-950'
                    }`}
                  >
                    {pronto ? (
                      <Check className="w-5 h-5" strokeWidth={2.6} aria-hidden="true" />
                    ) : (
                      <IconeDoCanal canal={canal.id} className="w-5 h-5" />
                    )}
                  </span>
                  <span className="text-[15px] font-semibold text-navy-900 dark:text-white">
                    {pronto ? 'Feito!' : canal.nome}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setVerMensagem(!verMensagem)}
            aria-expanded={verMensagem}
            className="mt-3 w-full min-h-[44px] flex items-center justify-between px-1 text-sm font-semibold text-navy-900 dark:text-white"
          >
            {verMensagem ? 'Esconder a mensagem' : 'Ver e editar a mensagem'}
            <ChevronDown
              className={`w-4 h-4 transition-transform ${verMensagem ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>

          {verMensagem && (
            <div className="flex flex-col gap-3 pt-1">
              <EscolhaDeTom tom={divulgacao.tom} aoEscolher={divulgacao.escolherTom} />
              <CampoDaMensagem
                id="balao-mensagem"
                valor={divulgacao.mensagem}
                aoMudar={divulgacao.setMensagem}
                linhas={4}
              />
            </div>
          )}
        </section>
      </div>
    </ModalPortal>
  );
}
