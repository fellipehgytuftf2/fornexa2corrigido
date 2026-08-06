import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Package,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  Truck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

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
  suppliers?: SupplierFromSupabase | SupplierFromSupabase[] | null;
}

const demoCustomers = [
  {
    name: 'Mariana Costa',
    email: 'mariana@email.com',
    phone: '(11) 99999-1001',
  },
  {
    name: 'Lucas Almeida',
    email: 'lucas@email.com',
    phone: '(21) 98888-2002',
  },
  {
    name: 'Fernanda Souza',
    email: 'fernanda@email.com',
    phone: '(31) 97777-3003',
  },
  {
    name: 'Rafael Santos',
    email: 'rafael@email.com',
    phone: '(41) 96666-4004',
  },
];

export default function MyProducts() {
  const [products, setProducts] = useState<UserProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

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
  };

  useEffect(() => {
    loadProducts();
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
        product.marketplace.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [products, searchTerm]);

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

  const handleRegisterSale = async (product: UserProduct) => {
    const supplier = getSupplier(product);

    if (!product.supplier_id || !supplier) {
      setErrorMessage('Este produto não tem fornecedor vinculado. Não é possível registrar venda.');
      return;
    }

    setActionId(product.id);
    setErrorMessage('');

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setActionId(null);
      setErrorMessage('Sessão não encontrada. Faça login novamente.');
      return;
    }

    const customer = demoCustomers[Math.floor(Math.random() * demoCustomers.length)];

    const { error } = await supabase.from('orders').insert({
      user_id: user.id,
      product_id: product.id,
      product_name: product.name,
      product_image_url: product.image_url,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      supplier_id: product.supplier_id,
      supplier_name: supplier.name,
      supplier_whatsapp: supplier.whatsapp,
      supplier_price: product.supplier_price,
      sale_price: product.sale_price,
      profit: product.margin,
      status: 'sent_to_supplier',
      marketplace: product.marketplace || 'Mercado Livre',
      tracking_code: '',
    });

    setActionId(null);

    if (error) {
      console.error('Erro ao registrar venda:', error);
      setErrorMessage(`Não foi possível registrar a venda: ${error.message}`);
      return;
    }

    showSuccess('Venda registrada e pedido criado com fornecedor correto.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 dark:text-white">
            Meus Produtos
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

      <div className="">
        <p className="t">
         
        </p>

        <p className="">
        
        </p>
      </div>

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
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {filteredProducts.map((product) => {
            const supplier = getSupplier(product);
            const marginPercent = getMarginPercent(product);
            const productHasSupplier = Boolean(product.supplier_id && supplier);

            return (
              <div
                key={product.id}
                className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex gap-4">
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-24 h-24 rounded-xl object-cover"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-navy-700 dark:text-slate-300">
                          {product.marketplace}
                        </span>

                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            product.status === 'active'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-700 dark:bg-navy-700 dark:text-slate-300'
                          }`}
                        >
                          {product.status === 'active' ? 'Ativo' : product.status}
                        </span>
                      </div>

                      <h3 className="text-navy-900 dark:text-white font-bold mt-3 line-clamp-2">
                        {product.name}
                      </h3>

                      <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
                        Salvo em {formatDate(product.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                    <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-3">
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        Preço fornecedor
                      </p>

                      <p className="text-sm font-bold text-navy-900 dark:text-white mt-1">
                        {formatCurrency(product.supplier_price)}
                      </p>
                    </div>

                    <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-3">
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        Preço venda
                      </p>

                      <p className="text-sm font-bold text-navy-900 dark:text-white mt-1">
                        {formatCurrency(product.sale_price)}
                      </p>
                    </div>

                    <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3">
                      <p className="text-xs text-green-700 dark:text-green-400">
                        Lucro
                      </p>

                      <p className="text-sm font-bold text-green-700 dark:text-green-400 mt-1">
                        {formatCurrency(product.margin)} · {marginPercent.toFixed(0)}%
                      </p>
                    </div>
                  </div>

                  {/* Quem fornece o produto não aparece aqui de propósito. O
                      vendedor só precisa saber que o envio está garantido e em
                      quanto tempo; a identidade do fornecedor entra depois da
                      venda, na tela de Pedidos, onde ele precisa dela para
                      pagar e resolver problema. */}
                  <div className="mt-5 bg-gray-50 dark:bg-navy-700 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Truck className="w-5 h-5 text-gray-600 dark:text-slate-400 mt-0.5" />

                      <div>
                        <p className="text-sm font-medium text-navy-900 dark:text-white">
                          {productHasSupplier
                            ? 'Envio pelo fornecedor'
                            : 'Fornecedor não vinculado'}
                        </p>

                        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                          {productHasSupplier
                            ? `Prazo médio: ${
                                supplier?.average_shipping_time || 'não informado'
                              }`
                            : 'Este produto precisa ter supplier_id para gerar pedido corretamente.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => handleRegisterSale(product)}
                      disabled={actionId === product.id || !productHasSupplier}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      {actionId === product.id ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Processando...
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-4 h-4" />
                          Registrar venda
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleDeleteProduct(product.id)}
                      disabled={actionId === product.id}
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
          <Store className="w-12 h-12 text-gray-300 dark:text-navy-600 mx-auto mb-4" />

          <h3 className="text-navy-900 dark:text-white font-semibold">
            Nenhum produto salvo
          </h3>

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-2">
            Vá até o Catálogo, escolha um produto e salve em Meus Produtos.
          </p>
        </div>
      )}
    </div>
  );
}