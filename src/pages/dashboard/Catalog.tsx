import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Package,
  Search,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Product } from '../../types';
import ProductModal from '../../components/dashboard/ProductModal';

/**
 * O que o catálogo busca do fornecedor.
 *
 * Reduzido ao mínimo de propósito: nome, empresa, contato e cidade não são
 * buscados, para não chegarem ao navegador do vendedor. O tipo acompanha a
 * consulta — se alguém voltar a pedir um campo, o TypeScript obriga a
 * declará-lo aqui e a decisão volta a ficar visível.
 */
interface SupplierFromSupabase {
  id: string;
  average_shipping_time: string;

  // Servem só para esconder produto do catálogo — fornecedor inativo, e
  // produto zerado de quem conta estoque. Não identificam ninguém, então não
  // ferem a regra acima.
  status: 'active' | 'inactive';
  controla_estoque: boolean;
}

interface CatalogProductFromSupabase {
  id: string;
  name: string;
  description: string;
  category: string;
  image_url: string;
  images: string[] | null;
  supplier_price: number;
  stock: number;
  status: string;
  supplier_id: string | null;
  created_at?: string;
  suppliers?: SupplierFromSupabase | SupplierFromSupabase[] | null;
}

const PRODUTOS_POR_PAGINA = 12;

export default function Catalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [ordem, setOrdem] = useState<'recentes' | 'preco-asc' | 'preco-desc' | 'nome'>(
    'recentes'
  );
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadCatalogProducts = async () => {
    setLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase
      .from('catalog_products')
      .select(`
        id,
        name,
        description,
        category,
        image_url,
        images,
        supplier_price,
        stock,
        status,
        supplier_id,
        created_at,
        suppliers (
          id,
          average_shipping_time,
          status,
          controla_estoque
        )
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    setLoading(false);

    if (error) {
      setProducts([]);
      setErrorMessage('Não foi possível carregar os produtos do catálogo.');
      return;
    }

    const formattedProducts: Product[] = ((data || []) as CatalogProductFromSupabase[])
      // Duas coisas tiram um produto do catálogo aqui: fornecedor inativo, e
      // produto sem estoque de fornecedor que conta estoque.
      //
      // O filtro é aqui e não na consulta porque exigir a junção no banco
      // (`suppliers!inner`) também derrubaria os produtos sem fornecedor
      // vinculado, que hoje aparecem. Quem não tem fornecedor continua como
      // estava; quem tem, obedece o status dele.
      //
      // Isso vale só para o catálogo. Pedido em andamento não é afetado, e o
      // fornecedor continua enxergando tudo no Portal.
      .filter((product) => {
        const fornecedor = Array.isArray(product.suppliers)
          ? product.suppliers[0]
          : product.suppliers;

        if (fornecedor?.status === 'inactive') {
          return false;
        }

        // Só vale para quem ligou o controle. O importador de catálogo grava
        // estoque 0 em tudo que sobe, então aplicar isso a todos esvaziaria o
        // catálogo inteiro de uma vez.
        if (fornecedor?.controla_estoque && Number(product.stock || 0) <= 0) {
          return false;
        }

        return true;
      })
      .map(
      (product) => {
        const supplier = Array.isArray(product.suppliers)
          ? product.suppliers[0]
          : product.suppliers;

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          category: product.category,
          image: product.image_url,
          images: product.images ?? [],
          supplierPrice: Number(product.supplier_price || 0),
          stock: Number(product.stock || 0),

          supplierId: product.supplier_id,

          // Nome, empresa, WhatsApp, e-mail e cidade do fornecedor deixaram de
          // ser buscados. Esconder na tela e continuar enviando ao navegador
          // não esconderia nada: bastaria abrir o inspetor. O prazo de envio
          // fica, porque o vendedor precisa dele para decidir o anúncio e não
          // identifica ninguém.
          supplierName: null,
          supplierCompanyName: null,
          supplierWhatsapp: null,
          supplierEmail: null,
          supplierCity: null,
          supplierState: null,
          supplierShippingTime: supplier?.average_shipping_time || null,
        };
      }
    );

    setProducts(formattedProducts);
  };

  useEffect(() => {
    loadCatalogProducts();
  }, []);

  /** Opções montadas a partir do que existe no catálogo, não de lista fixa. */
  const categorias = useMemo(() => {
    const encontradas = new Set(products.map((produto) => produto.category).filter(Boolean));
    return ['Todos', ...[...encontradas].sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const busca = searchTerm.trim().toLowerCase();

    const encontrados = products.filter((product) => {
      // Sem busca por fornecedor: digitar o nome de um e ver o catálogo dele
      // filtrado revelaria exatamente o que a tela deixou de mostrar.
      const matchesSearch =
        !busca ||
        product.name.toLowerCase().includes(busca) ||
        product.description.toLowerCase().includes(busca) ||
        product.category.toLowerCase().includes(busca);

      const matchesCategory =
        selectedCategory === 'Todos' || product.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });

    // Cópia antes de ordenar: sort altera o array original, e o original aqui
    // é o resultado do filter, mas manter o hábito evita surpresa depois.
    return [...encontrados].sort((a, b) => {
      if (ordem === 'preco-asc') return a.supplierPrice - b.supplierPrice;
      if (ordem === 'preco-desc') return b.supplierPrice - a.supplierPrice;
      if (ordem === 'nome') return a.name.localeCompare(b.name, 'pt-BR');
      return 0; // recentes: mantém a ordem que veio do banco
    });
  }, [products, searchTerm, selectedCategory, ordem]);

  const filtroAtivo =
    Boolean(searchTerm.trim()) || selectedCategory !== 'Todos';

  const limparFiltros = () => {
    setSearchTerm('');
    setSelectedCategory('Todos');
  };

  const totalPaginas = Math.max(1, Math.ceil(filteredProducts.length / PRODUTOS_POR_PAGINA));

  // Volta para a primeira sempre que o resultado muda: sem isso, filtrar
  // estando na página 3 mostraria uma lista vazia sem explicação.
  useEffect(() => {
    setPaginaAtual(1);
  }, [searchTerm, selectedCategory, ordem]);

  const produtosDaPagina = useMemo(() => {
    const inicio = (paginaAtual - 1) * PRODUTOS_POR_PAGINA;
    return filteredProducts.slice(inicio, inicio + PRODUTOS_POR_PAGINA);
  }, [filteredProducts, paginaAtual]);

  /**
   * Números a exibir: sempre a primeira e a última, a atual e as vizinhas, com
   * reticências no lugar do que foi omitido. Evita uma fileira de 60 botões
   * quando o catálogo crescer.
   */
  const paginasVisiveis = useMemo(() => {
    if (totalPaginas <= 7) {
      return Array.from({ length: totalPaginas }, (_, i) => i + 1);
    }

    const paginas = new Set([1, totalPaginas, paginaAtual]);

    if (paginaAtual - 1 > 1) paginas.add(paginaAtual - 1);
    if (paginaAtual + 1 < totalPaginas) paginas.add(paginaAtual + 1);

    const ordenadas = [...paginas].sort((a, b) => a - b);
    const comLacunas: (number | 'lacuna')[] = [];

    ordenadas.forEach((pagina, indice) => {
      if (indice > 0 && pagina - ordenadas[indice - 1] > 1) {
        comLacunas.push('lacuna');
      }
      comLacunas.push(pagina);
    });

    return comLacunas;
  }, [totalPaginas, paginaAtual]);

  const formatCurrency = (value: number) => {
    return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 dark:text-white">
            Catálogo
          </h1>

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            Escolha produtos reais vinculados a fornecedores para preparar anúncios.
          </p>
        </div>

        <button
          onClick={loadCatalogProducts}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-medium transition-colors"
        >
          <Package className="w-4 h-4" />
          Atualizar catálogo
        </button>
      </div>

      {/* Barra única, sem cartão em volta: é ferramenta, não conteúdo. Os
          filtros são seletores em vez de botões porque a lista de categorias
          cresce com o catálogo, e uma fileira de botões estoura a linha. */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />

          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar produto ou categoria"
            aria-label="Buscar no catálogo"
            className="w-full h-11 pl-10 pr-4 rounded-lg bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 text-sm text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          {categorias.length > 2 && (
            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              aria-label="Filtrar por categoria"
              className="h-11 px-3 rounded-lg bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 text-sm text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            >
              {categorias.map((categoria) => (
                <option key={categoria} value={categoria}>
                  {categoria === 'Todos' ? 'Todas as categorias' : categoria}
                </option>
              ))}
            </select>
          )}

          <select
            value={ordem}
            onChange={(event) => setOrdem(event.target.value as typeof ordem)}
            aria-label="Ordenar catálogo"
            className="h-11 px-3 rounded-lg bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 text-sm text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
          >
            <option value="recentes">Mais recentes</option>
            <option value="preco-asc">Menor preço</option>
            <option value="preco-desc">Maior preço</option>
            <option value="nome">Nome (A-Z)</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 -mt-2">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          {filteredProducts.length === products.length
            ? `${products.length} produto${products.length === 1 ? '' : 's'}`
            : `${filteredProducts.length} de ${products.length} produtos`}
          {totalPaginas > 1 && ` · página ${paginaAtual} de ${totalPaginas}`}
        </p>

        {filtroAtivo && (
          <button
            onClick={limparFiltros}
            className="inline-flex items-center gap-1 text-sm font-medium text-navy-900 dark:text-white hover:underline"
          >
            <X className="w-3.5 h-3.5" />
            Limpar
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />

          <p className="text-red-700 dark:text-red-400 text-sm font-medium">
            {errorMessage}
          </p>
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-black dark:border-navy-700 dark:border-t-white rounded-full animate-spin mx-auto" />

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-4">
            Carregando produtos do catálogo...
          </p>
        </div>
      ) : filteredProducts.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {produtosDaPagina.map((product) => (
            <button
              key={product.id}
              onClick={() => setSelectedProduct(product)}
              className="text-left bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-all"
            >
              <div className="relative bg-white">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full aspect-square object-contain bg-white p-2"
                />

                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-white/90 text-navy-900 text-[10px] font-semibold">
                  {product.category}
                </span>
              </div>

              <div className="p-3 space-y-2">
                <h3 className="text-navy-900 dark:text-white font-bold text-sm line-clamp-2 min-h-[2.5rem]">
                  {product.name}
                </h3>

                {/* O catálogo só traz produto ativo, então "em estoque" vale
                    para todos os que chegam aqui. É sinal de disponibilidade,
                    não quantidade — quem tem o número é o fornecedor. */}
                <p className="flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true" />
                  Em estoque
                </p>

                <div className="bg-gray-50 dark:bg-navy-700 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500 dark:text-slate-400">
                    Preço
                  </p>

                  <p className="text-xs font-bold text-navy-900 dark:text-white">
                    {formatCurrency(product.supplierPrice)}
                  </p>
                </div>

                <div className="w-full px-3 py-1.5 rounded-lg bg-black text-white text-xs font-semibold text-center">
                  Cadastrar produto
                </div>
              </div>
            </button>
          ))}
          </div>

          {totalPaginas > 1 && (
            <nav
              aria-label="Páginas do catálogo"
              className="flex flex-wrap items-center justify-center gap-1.5 pt-2"
            >
              <button
                onClick={() => setPaginaAtual((atual) => Math.max(1, atual - 1))}
                disabled={paginaAtual === 1}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-gray-200 dark:border-navy-700 text-sm font-medium text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>

              {paginasVisiveis.map((pagina, indice) =>
                pagina === 'lacuna' ? (
                  <span
                    key={`lacuna-${indice}`}
                    className="w-9 h-9 flex items-center justify-center text-gray-400"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={pagina}
                    onClick={() => setPaginaAtual(pagina)}
                    aria-current={pagina === paginaAtual ? 'page' : undefined}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                      pagina === paginaAtual
                        ? 'bg-black text-white dark:bg-white dark:text-navy-900'
                        : 'border border-gray-200 dark:border-navy-700 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700'
                    }`}
                  >
                    {pagina}
                  </button>
                )
              )}

              <button
                onClick={() => setPaginaAtual((atual) => Math.min(totalPaginas, atual + 1))}
                disabled={paginaAtual === totalPaginas}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-gray-200 dark:border-navy-700 text-sm font-medium text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Próxima
                <ChevronRight className="w-4 h-4" />
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
          <Package className="w-12 h-12 text-gray-300 dark:text-navy-600 mx-auto mb-4" />

          {/* Catálogo vazio e filtro sem resultado são situações diferentes:
              numa não há o que fazer, na outra basta limpar o filtro. */}
          <h3 className="text-navy-900 dark:text-white font-semibold">
            {filtroAtivo ? 'Nenhum produto com esses filtros' : 'Catálogo vazio'}
          </h3>

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-2">
            {filtroAtivo
              ? 'Tente outra busca, outra categoria, ou limpe os filtros.'
              : 'Ainda não há produtos disponíveis. Assim que a equipe cadastrar, eles aparecem aqui.'}
          </p>

          {filtroAtivo && (
            <button
              onClick={limparFiltros}
              className="inline-flex items-center justify-center gap-2 mt-6 px-5 py-3 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors"
            >
              <X className="w-4 h-4" />
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}