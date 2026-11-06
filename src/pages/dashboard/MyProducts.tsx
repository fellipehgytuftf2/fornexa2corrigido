import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Package, Search, Store } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Pagination from '../../components/ui/pagination';
import DivulgarNoFacebook from '../../components/dashboard/DivulgarNoFacebook';
import CartaoDoAnuncio, {
  gradeDoFormato,
  type FormatoDoCartao,
} from '../../components/dashboard/cartao-anuncio/CartaoDoAnuncio';
import BarraDePreviaDoCartao, {
  formatoDoCartaoGuardado,
} from '../../components/dashboard/cartao-anuncio/BarraDePreviaDoCartao';
import EditarAnuncio, { type AnuncioSalvo } from '../../components/dashboard/EditarAnuncio';
import { calcularVenda } from '../../lib/taxasDoMercadoLivre';
import { useFuncionalidade } from '../../lib/funcionalidades';

const PRODUTOS_POR_PAGINA = 10;

interface SupplierFromSupabase {
  id: string;
  name: string;
  company_name: string;
  city: string;
  state: string;
  average_shipping_time: string;
}

interface UserProduct {
  id: string;
  user_id: string;
  supplier_id: string | null;
  name: string;
  image_url: string;
  supplier_price: number;
  sale_price: number;
  margin: number;
  status: 'active' | 'paused' | 'inactive' | 'draft';
  marketplace: string;
  announcement_title: string;
  announcement_description: string;
  announcement_category: string;
  announcement_price: number;
  announcement_image_url: string;
  created_at: string;
  /** Endereço do anúncio, como o Mercado Livre devolveu na publicação. */
  permalink: string | null;
  /** Id do anúncio. Serve de reserva quando o endereço não foi guardado. */
  ml_item_id: string | null;
  suppliers?: SupplierFromSupabase | SupplierFromSupabase[] | null;
}

/**
 * Onde abrir o anúncio.
 *
 * O endereço guardado é sempre o melhor: é o que o Mercado Livre devolveu, com
 * o nome do produto no meio. Faltando ele — anúncio publicado antes desta
 * coluna existir —, monta a partir do id: `MLB123` vira `MLB-123-_JM`, forma
 * que o Mercado Livre aceita e redireciona para o anúncio certo.
 */
function enderecoDoAnuncio(produto: UserProduct): string | null {
  if (produto.permalink) {
    return produto.permalink;
  }

  if (!produto.ml_item_id) {
    return null;
  }

  return `https://produto.mercadolivre.com.br/${produto.ml_item_id.replace(
    /^([A-Z]{3})/,
    '$1-'
  )}-_JM`;
}

/** Um anúncio que fechou vendas no vermelho, com os números reais. */
interface VendaNoVermelho {
  user_product_id: string;
  produto: string;
  vendas: number;
  prejuizo_total: number;
  prejuizo_medio: number;
  preco_medio: number;
  custo_medio: number;
  taxa_media: number;
  frete_medio: number;
}

export default function MyProducts() {
  const [products, setProducts] = useState<UserProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  /**
   * Em teste: sobe desligada e só a conta admin enxerga, até o lançamento.
   */
  const { liberada: vendoADivulgacao } = useFuncionalidade('divulgar-no-facebook');

  /**
   * Os anúncios que estão vendendo no prejuízo, com números reais.
   *
   * Até 09/10 a conta de publicar supunha 12% de taxa e nenhum frete abaixo de
   * R$ 79. Medindo as vendas, a taxa fica entre 15% e 19,5% e o frete existe em
   * todas as faixas — e os anúncios publicados com a conta antiga continuam no
   * ar, perdendo dinheiro a cada venda, sem ninguém perceber.
   *
   * O preço não se corrige por aqui: ele é definido na publicação e alterado no
   * Mercado Livre. Então o card aponta o problema e o botão "Ver anúncio", que
   * já existe, leva ao lugar onde a correção acontece.
   */
  const [noVermelho, setNoVermelho] = useState<Record<string, VendaNoVermelho>>({});

  /** O anúncio com o modal de divulgação aberto. */
  const [divulgando, setDivulgando] = useState<UserProduct | null>(null);
  // PRÉVIA (feat/cards-anuncios): qual desenho de card mostrar.
  const [formatoDoCartao, setFormatoDoCartao] = useState<FormatoDoCartao>(formatoDoCartaoGuardado);

  /** O anúncio com a tela de edição aberta. */
  const [editando, setEditando] = useState<UserProduct | null>(null);

  /** Editar fica escondido até ser liberado em Admin → Funcionalidades em teste. */
  const { liberada: vendoAEdicao } = useFuncionalidade('editar-anuncio');

  /**
   * Anúncios que o vendedor pausou pela tela de edição.
   *
   * Lido à parte, como `semEstoque`: se a coluna ainda não existir no banco
   * (migração 20261103120000 não aplicada), a lista continua aparecendo.
   */
  const [pausadosPeloVendedor, setPausadosPeloVendedor] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [paginaAtual, setPaginaAtual] = useState(1);

  const loadProducts = async () => {
    setLoading(true);
    setErrorMessage('');

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setProducts([]);
      setLoading(false);
      setErrorMessage('Sessão não encontrada. Faça login novamente.');
      return;
    }

    // Contato do fornecedor não entra aqui. A tela nunca mostrou WhatsApp nem
    // e-mail dele, mas vinham na resposta assim mesmo — e o que chega ao
    // navegador está disponível a quem abrir o inspetor.
    const { data, error } = await supabase
      .from('user_products')
      .select(`
        id,
        user_id,
        supplier_id,
        name,
        image_url,
        supplier_price,
        sale_price,
        margin,
        status,
        marketplace,
        announcement_title,
        announcement_description,
        announcement_category,
        announcement_price,
        announcement_image_url,
        created_at,
        permalink,
        ml_item_id,
        suppliers (
          id,
          name,
          company_name,
          city,
          state,
          average_shipping_time
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setLoading(false);

    if (error) {
      console.error('Erro ao carregar produtos:', error);
      setProducts([]);
      setErrorMessage(`Não foi possível carregar seus produtos: ${error.message}`);
      return;
    }

    setProducts((data || []) as UserProduct[]);

    const { data: pausados, error: erroPausados } = await supabase
      .from('user_products')
      .select('id')
      .eq('user_id', user.id)
      .eq('pausado_pelo_vendedor', true);

    if (!erroPausados) {
      setPausadosPeloVendedor(new Set(((pausados ?? []) as { id: string }[]).map((linha) => linha.id)));
    }

    // Falhar aqui não pode esconder a lista: o aviso é complemento.
    const { data: semEstoque } = await supabase.rpc('meus_anuncios_sem_estoque');

    setSemEstoque(
      new Map(
        ((semEstoque || []) as { user_product_id: string; pausado: boolean }[]).map((linha) => [
          linha.user_product_id,
          linha.pausado,
        ])
      )
    );
  };

  /**
   * Anúncios cujo fornecedor está sem estoque. `true` quando o FORNEXA já
   * pausou no Mercado Livre; `false` quando ainda está no ar.
   */
  const [semEstoque, setSemEstoque] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    loadProducts();
  }, []);

  // O prejuízo é lido à parte dos anúncios: ele vem das vendas já apuradas
  // pelo Mercado Livre, e a lista de anúncios não precisa esperar por isso
  // para aparecer.
  useEffect(() => {
    const lerVermelho = async () => {
      const { data } = await supabase.rpc('meus_anuncios_no_vermelho', { p_dias: 90 });

      const porProduto: Record<string, VendaNoVermelho> = {};

      ((data ?? []) as VendaNoVermelho[]).forEach((linha) => {
        if (linha.user_product_id) porProduto[linha.user_product_id] = linha;
      });

      setNoVermelho(porProduto);
    };

    lerVermelho();
  }, []);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);

    setTimeout(() => {
      setSuccessMessage('');
    }, 4000);
  };

  const getSupplier = (product: UserProduct) => {
    if (Array.isArray(product.suppliers)) {
      return product.suppliers[0];
    }

    return product.suppliers || null;
  };

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // Sem busca por fornecedor: digitar o nome de um e ver os produtos dele
      // filtrados revelaria o que a tela deixou de mostrar.
      return (
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.announcement_title ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.marketplace.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [products, searchTerm]);

  const totalPaginas = Math.max(1, Math.ceil(filteredProducts.length / PRODUTOS_POR_PAGINA));

  // Volta para a primeira sempre que a busca muda: sem isso, filtrar estando
  // na página 3 mostraria uma lista vazia sem explicação.
  useEffect(() => {
    setPaginaAtual(1);
  }, [searchTerm]);

  const produtosDaPagina = useMemo(() => {
    const inicio = (paginaAtual - 1) * PRODUTOS_POR_PAGINA;
    return filteredProducts.slice(inicio, inicio + PRODUTOS_POR_PAGINA);
  }, [filteredProducts, paginaAtual]);

  const totalProfit = useMemo(() => {
    return products.reduce((total, product) => total + Number(product.margin || 0), 0);
  }, [products]);

  const totalRevenue = useMemo(() => {
    return products.reduce((total, product) => total + Number(product.sale_price || 0), 0);
  }, [products]);

  const linkedSuppliers = useMemo(() => {
    return new Set(products.map((product) => product.supplier_id).filter(Boolean)).size;
  }, [products]);

  const formatCurrency = (value: number) => {
    return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
  };

  const formatDate = (value: string) => {
    return new Date(value).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getMarginPercent = (product: UserProduct) => {
    const supplierPrice = Number(product.supplier_price || 0);
    const profit = Number(product.margin || 0);

    if (supplierPrice <= 0) {
      return 0;
    }

    return (profit / supplierPrice) * 100;
  };

  /**
   * O que a edição salvou no Mercado Livre, refletido na lista sem recarregar.
   * O lucro é refeito com a mesma conta da publicação.
   */
  const aoSalvarEdicao = (produto: UserProduct, salvo: AnuncioSalvo) => {
    const lucro = calcularVenda(salvo.preco, Number(produto.supplier_price) || 0).lucro;

    setProducts((atual) =>
      atual.map((item) =>
        item.id === produto.id
          ? {
              ...item,
              sale_price: salvo.preco,
              announcement_price: salvo.preco,
              margin: lucro,
              announcement_title: salvo.titulo,
              announcement_description: salvo.descricao,
            }
          : item
      )
    );

    setPausadosPeloVendedor((atual) => {
      const proximo = new Set(atual);
      if (salvo.status === 'paused') proximo.add(produto.id);
      else proximo.delete(produto.id);
      return proximo;
    });

    setEditando(null);
    showSuccess('Anúncio atualizado no Mercado Livre.');
  };

  const handleDeleteProduct = async (productId: string) => {
    setActionId(productId);
    setErrorMessage('');

    const { error } = await supabase.from('user_products').delete().eq('id', productId);

    setActionId(null);

    if (error) {
      console.error('Erro ao excluir produto:', error);
      setErrorMessage(`Não foi possível excluir o produto: ${error.message}`);
      return;
    }

    await loadProducts();
    showSuccess('Produto excluído com sucesso.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 dark:text-white">
            Meus Anúncios
          </h1>

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            Produtos preparados para venda e vinculados aos fornecedores corretos.
          </p>
        </div>

        <button
          onClick={loadProducts}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-medium transition-colors"
        >
          <Package className="w-4 h-4" />
          Atualizar produtos
        </button>
      </div>

      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />

          <p className="text-green-700 dark:text-green-400 text-sm font-medium">
            {successMessage}
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />

          <p className="text-red-700 dark:text-red-400 text-sm font-medium">
            {errorMessage}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Produtos salvos</p>

          <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
            {products.length}
          </p>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Fornecedores vinculados</p>

          <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
            {linkedSuppliers}
          </p>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Valor total de venda</p>

          <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
            {formatCurrency(totalRevenue)}
          </p>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Lucro estimado</p>

          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
            {formatCurrency(totalProfit)}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-4 shadow-sm">
        <div className="relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />

          <input
            type="text"
            placeholder="Buscar produto ou marketplace..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-black dark:border-navy-700 dark:border-t-white rounded-full animate-spin mx-auto" />

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-4">
            Carregando produtos...
          </p>
        </div>
      ) : filteredProducts.length > 0 ? (
        <>
        <div key={formatoDoCartao} className={gradeDoFormato[formatoDoCartao]}>
          {produtosDaPagina.map((product, indiceNaPagina) => {
            const supplier = getSupplier(product);
            const marginPercent = getMarginPercent(product);
            const productHasSupplier = Boolean(product.supplier_id && supplier);

            // Pausa sem explicação parece defeito do sistema.
            const avisoDeEstoque = semEstoque.has(product.id)
              ? {
                  pausado: Boolean(semEstoque.get(product.id)),
                  texto: semEstoque.get(product.id)
                    ? 'Pausado pelo FORNEXA: o fornecedor está sem estoque. Volta ao ar sozinho quando ele repor.'
                    : 'O fornecedor está sem estoque. Este anúncio será pausado no Mercado Livre para você não vender o que não existe.',
                }
              : null;

            // A pausa por falta de estoque não mexe em `status` — a tabela
            // recusa 'paused'. Sem olhar a marca, o selo dizia "Ativo" ao lado
            // do aviso de pausado.
            const situacao: { texto: string; tom: 'ativo' | 'pausado' | 'neutro' } = semEstoque.get(product.id)
              ? { texto: 'Pausado · sem estoque', tom: 'pausado' }
              : pausadosPeloVendedor.has(product.id)
                ? { texto: 'Pausado por você', tom: 'pausado' }
                : product.status === 'active'
                  ? { texto: 'Ativo', tom: 'ativo' }
                  : { texto: product.status === 'paused' ? 'Pausado' : product.status, tom: 'neutro' };

            // O prejuízo, dito no anúncio que o causa. Somado no Financeiro ele
            // vira um número que não aponta para nada; aqui ele fica ao lado do
            // botão que abre o anúncio, que é onde o preço se corrige.
            const alertaDePrejuizo = noVermelho[product.id] ? (
                    <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
                      <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                        Este anúncio está vendendo no prejuízo
                      </p>

                      <p className="text-sm text-red-800 dark:text-red-200 mt-1 leading-relaxed">
                        {noVermelho[product.id].vendas === 1
                          ? '1 venda apurada nos últimos 90 dias, com perda de '
                          : `${noVermelho[product.id].vendas} vendas apuradas nos últimos 90 dias, com perda de `}
                        <strong>
                          R$ {Math.abs(noVermelho[product.id].prejuizo_medio).toFixed(2).replace('.', ',')}
                        </strong>{' '}
                        por venda.
                      </p>

                      <p className="text-xs text-red-700 dark:text-red-300/90 mt-2 leading-relaxed">
                        Preço médio R${' '}
                        {noVermelho[product.id].preco_medio.toFixed(2).replace('.', ',')} · custo R${' '}
                        {noVermelho[product.id].custo_medio.toFixed(2).replace('.', ',')} · taxa do
                        Mercado Livre R${' '}
                        {noVermelho[product.id].taxa_media.toFixed(2).replace('.', ',')} · frete R${' '}
                        {noVermelho[product.id].frete_medio.toFixed(2).replace('.', ',')}.
                      </p>

                      <p className="text-xs text-red-700 dark:text-red-300/90 mt-2 leading-relaxed">
                        {vendoAEdicao
                          ? 'O preço se corrige em "Editar".'
                          : 'O preço se corrige no Mercado Livre, em "Ver anúncio".'}{' '}
                        Se o frete grátis estiver ligado num produto barato, é ele que
                        está comendo a margem.
                      </p>
                    </div>
                  ) : null;

            return (
              <CartaoDoAnuncio
                key={product.id}
                formato={formatoDoCartao}
                ordem={indiceNaPagina}
                imagem={product.image_url}
                nome={product.name}
                // O título do anúncio, não o nome do fornecedor: quem renomeia no
                // Mercado Livre espera ver o nome novo aqui também.
                titulo={product.announcement_title || product.name}
                marketplace={product.marketplace}
                situacao={situacao}
                avisoDeEstoque={avisoDeEstoque}
                salvoEm={formatDate(product.created_at)}
                precoFornecedor={product.supplier_price}
                precoVenda={product.sale_price}
                lucro={product.margin}
                margemPercentual={marginPercent}
                // Quem fornece não aparece no card de propósito: o vendedor só
                // precisa saber que o envio está garantido e em quanto tempo.
                temFornecedor={productHasSupplier}
                prazo={supplier?.average_shipping_time || 'não informado'}
                alertaDePrejuizo={alertaDePrejuizo}
                podeEditar={Boolean(vendoAEdicao && product.ml_item_id)}
                linkDoAnuncio={enderecoDoAnuncio(product)}
                // Sem anúncio publicado não há o que divulgar.
                podeDivulgar={Boolean(vendoADivulgacao && enderecoDoAnuncio(product))}
                excluindo={actionId === product.id}
                aoEditar={() => setEditando(product)}
                aoDivulgar={() => setDivulgando(product)}
                aoExcluir={() => handleDeleteProduct(product.id)}
              />
            );
          })}
        </div>

        <Pagination
          page={paginaAtual}
          totalPages={totalPaginas}
          onPageChange={setPaginaAtual}
          label="Páginas de produtos"
        />
        </>
      ) : (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
          <Store className="w-12 h-12 text-gray-300 dark:text-navy-600 mx-auto mb-4" />

          <h3 className="text-navy-900 dark:text-white font-semibold">
            Nenhum produto salvo
          </h3>

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-2">
            Vá até o Catálogo, escolha um produto e salve em Meus Anúncios.
          </p>
        </div>
      )}

      <BarraDePreviaDoCartao formato={formatoDoCartao} aoEscolher={setFormatoDoCartao} />

      {editando && (
        <EditarAnuncio
          anuncio={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={(salvo) => aoSalvarEdicao(editando, salvo)}
        />
      )}

      {divulgando && (
        <DivulgarNoFacebook
          produtoId={divulgando.id}
          titulo={divulgando.announcement_title || divulgando.name}
          // A categoria do anúncio é o que vira termo de busca de grupo:
          // "Pet" acha grupo de pet, o nome do produto não acha nada.
          categoria={divulgando.announcement_category || divulgando.name}
          linkDoAnuncio={enderecoDoAnuncio(divulgando) as string}
          imagem={divulgando.announcement_image_url || divulgando.image_url}
          preco={divulgando.sale_price}
          lucro={divulgando.margin}
          aoFechar={() => setDivulgando(null)}
        />
      )}
    </div>
  );
}