import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Product } from '../../types';
import ProductModal from '../../components/dashboard/ProductModal';

interface SupplierFromSupabase {
  id: string;
  name: string;
  company_name: string;
  whatsapp: string;
  email: string;
  city: string;
  state: string;
  average_shipping_time: string;
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

export default function Catalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchTerm] = useState('');
  const [selectedCategory] = useState('Todos');
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
          name,
          company_name,
          whatsapp,
          email,
          city,
          state,
          average_shipping_time
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

    const formattedProducts: Product[] = ((data || []) as CatalogProductFromSupabase[]).map(
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
          supplierName: supplier?.name || null,
          supplierCompanyName: supplier?.company_name || null,
          supplierWhatsapp: supplier?.whatsapp || null,
          supplierEmail: supplier?.email || null,
          supplierCity: supplier?.city || null,
          supplierState: supplier?.state || null,
          supplierShippingTime: supplier?.average_shipping_time || null,
        };
      }
    );

    setProducts(formattedProducts);
  };

  useEffect(() => {
    loadCatalogProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.supplierName?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory =
        selectedCategory === 'Todos' || product.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

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

      <div className="">
        <p className="">
         
        </p>

  
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {filteredProducts.map((product) => (
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

                <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-1">
                  {product.supplierName || 'Fornecedor não vinculado'}
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 dark:bg-navy-700 rounded-lg p-2">
                    <p className="text-[10px] text-gray-500 dark:text-slate-400">
                      Preço
                    </p>

                    <p className="text-xs font-bold text-navy-900 dark:text-white">
                      {formatCurrency(product.supplierPrice)}
                    </p>
                  </div>

                  <div className="bg-gray-50 dark:bg-navy-700 rounded-lg p-2">
                    <p className="text-[10px] text-gray-500 dark:text-slate-400">
                      Estoque
                    </p>

                    <p className="text-xs font-bold text-navy-900 dark:text-white">
                      {product.stock} un.
                    </p>
                  </div>
                </div>

                <div className="w-full px-3 py-1.5 rounded-lg bg-black text-white text-xs font-semibold text-center">
                  Cadastrar produto
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
          <Package className="w-12 h-12 text-gray-300 dark:text-navy-600 mx-auto mb-4" />

          <h3 className="text-navy-900 dark:text-white font-semibold">
            Nenhum produto encontrado
          </h3>

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-2">
            Tente mudar a busca ou cadastrar produtos na tabela catalog_products.
          </p>
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