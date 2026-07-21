import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle,
  Clock,
  DollarSign,
  Package,
  RefreshCw,
  Search,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Order {
  id: string;
  user_id: string;
  product_name: string;
  product_image_url: string | null;
  customer_name: string;
  supplier_name: string | null;
  supplier_price: number;
  sale_price: number;
  profit: number;
  status: 'pending' | 'sent_to_supplier' | 'shipped' | 'delivered' | 'cancelled';
  marketplace: string;
  created_at: string;
}

const statusLabels: Record<Order['status'], string> = {
  pending: 'Pendente',
  sent_to_supplier: 'Enviado ao fornecedor',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

export default function Financial() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadFinancialData = async () => {
    setLoading(true);
    setErrorMessage('');

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setOrders([]);
      setLoading(false);
      setErrorMessage('Sessão não encontrada. Faça login novamente.');
      return;
    }

    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        user_id,
        product_name,
        product_image_url,
        customer_name,
        supplier_name,
        supplier_price,
        sale_price,
        profit,
        status,
        marketplace,
        created_at
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setLoading(false);

    if (error) {
      console.error('Erro ao carregar financeiro:', error);
      setOrders([]);
      setErrorMessage(`Não foi possível carregar o financeiro: ${error.message}`);
      return;
    }

    setOrders((data || []) as Order[]);
  };

  useEffect(() => {
    loadFinancialData();
  }, []);

  const filteredOrders = useMemo(() => {
    const search = searchTerm.toLowerCase();

    return orders.filter((order) => {
      return (
        order.product_name.toLowerCase().includes(search) ||
        order.customer_name.toLowerCase().includes(search) ||
        order.supplier_name?.toLowerCase().includes(search) ||
        order.marketplace.toLowerCase().includes(search) ||
        statusLabels[order.status].toLowerCase().includes(search)
      );
    });
  }, [orders, searchTerm]);

  const financialSummary = useMemo(() => {
    const validOrders = orders.filter((order) => order.status !== 'cancelled');

    const totalRevenue = validOrders.reduce(
      (total, order) => total + Number(order.sale_price || 0),
      0
    );

    const supplierCost = validOrders.reduce(
      (total, order) => total + Number(order.supplier_price || 0),
      0
    );

    const totalProfit = validOrders.reduce(
      (total, order) => total + Number(order.profit || 0),
      0
    );

    const averageTicket =
      validOrders.length > 0 ? totalRevenue / validOrders.length : 0;

    const averageMargin =
      totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    const deliveredOrders = validOrders.filter(
      (order) => order.status === 'delivered'
    ).length;

    const activeOrders = validOrders.filter(
      (order) => order.status !== 'delivered'
    ).length;

    return {
      totalOrders: validOrders.length,
      totalRevenue,
      supplierCost,
      totalProfit,
      averageTicket,
      averageMargin,
      deliveredOrders,
      activeOrders,
    };
  }, [orders]);

  const statusSummary = useMemo(() => {
    return orders.reduce<Record<string, { label: string; count: number; revenue: number }>>(
      (acc, order) => {
        const label = statusLabels[order.status];

        if (!acc[order.status]) {
          acc[order.status] = {
            label,
            count: 0,
            revenue: 0,
          };
        }

        acc[order.status].count += 1;

        if (order.status !== 'cancelled') {
          acc[order.status].revenue += Number(order.sale_price || 0);
        }

        return acc;
      },
      {}
    );
  }, [orders]);

  const marketplaceSummary = useMemo(() => {
    return orders
      .filter((order) => order.status !== 'cancelled')
      .reduce<Record<string, { count: number; revenue: number; profit: number }>>(
        (acc, order) => {
          const marketplace = order.marketplace || 'Não informado';

          if (!acc[marketplace]) {
            acc[marketplace] = {
              count: 0,
              revenue: 0,
              profit: 0,
            };
          }

          acc[marketplace].count += 1;
          acc[marketplace].revenue += Number(order.sale_price || 0);
          acc[marketplace].profit += Number(order.profit || 0);

          return acc;
        },
        {}
      );
  }, [orders]);

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

  const getStatusClassName = (status: Order['status']) => {
    if (status === 'delivered') {
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    }

    if (status === 'cancelled') {
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    }

    if (status === 'shipped') {
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    }

    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 dark:text-white">
            Financeiro
          </h1>

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            Acompanhe faturamento, custos, lucro, ticket médio e margem das vendas.
          </p>
        </div>

        <button
          onClick={loadFinancialData}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar financeiro
        </button>
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
            Carregando financeiro...
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    Faturamento
                  </p>

                  <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
                    {formatCurrency(financialSummary.totalRevenue)}
                  </p>
                </div>

                <DollarSign className="w-6 h-6 text-gray-500 dark:text-slate-400" />
              </div>
            </div>

            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    Custo fornecedor
                  </p>

                  <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
                    {formatCurrency(financialSummary.supplierCost)}
                  </p>
                </div>

                <Truck className="w-6 h-6 text-gray-500 dark:text-slate-400" />
              </div>
            </div>

            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    Lucro
                  </p>

                  <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                    {formatCurrency(financialSummary.totalProfit)}
                  </p>
                </div>

                <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>

            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    Margem média
                  </p>

                  <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
                    {financialSummary.averageMargin.toFixed(1)}%
                  </p>
                </div>

                <BarChart3 className="w-6 h-6 text-gray-500 dark:text-slate-400" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Pedidos válidos
              </p>

              <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
                {financialSummary.totalOrders}
              </p>
            </div>

            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Pedidos em andamento
              </p>

              <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
                {financialSummary.activeOrders}
              </p>
            </div>

            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Pedidos entregues
              </p>

              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                {financialSummary.deliveredOrders}
              </p>
            </div>

            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Ticket médio
              </p>

              <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
                {formatCurrency(financialSummary.averageTicket)}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-4 shadow-sm">
            <div className="relative">
              <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />

              <input
                type="text"
                placeholder="Buscar por produto, cliente, fornecedor, marketplace ou status..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-200 dark:border-navy-700">
                <h2 className="text-navy-900 dark:text-white font-semibold">
                  Resumo por status
                </h2>

                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                  Quantidade e faturamento por etapa do pedido.
                </p>
              </div>

              {Object.keys(statusSummary).length > 0 ? (
                <div className="divide-y divide-gray-200 dark:divide-navy-700">
                  {Object.entries(statusSummary).map(([status, item]) => (
                    <div key={status} className="p-5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {status === 'delivered' ? (
                          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <Clock className="w-5 h-5 text-gray-500 dark:text-slate-400" />
                        )}

                        <div>
                          <p className="text-sm font-semibold text-navy-900 dark:text-white">
                            {item.label}
                          </p>

                          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                            {item.count} pedido(s)
                          </p>
                        </div>
                      </div>

                      <p className="text-sm font-bold text-navy-900 dark:text-white">
                        {formatCurrency(item.revenue)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <Package className="w-10 h-10 text-gray-300 dark:text-navy-600 mx-auto mb-3" />

                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    Nenhum status para mostrar.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-200 dark:border-navy-700">
                <h2 className="text-navy-900 dark:text-white font-semibold">
                  Resumo por marketplace
                </h2>

                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                  Faturamento e lucro separado por canal de venda.
                </p>
              </div>

              {Object.keys(marketplaceSummary).length > 0 ? (
                <div className="divide-y divide-gray-200 dark:divide-navy-700">
                  {Object.entries(marketplaceSummary).map(([marketplace, item]) => (
                    <div
                      key={marketplace}
                      className="p-5 flex items-center justify-between gap-4"
                    >
                      <div>
                        <p className="text-sm font-semibold text-navy-900 dark:text-white">
                          {marketplace}
                        </p>

                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                          {item.count} pedido(s)
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-bold text-navy-900 dark:text-white">
                          {formatCurrency(item.revenue)}
                        </p>

                        <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-1">
                          Lucro {formatCurrency(item.profit)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <Wallet className="w-10 h-10 text-gray-300 dark:text-navy-600 mx-auto mb-3" />

                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    Nenhum marketplace para mostrar.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-200 dark:border-navy-700">
              <h2 className="text-navy-900 dark:text-white font-semibold">
                Transações recentes
              </h2>

              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                Últimos pedidos registrados no FORNEXA.
              </p>
            </div>

            {filteredOrders.length > 0 ? (
              <div className="divide-y divide-gray-200 dark:divide-navy-700">
                {filteredOrders.map((order) => (
                  <div key={order.id} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={order.product_image_url || ''}
                          alt={order.product_name}
                          className="w-12 h-12 rounded-xl object-cover bg-gray-100 dark:bg-navy-700"
                        />

                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-navy-900 dark:text-white truncate">
                            {order.product_name}
                          </p>

                          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                            Cliente: {order.customer_name}
                          </p>

                          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                            Fornecedor: {order.supplier_name || 'Não informado'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-navy-900 dark:text-white">
                          {formatCurrency(order.sale_price)}
                        </p>

                        <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-1">
                          + {formatCurrency(order.profit)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusClassName(
                          order.status
                        )}`}
                      >
                        {statusLabels[order.status]}
                      </span>

                      <span className="text-xs text-gray-500 dark:text-slate-400">
                        {formatDate(order.created_at)} · {order.marketplace}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-16 text-center">
                <Package className="w-12 h-12 text-gray-300 dark:text-navy-600 mx-auto mb-4" />

                <h3 className="text-navy-900 dark:text-white font-semibold">
                  Nenhuma transação encontrada
                </h3>

                <p className="text-gray-500 dark:text-slate-400 text-sm mt-2">
                  Registre uma venda em Meus Produtos para aparecer aqui.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}