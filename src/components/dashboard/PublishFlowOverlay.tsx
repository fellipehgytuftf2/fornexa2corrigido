import MarketplaceBadge from '../ui/marketplace-badge';
import { useTravaScrollDeFundo } from '../../lib/useTravaScrollDeFundo';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, Loader2, Rocket, ShieldCheck, Truck, X } from 'lucide-react';

/**
 * A janela de publicar.
 *
 * Abre por cima do formulário, sem tomar a tela inteira, em três momentos:
 *
 * 1. PRÉVIA — o anúncio montado do jeito que o comprador vai ver no Mercado
 *    Livre: fotos, título, preço, frete e descrição. Antes, o vendedor só via
 *    o resultado depois de publicado, e corrigir um título torto custava uma
 *    edição no anúncio já no ar.
 * 2. PUBLICANDO — a mesma prévia, com o andamento no rodapé.
 * 3. PUBLICADO — o rodapé vira a confirmação, com o link do anúncio.
 */

interface PublishFlowOverlayProps {
  stage: 'preview' | 'publishing' | 'success';
  productName: string;
  productImage: string;
  marketplace: string;
  finalPrice: number;
  profitAmount: number;
  marginPercent: number;
  onPublishingDone: () => void;
  onClose: () => void;
  // Link real do anúncio no Mercado Livre, devolvido pela API depois da
  // publicação de verdade.
  permalink?: string;
  /** Título que vai no anúncio, como o vendedor revisou. */
  titulo?: string;
  /** Fotos na ordem do anúncio; a primeira é a capa. */
  fotos?: string[];
  /** Descrição como vai no anúncio. */
  descricao?: string;
  /** Prazo médio de envio do fornecedor, se houver. */
  prazoDeEnvio?: string | null;
  /** Confirmou na prévia: começa a publicar. */
  onConfirmar?: () => void;
  /** Quer voltar ao formulário para ajustar algo. */
  onVoltar?: () => void;
  /**
   * A publicação de verdade ainda não respondeu. A barra anda até perto do
   * fim e espera: só completa quando a resposta chega.
   */
  aguardandoResposta?: boolean;
}

const ETAPAS = ['Conferindo o produto', 'Preparando as fotos', 'Montando título e descrição', 'Enviando ao Mercado Livre'];

const DURACAO_MINIMA_MS = 2600;
const TETO_SEM_RESPOSTA = 92;

const reais = (valor: number) =>
  `R$ ${Number(valor || 0)
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

/** Preço no jeito do Mercado Livre: reais grandes, centavos pequenos no alto. */
function PrecoDoMl({ valor }: { valor: number }) {
  const [inteiro, centavos] = Number(valor || 0).toFixed(2).split('.');
  return (
    <p className="flex items-start text-[#333] leading-none">
      <span className="text-[34px] font-light tabular-nums">
        R$ {inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
      </span>
      <span className="text-base font-light tabular-nums mt-1 ml-0.5">{centavos}</span>
    </p>
  );
}

export default function PublishFlowOverlay({
  stage,
  productName,
  productImage,
  marketplace,
  finalPrice,
  profitAmount,
  marginPercent,
  onPublishingDone,
  onClose,
  permalink,
  titulo,
  fotos,
  descricao,
  prazoDeEnvio,
  onConfirmar,
  onVoltar,
  aguardandoResposta = false,
}: PublishFlowOverlayProps) {
  useTravaScrollDeFundo(true);

  const imagens = fotos && fotos.length > 0 ? fotos : [productImage];
  const [fotoAtiva, setFotoAtiva] = useState(0);
  const [progresso, setProgresso] = useState(0);
  const [mostrarAviso, setMostrarAviso] = useState(false);
  const aoTerminar = useRef(onPublishingDone);
  const aguardando = useRef(aguardandoResposta);

  useEffect(() => {
    aoTerminar.current = onPublishingDone;
  }, [onPublishingDone]);

  useEffect(() => {
    aguardando.current = aguardandoResposta;
  }, [aguardandoResposta]);

  useEffect(() => {
    if (stage !== 'publishing') return;

    setProgresso(0);
    const inicio = Date.now();
    let quadro: number;
    let terminou = false;

    const passo = () => {
      const decorrido = Date.now() - inicio;
      const alvo = Math.min(100, (decorrido / DURACAO_MINIMA_MS) * 100);
      const valor = aguardando.current
        ? Math.min(alvo, TETO_SEM_RESPOSTA + Math.min(5, (decorrido - DURACAO_MINIMA_MS) / 2000))
        : alvo;

      setProgresso(Math.max(0, valor));

      if (valor >= 100 && !terminou) {
        terminou = true;
        setTimeout(() => aoTerminar.current(), 300);
        return;
      }

      quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [stage]);

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return;
      if (stage === 'preview') (onVoltar ?? onClose)();
      if (stage === 'success') onClose();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [stage, onVoltar, onClose]);

  const etapaAtual = Math.min(ETAPAS.length - 1, Math.floor((progresso / 100) * ETAPAS.length));
  const nome = titulo || productName;
  const freteGratis = finalPrice >= 79;

  const verAnuncio = () => {
    if (permalink) {
      window.open(permalink, '_blank', 'noopener,noreferrer');
      return;
    }
    setMostrarAviso(true);
    setTimeout(() => setMostrarAviso(false), 2500);
  };

  const fechar = () => {
    if (stage === 'publishing') return;
    if (stage === 'preview') (onVoltar ?? onClose)();
    else onClose();
  };

  // z-[110] fica acima do modal que abriu esta janela (z-[100]).
  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="publicar-titulo">
      <button
        type="button"
        aria-label="Fechar"
        onClick={fechar}
        className="absolute inset-0 bg-[#06151E]/60 backdrop-blur-[2px] publicar-fundo cursor-default"
      />

      <div className="relative w-full sm:max-w-5xl max-h-[94vh] sm:max-h-[90vh] flex flex-col bg-white dark:bg-navy-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden publicar-janela">
        {/* Cabeçalho */}
        <header className="flex items-start gap-3 px-5 sm:px-6 py-4 border-b border-gray-200 dark:border-navy-700">
          <div className="min-w-0">
            <h2 id="publicar-titulo" className="text-navy-900 dark:text-white font-bold">
              {stage === 'success' ? 'Anúncio publicado' : 'Prévia do anúncio'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
              Assim o comprador vai ver no
              <MarketplaceBadge marketplace={marketplace} className="font-semibold text-navy-900 dark:text-white" />
            </p>
          </div>
          <button
            type="button"
            onClick={fechar}
            disabled={stage === 'publishing'}
            aria-label="Fechar"
            className="ml-auto w-9 h-9 shrink-0 rounded-full bg-gray-100 dark:bg-navy-700 flex items-center justify-center text-navy-900 dark:text-white hover:bg-gray-200 dark:hover:bg-navy-600 disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* A página do anúncio, no estilo do Mercado Livre */}
        <div className="flex-1 overflow-y-auto bg-[#EDEDED] p-3 sm:p-5">
          <div className={`relative bg-white rounded-xl shadow-sm transition-opacity ${stage === 'publishing' ? 'opacity-70' : ''}`}>
            {stage === 'success' && (
              <span className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-green-600 text-white text-xs font-bold px-3 py-1.5 shadow publicar-surge">
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
                No ar
              </span>
            )}

            <div className="grid md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-5 p-4 sm:p-6">
              {/* Galeria */}
              <div className="flex gap-3 min-w-0">
                {imagens.length > 1 && (
                  <div className="hidden sm:flex flex-col gap-2 shrink-0">
                    {imagens.slice(0, 6).map((foto, indice) => (
                      <button
                        key={foto + indice}
                        type="button"
                        onMouseEnter={() => setFotoAtiva(indice)}
                        onClick={() => setFotoAtiva(indice)}
                        className={`w-12 h-12 rounded-md overflow-hidden border-2 bg-white ${
                          fotoAtiva === indice ? 'border-[#3483FA]' : 'border-gray-200'
                        }`}
                      >
                        <img src={foto} alt="" className="w-full h-full object-contain" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex-1 min-w-0 aspect-square max-h-[380px] flex items-center justify-center bg-white">
                  <img src={imagens[fotoAtiva] ?? imagens[0]} alt={nome} className="max-w-full max-h-full object-contain" />
                </div>
              </div>

              {/* Compra */}
              <div className="min-w-0 rounded-lg md:border md:border-gray-200 md:p-5">
                <p className="text-xs text-gray-500">Novo</p>
                <h3 className="mt-1 text-[22px] leading-snug font-semibold text-[#333]">{nome}</h3>

                <div className="mt-4">
                  <PrecoDoMl valor={finalPrice} />
                </div>

                <div className="mt-4 space-y-1.5 text-sm">
                  {freteGratis ? (
                    <p className="flex items-center gap-2 text-[#00A650] font-semibold">
                      <Truck className="w-4 h-4" />
                      Frete grátis
                    </p>
                  ) : (
                    <p className="flex items-center gap-2 text-[#333]">
                      <Truck className="w-4 h-4 text-gray-500" />
                      Frete calculado na compra
                    </p>
                  )}
                  {prazoDeEnvio && <p className="text-gray-500 pl-6">Sai do fornecedor em {prazoDeEnvio}</p>}
                </div>

                <p className="mt-4 text-sm font-semibold text-[#333]">Estoque disponível</p>

                <div className="mt-4 grid gap-2">
                  <span className="w-full text-center rounded-md bg-[#3483FA] text-white text-sm font-semibold py-3">Comprar agora</span>
                  <span className="w-full text-center rounded-md bg-[#E3EDFB] text-[#3483FA] text-sm font-semibold py-3">Adicionar ao carrinho</span>
                </div>

                <p className="mt-4 flex items-start gap-2 text-xs text-gray-500">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  Compra Garantida: receba o produto que está esperando ou devolvemos o dinheiro.
                </p>
              </div>
            </div>

            {descricao && (
              <div className="border-t border-gray-200 px-4 sm:px-6 py-5">
                <h4 className="text-lg text-[#333]">Descrição</h4>
                <p className="mt-3 text-sm text-gray-600 leading-relaxed whitespace-pre-line">{descricao}</p>
              </div>
            )}
          </div>
        </div>

        {/* Rodapé: muda conforme o momento */}
        <footer className="border-t border-gray-200 dark:border-navy-700 px-5 sm:px-6 py-4 bg-white dark:bg-navy-800">
          {stage === 'preview' && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex gap-5 text-sm">
                <div>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400">Preço</p>
                  <p className="font-bold text-navy-900 dark:text-white tabular-nums">{reais(finalPrice)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400">Seu lucro por venda</p>
                  <p className={`font-bold tabular-nums ${profitAmount < 0 ? 'text-red-600' : 'text-green-600 dark:text-green-400'}`}>
                    {reais(profitAmount)} · {Math.round(marginPercent)}%
                  </p>
                </div>
              </div>
              <div className="flex gap-2.5 sm:ml-auto">
                <button
                  type="button"
                  onClick={onVoltar ?? onClose}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm font-semibold hover:bg-gray-50 dark:hover:bg-navy-700"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar<span className="hidden sm:inline">&nbsp;e editar</span>
                </button>
                <button
                  type="button"
                  onClick={onConfirmar}
                  className="flex-[1.4] sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gold hover:bg-gold-hover text-navy-900 text-sm font-bold"
                >
                  <Rocket className="w-4 h-4" />
                  Publicar agora
                </button>
              </div>
            </div>
          )}

          {stage === 'publishing' && (
            <div role="status" aria-live="polite">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-semibold text-navy-900 dark:text-white">
                  <Loader2 className="w-4 h-4 animate-spin text-gold-hover" />
                  {ETAPAS[etapaAtual]}...
                </span>
                <span className="font-bold tabular-nums text-navy-900 dark:text-white">{Math.round(progresso)}%</span>
              </div>
              <div className="mt-2.5 h-2 rounded-full bg-gray-100 dark:bg-navy-700 overflow-hidden">
                <div className="h-full rounded-full bg-gold transition-[width] duration-150 ease-linear" style={{ width: `${progresso}%` }} />
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                {aguardandoResposta && progresso >= TETO_SEM_RESPOSTA
                  ? 'O Mercado Livre está terminando de responder. Não feche esta janela.'
                  : 'Leva só alguns segundos.'}
              </p>
            </div>
          )}

          {stage === 'success' && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center shrink-0 publicar-surge">
                  <Check className="w-5 h-5" strokeWidth={3} />
                </span>
                <div>
                  <p className="font-bold text-navy-900 dark:text-white">Seu anúncio está no ar!</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Lucro de <span className="font-semibold text-green-600 dark:text-green-400 tabular-nums">{reais(profitAmount)}</span> a cada venda. Ele já aparece em Meus Anúncios.
                  </p>
                </div>
              </div>
              <div className="flex gap-2.5 sm:ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-4 py-3 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm font-semibold hover:bg-gray-50 dark:hover:bg-navy-700"
                >
                  Anunciar outro
                </button>
                <button
                  type="button"
                  onClick={verAnuncio}
                  className="flex-[1.4] sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gold hover:bg-gold-hover text-navy-900 text-sm font-bold"
                >
                  <ExternalLink className="w-4 h-4" />
                  Ver no Mercado Livre
                </button>
              </div>
            </div>
          )}
        </footer>
      </div>

      {mostrarAviso && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-navy-900 text-white text-sm px-5 py-3 rounded-xl shadow-lg z-[120]">
          O link ainda não chegou. O anúncio aparece em Meus Anúncios.
        </div>
      )}

      <style>{`
        .publicar-fundo { animation: publicarFundo 180ms ease-out; }
        .publicar-janela { animation: publicarJanela 240ms cubic-bezier(.2,.9,.3,1); }
        .publicar-surge { animation: publicarSurge 380ms cubic-bezier(.2,1.4,.4,1); }
        @keyframes publicarFundo { from { opacity: 0; } to { opacity: 1; } }
        @keyframes publicarJanela { from { opacity: 0; transform: translateY(18px) scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes publicarSurge { from { transform: scale(.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .publicar-fundo, .publicar-janela, .publicar-surge { animation: none; }
        }
      `}</style>
    </div>
  );
}
