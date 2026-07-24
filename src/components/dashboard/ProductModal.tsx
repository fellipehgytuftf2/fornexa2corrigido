import { useEffect, useState } from 'react';
import {
  X,
  Calculator,
  Image,
  FileText,
  Tag,
  AlertCircle,
  Link2,
  Truck,
  Sparkles,
  DollarSign,
  Rocket,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Product } from '../../types';
import { supabase } from '../../lib/supabase';
import PublishFlowOverlay from './PublishFlowOverlay';

interface ProductModalProps {
  product: Product;
  onClose: () => void;
}

interface MlConnection {
  id: string;
  user_id: string;
  status: 'disconnected' | 'prepared' | 'connected';
}

const MARGIN_PRESETS = [30, 50, 80, 100];

export default function ProductModal({ product, onClose }: ProductModalProps) {
  const [marginPercentage, setMarginPercentage] = useState<string>('40');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [flowStage, setFlowStage] = useState<'idle' | 'publishing' | 'success'>('idle');

  const [mercadoLivreConnected, setMercadoLivreConnected] = useState(false);
  const [loadingMercadoLivre, setLoadingMercadoLivre] = useState(true);
  const [mercadoLivreError, setMercadoLivreError] = useState('');

  const [publishError, setPublishError] = useState('');

  useEffect(() => {
    const loadMercadoLivreStatus = async () => {
      setLoadingMercadoLivre(true);
      setMercadoLivreError('');

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setLoadingMercadoLivre(false);
        setMercadoLivreConnected(false);
        setMercadoLivreError('Sessão não encontrada. Faça login novamente.');
        return;
      }

      const { data, error } = await supabase
        .from('ml_connections')
        .select('id, user_id, status')
        .eq('user_id', user.id)
        .maybeSingle<MlConnection>();

      setLoadingMercadoLivre(false);

      if (error) {
        setMercadoLivreConnected(false);
        setMercadoLivreError('Não foi possível verificar a integração do Mercado Livre.');
        return;
      }

      // IMPORTANTE: só 'connected' representa uma conexão real, obtida pelo
      // fluxo OAuth de verdade (com access_token/refresh_token válidos).
      // 'prepared' era um status de placeholder que a tela de Integrações
      // usava antes de estar ligada ao OAuth de verdade — não deve mais
      // liberar a publicação de anúncios.
      const isReady = data?.status === 'connected';

      setMercadoLivreConnected(isReady);
    };

    loadMercadoLivreStatus();
  }, []);

  const supplierPrice = Number(product.supplierPrice || 0);
  const marginPercentValue = Number(marginPercentage) || 0;
  const profitAmount = supplierPrice * (marginPercentValue / 100);
  const finalPrice = supplierPrice + profitAmount;

  const hasLinkedSupplier = Boolean(product.supplierId);

  const supplierLocation =
    product.supplierCity || product.supplierState
      ? `${product.supplierCity || ''}${
          product.supplierCity && product.supplierState ? '/' : ''
        }${product.supplierState || ''}`
      : 'Local não informado';

  const formatCurrency = (value: number) => {
    return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
  };

  const formatPercent = (value: number) => {
    return `${Number(value || 0).toFixed(0)}%`;
  };

  const generatedTitle = `${product.name} Original com Pronta Entrega e Garantia`;

  const generatedDescription = `
${product.description}

Principais informações do produto:
- Produto: ${product.name}
- Categoria: ${product.category}
- Estoque disponível: ${product.stock} unidade(s)
- Fornecedor responsável: ${product.supplierName || 'Fornecedor não vinculado'}
- Empresa: ${product.supplierCompanyName || 'Empresa não informada'}
- Local do fornecedor: ${supplierLocation}
- WhatsApp do fornecedor: ${product.supplierWhatsapp || 'Não informado'}
- Prazo médio de envio: ${product.supplierShippingTime || 'Não informado'}

Condição comercial:
- Preço do fornecedor: ${formatCurrency(supplierPrice)}
- Margem aplicada: ${formatPercent(marginPercentValue)}
- Lucro estimado: ${formatCurrency(profitAmount)}
- Preço final de venda: ${formatCurrency(finalPrice)}

Anúncio preparado pelo FORNEXA para facilitar a publicação em marketplace, com título, descrição, preço e fornecedor organizados em um único painel.`;

  const canSaveProduct =
    mercadoLivreConnected && hasLinkedSupplier && !loadingMercadoLivre;

  const handlePublish = async () => {
    if (!canSaveProduct || !product.supplierId) {
      return;
    }

    setPublishing(true);
    setPublishError('');

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setPublishing(false);
      setPublishError('Sessão não encontrada. Faça login novamente.');
      return;
    }

    const { data: publishResult, error: publishInvokeError } = await supabase.functions.invoke<{
      success?: boolean;
      error?: string;
      ml_item_id?: string;
      permalink?: string;
    }>('ml-publish-product', {
      body: {
        catalog_product_id: product.id ?? null,
        supplier_id: product.supplierId,
        name: product.name,
        image_url: product.image,
        supplier_price: supplierPrice,
        sale_price: finalPrice,
        margin: profitAmount,
        announcement_title: generatedTitle,
        announcement_description: generatedDescription,
        announcement_category: product.category,
        announcement_price: finalPrice,
        announcement_image_url: product.image,
      },
    });

    if (publishInvokeError || !publishResult?.success) {
      setPublishing(false);
      setPublishError(
        publishResult?.error ??
          'Não foi possível publicar o anúncio no Mercado Livre. Tente novamente.'
      );
      return;
    }

    setPublishing(false);
    setPublished(true);
  };

  const handlePublishClick = () => {
    setFlowStage('publishing');
    handlePublish();
  };

  const handlePublishingDone = () => {
    if (publishError) {
      setFlowStage('idle');
      return;
    }

    setFlowStage('success');
  };

  const loadingRequiredData = loadingMercadoLivre;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div
          className="bg-white dark:bg-navy-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-navy-700 sticky top-0 bg-white dark:bg-navy-800 z-10">
            <div>
              <h2 className="text-lg font-semibold text-navy-900 dark:text-white">
                Preparar anúncio automático
              </h2>

              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                Defina sua margem, veja o lucro calculado e revise o anúncio gerado pelo FORNEXA.
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
            </button>
          </div>

          <div className="p-5 space-y-6">
            {loadingMercadoLivre && (
              <div className="bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-xl p-4 flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-black dark:border-navy-600 dark:border-t-white rounded-full animate-spin" />

                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Verificando integração com Mercado Livre no Supabase...
                </p>
              </div>
            )}

            {!loadingMercadoLivre && !mercadoLivreConnected && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-700 dark:text-yellow-400 mt-0.5" />

                <div className="flex-1">
                  <p className="text-yellow-700 dark:text-yellow-400 text-sm font-medium">
                    Prepare a conexão com o Mercado Livre antes de salvar o anúncio
                  </p>

                  <p className="text-yellow-700 dark:text-yellow-400 text-sm mt-1">
                    Para seguir o fluxo correto do FORNEXA, primeiro vá até Integrações e prepare a conexão do Mercado Livre.
                  </p>
                </div>
              </div>
            )}

            {mercadoLivreError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-700 dark:text-red-400 mt-0.5" />

                <p className="text-red-700 dark:text-red-400 text-sm font-medium">
                  {mercadoLivreError}
                </p>
              </div>
            )}

            {publishError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-700 dark:text-red-400 mt-0.5" />

                <p className="text-red-700 dark:text-red-400 text-sm font-medium">
                  {publishError}
                </p>
              </div>
            )}

            {mercadoLivreConnected && !hasLinkedSupplier && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-700 dark:text-red-400 mt-0.5" />

                <div className="flex-1">
                  <p className="text-red-700 dark:text-red-400 text-sm font-medium">
                    Produto sem fornecedor vinculado
                  </p>

                  <p className="text-red-700 dark:text-red-400 text-sm mt-1">
                    Este produto precisa ter um supplier_id na tabela catalog_products para ser salvo corretamente em Meus Produtos.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
              <div className="space-y-6">
                <div className="bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 rounded-xl p-5">
                  <div className="flex gap-4">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-24 h-24 object-cover rounded-xl"
                    />

                    <div className="flex-1">
                      <h3 className="text-navy-900 dark:text-white font-semibold">
                        {product.name}
                      </h3>

                      <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                        {product.category}
                      </p>

                      <p className="text-sm text-gray-600 dark:text-slate-400 mt-3">
                        {product.description}
                      </p>

                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-3">
                        Estoque disponível: {product.stock} unidade(s)
                      </p>
                    </div>
                  </div>
                </div>

                {hasLinkedSupplier && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <Truck className="w-5 h-5 text-green-700 dark:text-green-400 mt-0.5" />

                      <div>
                        <p className="text-green-700 dark:text-green-400 text-sm font-medium">
                          Fornecedor vinculado ao produto
                        </p>

                        <h3 className="text-navy-900 dark:text-white font-semibold mt-2">
                          {product.supplierName || 'Fornecedor sem nome'}
                        </h3>

                        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                          {product.supplierCompanyName || 'Empresa não informada'} · {supplierLocation}
                        </p>

                        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                          Prazo médio de envio: {product.supplierShippingTime || 'Não informado'}
                        </p>

                        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                          WhatsApp: {product.supplierWhatsapp || 'Não informado'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-200 dark:border-navy-700 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-gray-700 dark:text-white" />

                    <div>
                      <h3 className="text-navy-900 dark:text-white font-semibold">
                        Anúncio gerado automaticamente por IA
                      </h3>

                      <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                        Título, descrição, categoria e preço preparados para revisão.
                      </p>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <Image className="w-5 h-5 text-gray-500 dark:text-slate-400 mt-0.5" />

                      <div>
                        <p className="text-sm font-medium text-navy-900 dark:text-white">
                          Imagem do anúncio
                        </p>

                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-20 h-20 object-cover rounded-lg mt-2"
                        />
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <FileText className="w-5 h-5 text-gray-500 dark:text-slate-400 mt-0.5" />

                      <div>
                        <p className="text-sm font-medium text-navy-900 dark:text-white">
                          Título gerado
                        </p>

                        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                          {generatedTitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <FileText className="w-5 h-5 text-gray-500 dark:text-slate-400 mt-0.5" />

                      <div>
                        <p className="text-sm font-medium text-navy-900 dark:text-white">
                          Descrição gerada
                        </p>

                        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1 whitespace-pre-line">
                          {generatedDescription}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Tag className="w-5 h-5 text-gray-500 dark:text-slate-400 mt-0.5" />

                      <div>
                        <p className="text-sm font-medium text-navy-900 dark:text-white">
                          Categoria e preço
                        </p>

                        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                          Categoria: {product.category}
                        </p>

                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          Preço final: {formatCurrency(finalPrice)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-5 border border-gray-200 dark:border-navy-600 sticky top-24">
                  <div className="flex items-center gap-2 mb-5">
                    <Calculator className="w-5 h-5 text-gray-700 dark:text-white" />

                    <span className="text-navy-900 dark:text-white font-medium">
                      Calculadora de venda
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-white dark:bg-navy-800 rounded-xl p-4 border border-gray-200 dark:border-navy-600">
                      <p className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        Preço do fornecedor
                      </p>

                      <p className="text-xl font-bold text-navy-900 dark:text-white mt-1">
                        {formatCurrency(supplierPrice)}
                      </p>
                    </div>

                    <div className="bg-white dark:bg-navy-800 rounded-xl p-4 border border-gray-200 dark:border-navy-600">
                      <div className="flex items-center justify-between mb-4">
                        <label className="text-sm font-medium text-navy-900 dark:text-white">
                          Margem desejada
                        </label>

                        <span className="text-xl font-bold text-gold">
                          {marginPercentValue}%
                        </span>
                      </div>

                      <input
                        type="range"
                        min={0}
                        max={200}
                        step={1}
                        value={marginPercentValue}
                        onChange={(event) => setMarginPercentage(event.target.value)}
                        className="fornexa-slider w-full"
                      />

                      <div className="flex justify-between text-xs text-gray-400 dark:text-slate-500 mt-1.5">
                        <span>0%</span>
                        <span>200%</span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 mt-4">
                        {MARGIN_PRESETS.map((preset) => {
                          const isActive = marginPercentValue === preset;

                          return (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setMarginPercentage(String(preset))}
                              className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                                isActive
                                  ? 'bg-gold border-gold text-black'
                                  : 'bg-white dark:bg-navy-900 border-gray-200 dark:border-navy-600 text-navy-900 dark:text-slate-300 hover:border-gold/60'
                              }`}
                            >
                              {preset}%
                            </button>
                          );
                        })}
                      </div>

                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-3">
                        Exemplo: 40% em um produto de R$ 50 gera R$ 20 de lucro.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      <div className="bg-white dark:bg-navy-800 rounded-xl p-4 border border-gray-200 dark:border-navy-600">
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          Lucro calculado
                        </p>

                        <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">
                          {formatCurrency(profitAmount)}
                        </p>
                      </div>

                      <div className="bg-black dark:bg-white rounded-xl p-4">
                        <p className="text-xs text-white/70 dark:text-navy-700">
                          Preço final de venda
                        </p>

                        <p className="text-2xl font-bold text-white dark:text-navy-900 mt-1">
                          {formatCurrency(finalPrice)}
                        </p>
                      </div>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                      <p className="text-blue-700 dark:text-blue-400 text-sm font-medium">
                        Automação do anúncio
                      </p>

                      <p className="text-blue-700 dark:text-blue-400 text-sm mt-1">
                        O FORNEXA usa o fornecedor vinculado ao produto para salvar o anúncio com origem correta.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 pt-2">
                      {!mercadoLivreConnected ? (
                        <Link
                          to="/dashboard/integrations"
                          className="w-full px-4 py-3 rounded-lg bg-black hover:bg-gray-900 text-white font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Link2 className="w-4 h-4" />
                          Ir para Integrações
                        </Link>
                      ) : !hasLinkedSupplier ? (
                        <Link
                          to="/dashboard/suppliers"
                          className="w-full px-4 py-3 rounded-lg bg-black hover:bg-gray-900 text-white font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Truck className="w-4 h-4" />
                          Vincular fornecedor
                        </Link>
                      ) : (
                        <button
                          onClick={handlePublishClick}
                          disabled={publishing || loadingRequiredData}
                          className="w-full px-4 py-3 rounded-lg bg-gold hover:bg-gold-hover text-black font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <Rocket className="w-4 h-4" />
                          Publicar Produto
                        </button>
                      )}

                      <button
                        onClick={onClose}
                        className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white font-medium hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style>{`
          .fornexa-slider {
            -webkit-appearance: none;
            appearance: none;
            height: 6px;
            border-radius: 999px;
            background: linear-gradient(
              to right,
              #FFD300 0%,
              #FFD300 ${(marginPercentValue / 200) * 100}%,
              #545A5B ${(marginPercentValue / 200) * 100}%,
              #545A5B 100%
            );
            outline: none;
            cursor: pointer;
            transition: background 0.1s ease;
          }

          .fornexa-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #FFD300;
            border: 3px solid #ffffff;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            cursor: pointer;
            transition: transform 0.15s ease;
          }

          .fornexa-slider::-webkit-slider-thumb:hover {
            transform: scale(1.15);
          }

          .fornexa-slider::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #FFD300;
            border: 3px solid #ffffff;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            cursor: pointer;
            transition: transform 0.15s ease;
          }

          .fornexa-slider::-moz-range-thumb:hover {
            transform: scale(1.15);
          }

          .fornexa-slider::-moz-range-track {
            background: transparent;
          }
        `}</style>
      </div>

      {flowStage !== 'idle' && (
        <PublishFlowOverlay
          stage={flowStage === 'publishing' ? 'publishing' : 'success'}
          productName={product.name}
          productImage={product.image}
          marketplace="Mercado Livre"
          finalPrice={finalPrice}
          profitAmount={profitAmount}
          marginPercent={marginPercentValue}
          onPublishingDone={handlePublishingDone}
          onClose={onClose}
        />
      )}
    </>
  );
}