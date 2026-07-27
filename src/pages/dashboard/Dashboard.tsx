import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  Link2,
  Package,
  Receipt,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '../../lib/supabase';

interface UserProduct {
  id: string;
  name: string;
  image_url: string;
  supplier_price: number;
  sale_price: number;
  margin: number;
  marketplace: string;
  created_at: string;
}

interface Order {
  id: string;
  product_name: string;
  product_image_url: string;
  customer_name: string;
  supplier_name: string;
  sale_price: number;
  profit: number;
  status: 'pending' | 'sent_to_supplier' | 'shipped' | 'delivered';
  marketplace: string;
  created_at: string;
}

interface MlConnection {
  id: string;
  user_id: string;
  status: 'disconnected' | 'prepared' | 'connected';
}

interface DashboardProps {
  darkMode: boolean;
}

const statusConfig: Record<Order['status'], { label: string; color: string }> = {
  pending: { label: 'Pendente', color: '#FFD300' },
  sent_to_supplier: { label: 'Enviado ao fornecedor', color: '#4a90d9' },
  shipped: { label: 'A caminho', color: '#9b7fd4' },
  delivered: { label: 'Entregue', color: '#3ecf8e' },
};

const dateKey = (value: string | Date) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildHourlyBuckets = (targetDateKey: string, orders: Order[]) => {
  const buckets = Array.from({ length: 12 }, (_, index) => ({
    label: `${String(index * 2).padStart(2, '0')}h`,
    faturamento: 0,
  }));

  orders.forEach((order) => {
    const orderDate = new Date(order.created_at);

    if (dateKey(orderDate) !== targetDateKey) {
      return;
    }

    const bucketIndex = Math.min(11, Math.floor(orderDate.getHours() / 2));
    buckets[bucketIndex].faturamento += Number(order.sale_price || 0);
  });

  return buckets;
};

const buildWeeklyBuckets = (orders: Order[]) => {
  const days: { label: string; key: string; faturamento: number }[] = [];

  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    days.push({
      key: dateKey(date),
      label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      faturamento: 0,
    });
  }

  orders.forEach((order) => {
    const key = dateKey(order.created_at);
    const match = days.find((day) => day.key === key);

    if (match) {
      match.faturamento += Number(order.sale_price || 0);
    }
  });

  return days;
};

export default function Dashboard({ darkMode }: DashboardProps) {
  const [products, setProducts] = useState<UserProduct[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [mercadoLivreConnected, setMercadoLivreConnected] = useState(false);

  const [period, setPeriod] = useState<'today' | 'week' | 'custom'>('today');
  const [customDate, setCustomDate] = useState('');
  const [pendingDate, setPendingDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const loadDashboardData = async () => {
    setLoading(true);
    setErrorMessage('');

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setLoading(false);
      setErrorMessage('Sessão não encontrada. Faça login novamente.');
      setProducts([]);
      setOrders([]);
      setMercadoLivreConnected(false);
      return;
    }

    const [productsResult, ordersResult, mlConnectionResult] = await Promise.all([
      supabase
        .from('user_products')
        .select(
          'id, name, image_url, supplier_price, sale_price, margin, marketplace, created_at'
        )
        .order('created_at', { ascending: false }),

      supabase
        .from('orders')
        .select(
          'id, product_name, product_image_url, customer_name, supplier_name, sale_price, profit, status, marketplace, created_at'
        )
        .order('created_at', { ascending: false }),

      supabase
        .from('ml_connections')
        .select('id, user_id, status')
        .eq('user_id', user.id)
        .maybeSingle<MlConnection>(),
    ]);

    setLoading(false);

    if (productsResult.error || ordersResult.error || mlConnectionResult.error) {
      setErrorMessage('Não foi possível carregar os dados do dashboard.');
      setProducts([]);
      setOrders([]);
      setMercadoLivreConnected(false);
      return;
    }

    setProducts((productsResult.data || []) as UserProduct[]);
    setOrders((ordersResult.data || []) as Order[]);

    const mlStatus = mlConnectionResult.data?.status;
    setMercadoLivreConnected(mlStatus === 'prepared' || mlStatus === 'connected');
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const todayKey = dateKey(new Date());

  const todayOrders = useMemo(() => {
    return orders.filter((order) => dateKey(order.created_at) === todayKey);
  }, [orders, todayKey]);

  const last30Orders = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return orders.filter((order) => new Date(order.created_at) >= cutoff);
  }, [orders]);

  const yesterdayKey = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return dateKey(yesterday);
  }, [todayKey]);

  const yesterdayOrders = useMemo(() => {
    return orders.filter((order) => dateKey(order.created_at) === yesterdayKey);
  }, [orders, yesterdayKey]);

  const summary = useMemo(() => {
    const todayRevenue = todayOrders.reduce((sum, o) => sum + Number(o.sale_price || 0), 0);
    const todayProfit = todayOrders.reduce((sum, o) => sum + Number(o.profit || 0), 0);
    const todayTicket = todayOrders.length ? todayRevenue / todayOrders.length : 0;

    const last30Revenue = last30Orders.reduce((sum, o) => sum + Number(o.sale_price || 0), 0);

    const yesterdayRevenue = yesterdayOrders.reduce((sum, o) => sum + Number(o.sale_price || 0), 0);
    const yesterdayProfit = yesterdayOrders.reduce((sum, o) => sum + Number(o.profit || 0), 0);
    const yesterdayTicket = yesterdayOrders.length ? yesterdayRevenue / yesterdayOrders.length : 0;

    return {
      todayOrdersCount: todayOrders.length,
      todayRevenue,
      todayProfit,
      todayTicket,
      last30Count: last30Orders.length,
      last30Revenue,
      yesterdayOrdersCount: yesterdayOrders.length,
      yesterdayRevenue,
      yesterdayProfit,
      yesterdayTicket,
    };
  }, [todayOrders, last30Orders, yesterdayOrders]);

  // Crescimento percentual de hoje em relação a ontem. Quando não houve
  // nenhum valor ontem, qualquer valor hoje conta como alta de 100%; sem
  // valor em nenhum dos dois dias, não há crescimento a mostrar (0%).
  const calcGrowth = (current: number, previous: number) => {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
  };

  const growth = useMemo(
    () => ({
      orders: calcGrowth(summary.todayOrdersCount, summary.yesterdayOrdersCount),
      revenue: calcGrowth(summary.todayRevenue, summary.yesterdayRevenue),
      profit: calcGrowth(summary.todayProfit, summary.yesterdayProfit),
      ticket: calcGrowth(summary.todayTicket, summary.yesterdayTicket),
    }),
    [summary]
  );

  const statusBreakdown = useMemo(() => {
    const total = orders.length || 1;

    return (Object.keys(statusConfig) as Order['status'][]).map((statusKey) => {
      const count = orders.filter((order) => order.status === statusKey).length;

      return {
        key: statusKey,
        label: statusConfig[statusKey].label,
        color: statusConfig[statusKey].color,
        count,
        percentage: Math.round((count / total) * 100),
      };
    });
  }, [orders]);

  const chartData = useMemo(() => {
    if (period === 'week') {
      return buildWeeklyBuckets(orders);
    }

    const targetKey = period === 'custom' && customDate ? customDate : todayKey;
    return buildHourlyBuckets(targetKey, orders);
  }, [period, customDate, orders, todayKey]);

  const chartSubtitle = useMemo(() => {
    if (period === 'week') {
      return 'Últimos 7 dias';
    }

    const targetDate =
      period === 'custom' && customDate ? new Date(`${customDate}T00:00:00`) : new Date();

    return targetDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
    });
  }, [period, customDate]);

  const recentProducts = useMemo(() => products.slice(0, 4), [products]);
  const recentOrders = useMemo(() => orders.slice(0, 4), [orders]);

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

  const gridColor = darkMode ? '#253745' : '#e5e7eb';
  const axisColor = darkMode ? '#545A5B' : '#9ca3af';
  const tooltipBg = darkMode ? '#11212D' : '#ffffff';
  const tooltipBorder = darkMode ? '#253745' : '#e5e7eb';
  const tooltipText = darkMode ? '#ffffff' : '#111827';

  const renderGrowth = (value: number) => {
    const isPositive = value >= 0;
    const GrowthIcon = isPositive ? TrendingUp : TrendingDown;

    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium mt-2 ${
          isPositive ? 'text-success' : 'text-error'
        }`}
      >
        <GrowthIcon className="w-3 h-3" />
        {isPositive ? '+' : ''}
        {value.toFixed(0)}% em relação a ontem
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-3">
        <Link
          to="/dashboard/catalog"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-navy-900 hover:bg-navy-850 text-white text-sm font-medium transition-colors"
        >
          <Package className="w-4 h-4" />
          Ver catálogo
        </Link>

        <Link
          to="/dashboard/my-products"
          className="glow-gold-hover inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gold hover:bg-gold-hover text-black text-sm font-semibold transition-all"
        >
          <ShoppingCart className="w-4 h-4" />
          Meus Produtos
        </Link>
      </div>


      {errorMessage && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />

          <p className="text-red-700 dark:text-red-400 text-sm font-medium">
            {errorMessage}
          </p>
        </div>
      )}

      {!mercadoLivreConnected && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-700 dark:text-yellow-400 mt-0.5" />

          <div className="flex-1">
            <p className="text-yellow-700 dark:text-yellow-400 text-sm font-medium">
              Mercado Livre ainda não preparado
            </p>

            <p className="text-yellow-700 dark:text-yellow-400 text-sm mt-1">
              Prepare a conexão em Integrações para seguir o fluxo de anúncio do FORNEXA.
            </p>
          </div>

          <Link
            to="/dashboard/integrations"
            className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-black text-white text-sm font-medium"
          >
            <Link2 className="w-4 h-4" />
            Integrações
          </Link>
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-black dark:border-navy-700 dark:border-t-white rounded-full animate-spin mx-auto" />

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-4">
            Carregando dashboard...
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-navy-800 rounded-[18px] border border-gray-200 dark:border-navy-700 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-slate-400">Pedidos hoje</p>
                <div className="w-11 h-11 rounded-full bg-navy-900/10 dark:bg-white/10 flex items-center justify-center shrink-0">
                  <ShoppingCart className="w-5 h-5 text-navy-900 dark:text-white" />
                </div>
              </div>

              <p className="text-2xl font-bold text-navy-900 dark:text-white mt-3">
                {summary.todayOrdersCount}
              </p>

              {renderGrowth(growth.orders)}

              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                {summary.last30Count} em 30 dias
              </p>
            </div>

            <div className="bg-white dark:bg-navy-800 rounded-[18px] border border-gray-200 dark:border-navy-700 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-slate-400">Faturamento hoje</p>
                <div className="w-11 h-11 rounded-full bg-gold/15 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5 text-gold" />
                </div>
              </div>

              <p className="text-2xl font-bold text-gold mt-3">
                {formatCurrency(summary.todayRevenue)}
              </p>

              {renderGrowth(growth.revenue)}

              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                {formatCurrency(summary.last30Revenue)} em 30 dias
              </p>
            </div>

            <div className="bg-white dark:bg-navy-800 rounded-[18px] border border-gray-200 dark:border-navy-700 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-slate-400">Lucro hoje</p>
                <div className="w-11 h-11 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                  <Wallet className="w-5 h-5 text-success" />
                </div>
              </div>

              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-3">
                {formatCurrency(summary.todayProfit)}
              </p>

              {renderGrowth(growth.profit)}

              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                Margem sobre vendas de hoje
              </p>
            </div>

            <div className="bg-white dark:bg-navy-800 rounded-[18px] border border-gray-200 dark:border-navy-700 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-slate-400">Ticket médio</p>
                <div className="w-11 h-11 rounded-full bg-navy-900/10 dark:bg-white/10 flex items-center justify-center shrink-0">
                  <Receipt className="w-5 h-5 text-navy-900 dark:text-white" />
                </div>
              </div>

              <p className="text-2xl font-bold text-navy-900 dark:text-white mt-3">
                {formatCurrency(summary.todayTicket)}
              </p>

              {renderGrowth(growth.ticket)}

              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                {summary.todayOrdersCount} pedido(s) hoje
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[2.3fr_1fr] gap-4">
            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-navy-900 dark:text-white font-semibold">
                    Faturamento
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 capitalize">
                    {chartSubtitle}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setPeriod('today');
                      setShowDatePicker(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      period === 'today'
                        ? 'bg-gold border-gold text-black'
                        : 'border-gray-200 dark:border-navy-600 text-gray-500 dark:text-slate-400 hover:border-gold/60'
                    }`}
                  >
                    Hoje
                  </button>

                  <button
                    onClick={() => {
                      setPeriod('week');
                      setShowDatePicker(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      period === 'week'
                        ? 'bg-gold border-gold text-black'
                        : 'border-gray-200 dark:border-navy-600 text-gray-500 dark:text-slate-400 hover:border-gold/60'
                    }`}
                  >
                    7 dias
                  </button>

                  <div className="relative">
                    <button
                      onClick={() => {
                        setPendingDate(customDate);
                        setShowDatePicker((prev) => !prev);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                        period === 'custom'
                          ? 'bg-gold border-gold text-black'
                          : 'border-gray-200 dark:border-navy-600 text-gray-500 dark:text-slate-400 hover:border-gold/60'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      Escolher data
                    </button>

                    {showDatePicker && (
                      <div className="absolute right-0 top-full mt-2 z-10 p-3 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-700 shadow-lg flex flex-col gap-2 w-56">
                        <input
                          type="date"
                          max={todayKey}
                          value={pendingDate}
                          onChange={(event) => setPendingDate(event.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-800 text-navy-900 dark:text-white text-sm"
                        />

                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowDatePicker(false)}
                            className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-navy-600 text-xs font-medium text-gray-600 dark:text-slate-300"
                          >
                            Cancelar
                          </button>

                          <button
                            onClick={() => {
                              if (pendingDate) {
                                setCustomDate(pendingDate);
                                setPeriod('custom');
                                setShowDatePicker(false);
                              }
                            }}
                            disabled={!pendingDate}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-gold text-black text-xs font-semibold disabled:opacity-50"
                          >
                            Aplicar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="revenueGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FFD300" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#FFD300" stopOpacity={0} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid stroke={gridColor} vertical={false} />

                    <XAxis
                      dataKey="label"
                      tick={{ fill: axisColor, fontSize: 11 }}
                      axisLine={{ stroke: gridColor }}
                      tickLine={false}
                    />

                    <YAxis
                      tick={{ fill: axisColor, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={70}
                      tickFormatter={(value) => formatCurrency(Number(value))}
                    />

                    <Tooltip
                      contentStyle={{
                        background: tooltipBg,
                        border: `1px solid ${tooltipBorder}`,
                        borderRadius: 8,
                        color: tooltipText,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: tooltipText }}
                      formatter={(value) => [formatCurrency(Number(value)), 'Faturamento']}
                    />

                    <Area
                      type="monotone"
                      dataKey="faturamento"
                      stroke="#FFD300"
                      strokeWidth={2.5}
                      fill="url(#revenueGlow)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
              <h2 className="text-navy-900 dark:text-white font-semibold mb-4">
                Status dos pedidos
              </h2>

              <div className="space-y-4">
                {statusBreakdown.map((status) => (
                  <div key={status.key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-600 dark:text-slate-300 flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: status.color }}
                        />
                        {status.label}
                      </span>

                      <span className="text-xs text-gray-400 dark:text-slate-500">
                        {status.count}
                      </span>
                    </div>

                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-navy-900">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${status.percentage}%`,
                          backgroundColor: status.color,
                        }}
                      />
                    </div>
                  </div>
                ))}

                {orders.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-4">
                    Nenhum pedido registrado ainda.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-navy-700 flex items-center justify-between">
                <h2 className="text-navy-900 dark:text-white font-semibold">
                  Produtos recentes
                </h2>

                <Link
                  to="/dashboard/my-products"
                  className="text-sm font-medium text-navy-900 dark:text-white hover:underline"
                >
                  Ver todos
                </Link>
              </div>

              {recentProducts.length > 0 ? (
                <div className="divide-y divide-gray-200 dark:divide-navy-700">
                  {recentProducts.map((product) => (
                    <div key={product.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-10 h-10 rounded-lg object-cover"
                        />

                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-navy-900 dark:text-white truncate">
                            {product.name}
                          </p>

                          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                            {formatDate(product.created_at)} · {product.marketplace}
                          </p>
                        </div>
                      </div>

                      <p className="text-sm font-semibold text-navy-900 dark:text-white shrink-0">
                        {formatCurrency(product.sale_price)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-10 px-5 text-center">
                  <Package className="w-9 h-9 text-gray-300 dark:text-navy-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    Nenhum produto salvo ainda.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-navy-700 flex items-center justify-between">
                <h2 className="text-navy-900 dark:text-white font-semibold">
                  Últimos pedidos
                </h2>

                <Link
                  to="/dashboard/orders"
                  className="text-sm font-medium text-navy-900 dark:text-white hover:underline"
                >
                  Ver todos
                </Link>
              </div>

              {recentOrders.length > 0 ? (
                <div className="divide-y divide-gray-200 dark:divide-navy-700">
                  {recentOrders.map((order) => (
                    <div key={order.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={order.product_image_url}
                          alt={order.product_name}
                          className="w-10 h-10 rounded-lg object-cover"
                        />

                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-navy-900 dark:text-white truncate">
                            {order.product_name}
                          </p>

                          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                            {formatDate(order.created_at)}
                          </p>
                        </div>
                      </div>

                      <p className="text-sm font-semibold text-green-600 dark:text-green-400 shrink-0">
                        + {formatCurrency(order.profit)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-10 px-5 text-center">
                  <TrendingUp className="w-9 h-9 text-gray-300 dark:text-navy-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    Nenhum pedido registrado ainda.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}