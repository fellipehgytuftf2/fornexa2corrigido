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
  Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Product } from '../../types';
import { supabase } from '../../lib/supabase';
import PublishFlowOverlay from './PublishFlowOverlay';
import { useTravaScrollDeFundo } from '../../lib/useTravaScrollDeFundo';
import {
  LIMITE_FRETE_GRATIS,
  calcularVenda,
  margemMinimaSemPrejuizo,
} from '../../lib/taxasDoMercadoLivre';

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

/** Limite do Mercado Livre: acima disso o título é cortado no anúncio. */
const MAX_TITULO = 60;

/** O Mercado Livre recusa a publicação inteira se vierem mais de 10 fotos. */
const MAX_FOTOS = 10;


/**
 * Título sugerido, já dentro do limite do Mercado Livre.
 *
 * O complemento "Original com Pronta Entrega e Garantia" só entra se couber.
 * Antes ele era sempre acrescentado, e nomes de produto longos nasciam com o
 * contador em vermelho — o vendedor tinha que apagar texto antes de publicar.
 *
 * Passando do limite mesmo assim, corta no último espaço em vez de no meio da
 * palavra: título cortado no meio atrapalha a busca por categoria e fica feio
 * no anúncio.
 */
function montarTitulo(nome: string): string {
  const base = (nome || '').trim();
  const complemento = ' Original com Pronta Entrega e Garantia';

  if (base.length + complemento.length <= MAX_TITULO) {
    return base + complemento;
  }

  if (base.length <= MAX_TITULO) {
    return base;
  }

  const cortado = base.slice(0, MAX_TITULO);
  const ultimoEspaco = cortado.lastIndexOf(' ');

  return ultimoEspaco > 30 ? cortado.slice(0, ultimoEspaco) : cortado;
}

export default function ProductModal({ product, onClose }: ProductModalProps) {
  // O modal existe só enquanto está aberto, então a trava vale sempre.
  useTravaScrollDeFundo(true);

  const [marginPercentage, setMarginPercentage] = useState<string>('40');

  /**
   * Título e fotos do anúncio, editáveis. Começam no que veio do catálogo e o
   * vendedor ajusta antes de publicar — o que sai daqui é o que vai para o
   * Mercado Livre.
   */
  const [titulo, setTitulo] = useState(() => montarTitulo(product.name));
  const [fotos, setFotos] = useState<string[]>(() =>
    [product.image, ...(product.images ?? [])].filter(Boolean)
  );
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [flowStage, setFlowStage] = useState<'idle' | 'publishing' | 'success'>('idle');

  const [mercadoLivreConnected, setMercadoLivreConnected] = useState(false);
  const [loadingMercadoLivre, setLoadingMercadoLivre] = useState(true);
  const [mercadoLivreError, setMercadoLivreError] = useState('');

  const [publishError, setPublishError] = useState('');
  const [publishedPermalink, setPublishedPermalink] = useState('');

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

  // A margem escolhida é sobre o custo; ela não sabe nada sobre o que o
  // marketplace retém. Estas duas linhas traduzem a escolha em dinheiro que
  // sobra de verdade, antes de o anúncio ir ao ar.
  const contaDaVenda = calcularVenda(finalPrice, supplierPrice);
  const margemMinima = margemMinimaSemPrejuizo(supplierPrice);


  const hasLinkedSupplier = Boolean(product.supplierId);

  const formatCurrency = (value: number) => {
    return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
  };

  /**
   * Envia as fotos escolhidas para o Storage e devolve as URLs públicas.
   * Mesmo bucket que o Admin usa para as imagens do catálogo.
   */
  const adicionarFotos = async (arquivos: File[]) => {
    setEnviandoFoto(true);
    setErroFoto('');

    const espaco = MAX_FOTOS - fotos.length;
    const aceitos = arquivos.slice(0, espaco);
    const novas: string[] = [];

    for (const arquivo of aceitos) {
      const extensao = arquivo.name.split('.').pop() || 'jpg';
      const nome = `anuncio/${crypto.randomUUID()}.${extensao}`;

      const { error } = await supabase.storage
        .from('product-images')
        .upload(nome, arquivo, { cacheControl: '3600', upsert: false });

      if (error) {
        setEnviandoFoto(false);
        setErroFoto(
          `Não foi possível enviar a foto: ${error.message}. Se o erro for de permissão, sua conta não pode gravar imagens.`
        );
        return;
      }

      const { data } = supabase.storage.from('product-images').getPublicUrl(nome);
      novas.push(data.publicUrl);
    }

    setFotos((atuais) => [...atuais, ...novas]);
    setEnviandoFoto(false);

    if (arquivos.length > espaco) {
      setErroFoto(`O anúncio aceita até ${MAX_FOTOS} fotos. As excedentes foram ignoradas.`);
    }
  };

  const removerFoto = (url: string) => {
    setFotos((atuais) => atuais.filter((foto) => foto !== url));
    setErroFoto('');
  };

  /**
   * ATENÇÃO ao editar: este texto é publicado no anúncio, visível a qualquer
   * comprador ou concorrente.
   *
   * Já trouxe nome, empresa, cidade e WhatsApp do fornecedor, além do preço de
   * custo, da margem e do lucro. Na prática entregava a quem abrisse o anúncio
   * o contato para comprar direto na fonte e o número exato para cobrir a
   * oferta. Nada disso volta aqui.
   *
   * Regra: só entra o que ajuda quem vai comprar.
   */
  const generatedDescription = `
${product.description}

Sobre este produto:
- Produto: ${product.name}
- Categoria: ${product.category}
- Prazo médio de envio: ${product.supplierShippingTime || 'Consulte o prazo no anúncio'}
- Produto novo, com garantia e pronta entrega

Compre com segurança: enviamos com código de rastreio e acompanhamento até a entrega.`;

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
        image_url: fotos[0] || product.image,
        supplier_price: supplierPrice,
        sale_price: finalPrice,
        margin: profitAmount,
        // O que vai para o anúncio é o que o vendedor revisou na tela, não o
        // texto gerado: ele pode ter ajustado título e fotos.
        announcement_title: titulo.trim().slice(0, MAX_TITULO),
        announcement_description: generatedDescription,
        announcement_category: product.category,
        announcement_price: finalPrice,
        announcement_image_url: fotos[0] || product.image,
        announcement_image_urls: fotos.slice(1),
      },
    });

    if (publishInvokeError || !publishResult?.success) {
      setPublishing(false);

      // IMPORTANTE: quando a Edge Function retorna um status diferente de
      // 2xx (ex: 422), o supabase-js sinaliza isso como "error" e NÃO
      // preenche "data" com o corpo da resposta — mesmo que a função tenha
      // devolvido um JSON com uma mensagem específica. Por isso, nesse
      // caso, precisamos ler o corpo da resposta manualmente a partir de
      // publishInvokeError.context (um objeto Response).
      let mensagemEspecifica: string | undefined = publishResult?.error;

      const errorContext = (
        publishInvokeError as { context?: { json?: () => Promise<{ error?: string }> } } | null
      )?.context;

      if (!mensagemEspecifica && errorContext?.json) {
        try {
          const errorBody = await errorContext.json();
          mensagemEspecifica = errorBody?.error;
        } catch {
          // Se não der pra ler o corpo (ex: não é JSON), seguimos com a
          // mensagem genérica abaixo.
        }
      }

      setPublishError(
        mensagemEspecifica ??
          'Não foi possível publicar o anúncio no Mercado Livre. Tente novamente.'
      );
      return;
    }

    setPublishing(false);
    setPublishedPermalink(publishResult.permalink ?? '');
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
          className="bg-white dark:bg-navy-800 rounded-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto shadow-2xl animate-fade-in"
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

                    </div>
                  </div>
                </div>

                {/* O quadro com nome, empresa, cidade e WhatsApp do fornecedor
                    saiu daqui: são dados de bastidor, e a tela é sobre o
                    anúncio. O vínculo continua valendo — só não é exibido. */}

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
                      <Image className="w-5 h-5 text-gray-500 dark:text-slate-400 mt-0.5 shrink-0" />

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-navy-900 dark:text-white">
                            Fotos do anúncio
                          </p>

                          <p className="text-xs text-gray-500 dark:text-slate-400">
                            {fotos.length} de {MAX_FOTOS} · a primeira é a capa
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-3 mt-3">
                          {fotos.map((foto, indice) => (
                            <div key={foto} className="relative group">
                              <img
                                src={foto}
                                alt=""
                                className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-navy-600"
                              />

                              {indice === 0 && (
                                <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-medium">
                                  Capa
                                </span>
                              )}

                              {fotos.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removerFoto(foto)}
                                  aria-label="Remover foto"
                                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}

                          {fotos.length < MAX_FOTOS && (
                            <label
                              className={`w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 dark:border-navy-600 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-gray-400 dark:hover:border-navy-500 transition-colors ${
                                enviandoFoto ? 'opacity-60 pointer-events-none' : ''
                              }`}
                            >
                              {enviandoFoto ? (
                                <span className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                              ) : (
                                <>
                                  <Upload className="w-5 h-5 text-gray-400" />
                                  <span className="text-[10px] text-gray-500 dark:text-slate-400">
                                    Adicionar
                                  </span>
                                </>
                              )}

                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                disabled={enviandoFoto}
                                onChange={(event) => {
                                  const arquivos = Array.from(event.target.files || []);
                                  if (arquivos.length) {
                                    adicionarFotos(arquivos);
                                  }
                                  event.target.value = '';
                                }}
                              />
                            </label>
                          )}
                        </div>

                        {erroFoto && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                            {erroFoto}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <FileText className="w-5 h-5 text-gray-500 dark:text-slate-400 mt-0.5 shrink-0" />

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <label
                            htmlFor="titulo-do-anuncio"
                            className="text-sm font-medium text-navy-900 dark:text-white"
                          >
                            Título do anúncio
                          </label>

                          <span
                            className={`text-xs ${
                              titulo.length > MAX_TITULO
                                ? 'text-red-600 dark:text-red-400 font-medium'
                                : 'text-gray-500 dark:text-slate-400'
                            }`}
                          >
                            {titulo.length}/{MAX_TITULO}
                          </span>
                        </div>

                        <textarea
                          id="titulo-do-anuncio"
                          value={titulo}
                          onChange={(event) => setTitulo(event.target.value)}
                          rows={2}
                          className="w-full mt-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-sm text-navy-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                        />

                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">
                          O Mercado Livre corta títulos acima de {MAX_TITULO} caracteres.
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
                          Sua margem sobre o custo
                        </p>

                        <p className="text-xl font-bold text-navy-900 dark:text-white mt-1">
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


                      {/* O que sobra de verdade.
                          Sem este bloco a tela mostrava "lucro" ignorando a
                          comissão do Mercado Livre e o frete grátis, e uma
                          margem de 40% podia ser prejuízo sem ninguém notar. */}
                      <div
                        className={`rounded-xl p-4 border ${
                          contaDaVenda.lucro < 0
                            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                            : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        }`}
                      >
                        <p className="text-xs text-gray-600 dark:text-slate-400">
                          O que sobra depois do Mercado Livre
                        </p>

                        <p
                          className={`text-2xl font-bold mt-1 ${
                            contaDaVenda.lucro < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-green-600 dark:text-green-400'
                          }`}
                        >
                          {formatCurrency(contaDaVenda.lucro)}
                          <span className="text-sm font-medium ml-2">
                            ({contaDaVenda.margemReal.toFixed(0)}% do preço)
                          </span>
                        </p>

                        <div className="text-xs text-gray-600 dark:text-slate-400 mt-3 space-y-1">
                          <p>
                            Comissão estimada: −{formatCurrency(contaDaVenda.comissao)}
                          </p>

                          {contaDaVenda.temFreteGratis && (
                            <p>
                              Sua parte do frete grátis: −
                              {formatCurrency(contaDaVenda.frete)}
                            </p>
                          )}
                        </div>

                        {contaDaVenda.lucro < 0 && (
                          <p className="text-xs font-semibold text-red-700 dark:text-red-300 mt-3 leading-relaxed">
                            Nesta margem você vende no prejuízo.
                            {margemMinima
                              ? ` Suba para pelo menos ${margemMinima}% para empatar.`
                              : ''}
                          </p>
                        )}

                        {contaDaVenda.lucro >= 0 && contaDaVenda.temFreteGratis && (
                          <p className="text-xs text-gray-600 dark:text-slate-400 mt-3 leading-relaxed">
                            Acima de R$ {LIMITE_FRETE_GRATIS} o Mercado Livre exige
                            frete grátis e você banca parte dele.
                          </p>
                        )}

                        <p className="text-[11px] text-gray-500 dark:text-slate-500 mt-3 leading-relaxed">
                          Estimativa. A comissão muda por categoria e o valor exato
                          só sai depois da venda — o Financeiro mostra o real.
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
          permalink={publishedPermalink}
        />
      )}
    </>
  );
}