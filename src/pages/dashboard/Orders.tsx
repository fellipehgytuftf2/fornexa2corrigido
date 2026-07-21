import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  MessageCircle,
  Package,
  RefreshCw,
  Send,
  Trash2,
  Truck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type OrderStatus = 'pending' | 'sent_to_supplier' | 'shipped' | 'delivered' | 'cancelled';

interface Supplier {
  id: string;
  name: string;
  company_name: string;
  whatsapp: string;
  city: string;
  state: string;
  status: 'active' | 'inactive';
}

interface Order {
  id: string;
  user_id: string;
  product_id: string | null;
  product_name: string;
  product_image_url: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  supplier_id: string | null;
  supplier_whatsapp: string | null;
  supplier_price: number;
  sale_price: number;
  profit: number;
  status: OrderStatus;
  tracking_code: string | null;
  created_at: string;
  suppliers?: Supplier | Supplier[] | null;
}

const statusLabels: Record<OrderStatus, string> = {
  pending: 'Pendente',
  sent_to_supplier: 'Enviado ao fornecedor',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadOrders = async () => {
    setLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        user_id,
        product_id,
        product_name,
        product_image_url,
        customer_name,
        customer_email,
        customer_phone,
        supplier_id,
        supplier_whatsapp,
        supplier_price,
        sale_price,
        profit,
        status,
        tracking_code,
        created_at,
        suppliers (
          id,
          name,
          company_name,
          whatsapp,
          city,
          state,
          status
        )
      `)
      .order('created_at', { ascending: false });

    setLoading(false);

    if (error) {
      console.error('Erro ao carregar pedidos:', error);
      setOrders([]);
      setErrorMessage(`Não foi possível carregar os pedidos: ${error.message}`);
      return;
    }

    setOrders((data || []) as Order[]);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);

    setTimeout(() => {
      setSuccessMessage('');
    }, 4000);
  };

  const getSupplier = (order: Order) => {
    if (Array.isArray(order.suppliers)) {
      return order.suppliers[0];
    }

    return order.suppliers || null;
  };

  const formatCurrency = (value: number) => {
    return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
  };

  const formatDate = (value: string) => {
    return new Date(value).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const cleanWhatsappNumber = (phone?: string | null) => {
    const onlyNumbers = String(phone || '').replace(/\D/g, '');

    if (!onlyNumbers) {
      return '';
    }

    if (onlyNumbers.startsWith('55')) {
      return onlyNumbers;
    }

    return `55${onlyNumbers}`;
  };

  const buildSupplierWhatsAppMessage = (order: Order) => {
    const supplier = getSupplier(order);

    const message = [
      'Olá, tudo bem?',
      '',
      'Novo pedido pelo FORNEXA:',
      '',
      `Produto: ${order.product_name || 'Produto não informado'}`,
      `Cliente: ${order.customer_name || 'Cliente não informado'}`,
      `Telefone do cliente: ${order.customer_phone || 'Não informado'}`,
      `E-mail do cliente: ${order.customer_email || 'Não informado'}`,
      `Fornecedor: ${supplier?.name || 'Fornecedor não informado'}`,
      `Empresa: ${supplier?.company_name || 'Empresa não informada'}`,
      `Preço do fornecedor: ${formatCurrency(order.supplier_price || 0)}`,
      `Preço de venda: ${formatCurrency(order.sale_price || 0)}`,
      `Lucro estimado: ${formatCurrency(order.profit || 0)}`,
      `Código do pedido: ${order.id}`,
      '',
      'Pode confirmar o envio desse pedido?',
    ].join('\n');

    return encodeURIComponent(message);
  };

  const openSupplierWhatsApp = (order: Order) => {
    const supplier = getSupplier(order);
    const whatsappNumber = cleanWhatsappNumber(order.supplier_whatsapp || supplier?.whatsapp);

    if (!whatsappNumber) {
      alert('Este pedido não possui WhatsApp do fornecedor cadastrado.');
      return;
    }

    const message = buildSupplierWhatsAppMessage(order);

    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank');
  };

  const getStatusStyle = (status: OrderStatus) => {
    if (status === 'pending') {
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    }

    if (status === 'sent_to_supplier') {
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    }

    if (status === 'shipped') {
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    }

    if (status === 'delivered') {
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    }

    return 'bg-gray-100 text-gray-700 dark:bg-navy-700 dark:text-slate-300';
  };

  const getNextStatus = (status: OrderStatus): OrderStatus | null => {
    if (status === 'pending') {
      return 'sent_to_supplier';
    }

    if (status === 'sent_to_supplier') {
      return 'shipped';
    }

    if (status === 'shipped') {
      return 'delivered';
    }

    return null;
  };

  const getNextStatusLabel = (status: OrderStatus) => {
    if (status === 'pending') {
      return 'Marcar enviado ao fornecedor';
    }

    if (status === 'sent_to_supplier') {
      return 'Marcar como enviado';
    }

    if (status === 'shipped') {
      return 'Marcar como entregue';
    }

    return 'Pedido finalizado';
  };

  const generateTrackingCode = () => {
    const random = Math.floor(100000 + Math.random() * 900000);

    return `FX${random}`;
  };

  const handleAdvanceStatus = async (order: Order) => {
    const nextStatus = getNextStatus(order.status);

    if (!nextStatus) {
      return;
    }

    setActionId(order.id);
    setErrorMessage('');

    const payload: Partial<Order> = {
      status: nextStatus,
    };

    if (nextStatus === 'shipped' && !order.tracking_code) {
      payload.tracking_code = generateTrackingCode();
    }

    const { error } = await supabase
      .from('orders')
      .update(payload)
      .eq('id', order.id);

    setActionId(null);

    if (error) {
      console.error('Erro ao atualizar pedido:', error);
      setErrorMessage(`Não foi possível atualizar o pedido: ${error.message}`);
      return;
    }

    await loadOrders();
    showSuccess('Status do pedido atualizado.');
  };

  const handleDeleteOrder = async (orderId: string) => {
    const confirmDelete = window.confirm('Tem certeza que deseja excluir este pedido?');

    if (!confirmDelete) {
      return;
    }

    setActionId(orderId);
    setErrorMessage('');

    const { error } = await supabase.from('orders').delete().eq('id', orderId);

    setActionId(null);

    if (error) {
      console.error('Erro ao excluir pedido:', error);
      setErrorMessage(`Não foi possível excluir o pedido: ${error.message}`);
      return;
    }

    await loadOrders();
    showSuccess('Pedido excluído.');
  };

  const summary = useMemo(() => {
    const totalOrders = orders.length;
    const revenue = orders.reduce((total, order) => total + Number(order.sale_price || 0), 0);
    const profit = orders.reduce((total, order) => total + Number(order.profit || 0), 0);
    const pending = orders.filter((order) => order.status === 'pending').length;
    const delivered = orders.filter((order) => order.status === 'delivered').length;

    return {
      totalOrders,
      revenue,
      profit,
      pending,
      delivered,
    };
  }, [orders]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 dark:text-white">
            Pedidos
          </h1>

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            Acompanhe vendas, fornecedores, lucro e envio dos pedidos.
          </p>
        </div>

        <button
          onClick={loadOrders}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar pedidos
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Pedidos</p>

          <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
            {summary.totalOrders}
          </p>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Faturamento</p>

          <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
            {formatCurrency(summary.revenue)}
          </p>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Lucro</p>

          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
            {formatCurrency(summary.profit)}
          </p>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Pendentes</p>

          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">
            {summary.pending}
          </p>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Entregues</p>

          <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
            {summary.delivered}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-black dark:border-navy-700 dark:border-t-white rounded-full animate-spin mx-auto" />

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-4">
            Carregando pedidos...
          </p>
        </div>
      ) : orders.length > 0 ? (
        <div className="space-y-5">
          {orders.map((order) => {
            const supplier = getSupplier(order);
            const supplierWhatsapp = order.supplier_whatsapp || supplier?.whatsapp;
            const nextStatus = getNextStatus(order.status);

            return (
              <div
                key={order.id}
                className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex flex-col xl:flex-row xl:items-start gap-5">
                    <div className="flex gap-4 flex-1">
                      {order.product_image_url ? (
                        <img
                          src={order.product_image_url}
                          alt={order.product_name}
                          className="w-24 h-24 rounded-xl object-cover bg-gray-100 dark:bg-navy-700"
                        />
                      ) : (
                        <div className="w-24 h-24 rounded-xl bg-gray-100 dark:bg-navy-700 flex items-center justify-center">
                          <Package className="w-8 h-8 text-gray-400" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusStyle(order.status)}`}
                          >
                            {statusLabels[order.status] || order.status}
                          </span>

                          {order.tracking_code && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-navy-700 dark:text-slate-300">
                              Rastreio: {order.tracking_code}
                            </span>
                          )}
                        </div>

                        <h3 className="text-lg font-bold text-navy-900 dark:text-white mt-3">
                          {order.product_name}
                        </h3>

                        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                          Pedido criado em {formatDate(order.created_at)}
                        </p>

                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 break-all">
                          Código: {order.id}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 xl:w-[520px]">
                      <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-3">
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          Venda
                        </p>

                        <p className="text-sm font-bold text-navy-900 dark:text-white mt-1">
                          {formatCurrency(order.sale_price)}
                        </p>
                      </div>

                      <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-3">
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          Custo
                        </p>

                        <p className="text-sm font-bold text-navy-900 dark:text-white mt-1">
                          {formatCurrency(order.supplier_price)}
                        </p>
                      </div>

                      <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-3">
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          Lucro
                        </p>

                        <p className="text-sm font-bold text-green-600 dark:text-green-400 mt-1">
                          {formatCurrency(order.profit)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-5">
                    <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <Clock className="w-5 h-5 text-gray-600 dark:text-slate-400 mt-0.5" />

                        <div>
                          <p className="text-sm font-semibold text-navy-900 dark:text-white">
                            Cliente
                          </p>

                          <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">
                            {order.customer_name || 'Cliente não informado'}
                          </p>

                          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                            Telefone: {order.customer_phone || 'Não informado'}
                          </p>

                          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                            E-mail: {order.customer_email || 'Não informado'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <Truck className="w-5 h-5 text-gray-600 dark:text-slate-400 mt-0.5" />

                        <div>
                          <p className="text-sm font-semibold text-navy-900 dark:text-white">
                            Fornecedor
                          </p>

                          <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">
                            {supplier?.name || 'Fornecedor não vinculado'}
                          </p>

                          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                            Empresa: {supplier?.company_name || 'Não informada'}
                          </p>

                          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                            WhatsApp: {supplierWhatsapp || 'Não informado'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => openSupplierWhatsApp(order)}
                      disabled={!supplierWhatsapp}
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Enviar ao fornecedor
                    </button>

                    <button
                      onClick={() => handleAdvanceStatus(order)}
                      disabled={!nextStatus || actionId === order.id}
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="w-4 h-4" />
                      {actionId === order.id ? 'Atualizando...' : getNextStatusLabel(order.status)}
                    </button>

                    <button
                      onClick={() => handleDeleteOrder(order.id)}
                      disabled={actionId === order.id}
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
          <Package className="w-12 h-12 text-gray-300 dark:text-navy-600 mx-auto mb-4" />

          <h3 className="text-navy-900 dark:text-white font-semibold">
            Nenhum pedido encontrado
          </h3>

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-2">
            Quando você registrar uma venda em Meus Produtos, o pedido aparecerá aqui.
          </p>
        </div>
      )}
    </div>
  );
}