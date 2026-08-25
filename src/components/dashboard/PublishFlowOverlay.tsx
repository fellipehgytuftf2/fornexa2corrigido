import MarketplaceBadge from '../ui/marketplace-badge';
import { useTravaScrollDeFundo } from '../../lib/useTravaScrollDeFundo';
import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  ExternalLink,
  ArrowLeft,
} from 'lucide-react';

interface PublishFlowOverlayProps {
  stage: 'publishing' | 'success';
  productName: string;
  productImage: string;
  marketplace: string;
  finalPrice: number;
  profitAmount: number;
  marginPercent: number;
  onPublishingDone: () => void;
  onClose: () => void;
  // Link real do anúncio no Mercado Livre, devolvido pela API depois da
  // publicação de verdade. Se não vier (ex: falha ao obter o link), cai
  // no toast "Em breve" como fallback.
  permalink?: string;
}

const CHECKLIST_STEPS = [
  'Validando produto',
  'Calculando margem',
  'Preparando imagens',
  'Gerando descrição otimizada',
  'Conectando ao Mercado Livre',
  'Publicando anúncio...',
];

const TOTAL_DURATION_MS = 4500;

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
}: PublishFlowOverlayProps) {
  useTravaScrollDeFundo(true);

  const [progress, setProgress] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const onDoneRef = useRef(onPublishingDone);

  useEffect(() => {
    onDoneRef.current = onPublishingDone;
  }, [onPublishingDone]);

  useEffect(() => {
    if (stage !== 'publishing') {
      return;
    }

    setProgress(0);

    const startTime = Date.now();
    let animationFrame: number;

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const nextProgress = Math.min(100, (elapsed / TOTAL_DURATION_MS) * 100);

      setProgress(nextProgress);

      if (nextProgress < 100) {
        animationFrame = requestAnimationFrame(tick);
      } else {
        setTimeout(() => {
          onDoneRef.current();
        }, 400);
      }
    };

    animationFrame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [stage]);

  const completedSteps = Math.min(
    CHECKLIST_STEPS.length,
    Math.floor((progress / 100) * CHECKLIST_STEPS.length) + (progress >= 100 ? 0 : 1)
  );

  const formatCurrency = (value: number) => {
    return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
  };

  const handleViewAnnouncement = () => {
    if (permalink) {
      window.open(permalink, '_blank', 'noopener,noreferrer');
      return;
    }

    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  // z-[110] fica acima do modal que abriu esta tela (z-[100]).
  //
  // Os dois vivem no mesmo portal, presos ao corpo do documento, entao quem
  // tem o numero maior ganha. Com o valor antigo, o fundo opaco daqui era
  // pintado por tras do modal: a pagina sumia, o modal continuava por cima e
  // parecia que a tela tinha quebrado ao clicar em Publicar.
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#06151E]">
      {stage === 'publishing' ? (
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[#11212D] border border-[#253745] flex items-center justify-center">
            <span className="text-white font-bold text-2xl">F</span>
          </div>

          <p className="text-[#9BA8AB] text-xs font-semibold tracking-widest uppercase mb-1">
            Publicando em
          </p>

          <div className="flex items-center justify-center mb-8">
            <MarketplaceBadge
              marketplace={marketplace}
              size="md"
              className="text-white text-lg font-bold"
            />
          </div>

          <div className="bg-[#11212D] border border-[#253745] rounded-2xl p-6 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white text-sm font-medium">Enviando anúncio</span>
              <span className="text-[#FFD300] text-sm font-bold">
                {Math.round(progress)}%
              </span>
            </div>

            <div className="h-2 rounded-full bg-[#06151E] overflow-hidden mb-6">
              <div
                className="h-full bg-[#FFD300] rounded-full transition-all duration-150 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="space-y-3">
              {CHECKLIST_STEPS.map((step, index) => {
                const isDone = index < completedSteps - 1 || progress >= 100;
                const isActive = index === completedSteps - 1 && progress < 100;

                return (
                  <div key={step} className="flex items-center gap-3">
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                    ) : isActive ? (
                      <Loader2 className="w-4 h-4 text-[#FFD300] flex-shrink-0 animate-spin" />
                    ) : (
                      <Circle className="w-4 h-4 text-[#253745] flex-shrink-0" />
                    )}

                    <span
                      className={`text-sm ${
                        isDone || isActive ? 'text-white' : 'text-[#9BA8AB]'
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-9 h-9 text-green-400" />
            </div>

            <h2 className="text-white text-2xl font-bold">Produto publicado!</h2>

            <p className="text-[#9BA8AB] text-sm mt-2">
              Seu anúncio foi preparado e enviado com sucesso.
            </p>
          </div>

          <div className="bg-[#11212D] border border-[#253745] rounded-2xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-[#253745]">
              <MarketplaceBadge marketplace={marketplace} showName={false} size="md" />

              <div>
                <p className="text-white text-sm font-semibold">{marketplace}</p>
                <p className="text-[#9BA8AB] text-xs">Publicação imediata</p>
              </div>
            </div>

            <div className="flex gap-3 mb-4">
              <img
                src={productImage}
                alt={productName}
                className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
              />
              <p className="text-white text-sm font-medium leading-snug line-clamp-2">
                {productName}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-[#06151E] rounded-xl p-3">
                <p className="text-[#9BA8AB] text-xs">Preço de venda</p>
                <p className="text-white font-bold mt-1">{formatCurrency(finalPrice)}</p>
              </div>

              <div className="bg-green-900/20 border border-green-800/40 rounded-xl p-3">
                <p className="text-green-400 text-xs">Lucro estimado</p>
                <p className="text-green-400 font-bold mt-1">
                  {formatCurrency(profitAmount)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[#9BA8AB]">Margem aplicada: {marginPercent}%</span>
              <span className="text-green-400 font-medium">Publicado com sucesso</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleViewAnnouncement}
              className="w-full px-4 py-3 rounded-xl bg-[#FFD300] hover:bg-[#E6BE00] text-black font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Ver anúncio no Marketplace
            </button>

            <button
              onClick={onClose}
              className="w-full px-4 py-3 rounded-xl border border-[#253745] text-white font-medium hover:bg-[#11212D] transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar ao Catálogo
            </button>
          </div>
        </div>
      )}

      {showToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#11212D] border border-[#253745] text-white text-sm px-5 py-3 rounded-xl shadow-lg z-[120]">
          Em breve disponível.
        </div>
      )}
    </div>
  );
}