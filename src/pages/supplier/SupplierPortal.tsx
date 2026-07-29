import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle,
  FileText,
  Loader2,
  LogOut,
  MapPin,
  PackageSearch,
  Phone,
  RefreshCw,
  User,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchSupplierAccount, type SupplierAccount } from '../../lib/supplierAuth';

type OrderStatus =
  | 'pending'
  | 'sent_to_supplier'
  | 'separating'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

/**
 * Só os campos que o fornecedor precisa para separar e despachar.
 * Preço de venda e lucro pertencem ao vendedor e não entram aqui.
 */
interface SupplierOrder {
  id: string;
  product_name: string;
  product_image_url: string | null;
  quantidade: number | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string;
  comprador_documento: string | null;
  supplier_price: number;
  status: OrderStatus;
  tracking_code: string | null;
  etiqueta_url: string | null;
  /** A view calcula isto a partir de ml_shipment_id — sem expor o id em si. */
  etiqueta_disponivel: boolean;
  marketplace: string;
  created_at: string;
}

interface Tab {
  id: string;
  label: string;
  statuses: OrderStatus[];
  emptyMessage: string;
}

const tabs: Tab[] = [
  {
    id: 'novos',
    label: 'Novos',
    statuses: ['sent_to_supplier'],
    emptyMessage: 'Nenhum pedido novo agora. Assim que uma venda chegar, ela aparece aqui.',
  },
  {
    id: 'separacao',
    label: 'Em separação',
    statuses: ['separating'],
    emptyMessage: 'Nenhum pedido em separação.',
  },
  {
    id: 'enviados',
    label: 'Enviados',
    statuses: ['shipped'],
    emptyMessage: 'Nenhum pedido enviado ainda.',
  },
  {
    id: 'cancelados',
    label: 'Cancelados',
    statuses: ['cancelled'],
    emptyMessage: 'Nenhum pedido cancelado.',
  },
  {
    id: 'historico',
    label: 'Histórico',
    statuses: ['delivered'],
    emptyMessage: 'Nenhum pedido entregue ainda.',
  },
];

const formatCurrency = (value: number) =>
  `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;

const formatDate = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function SupplierPortal() {
  const navigate = useNavigate();

  const [supplier, setSupplier] = useState<SupplierAccount | null>(null);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('novos');
  const [actionId, setActionId] = useState<string | null>(null);
  const [labelId, setLabelId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadOrders = useCallback(async () => {
    // Lê da view, nunca de `orders`. A view já filtra pelo fornecedor logado e
    // não expõe preço de venda nem lucro do vendedor. O fornecedor não tem
    // permissão nenhuma na tabela.
    const { data, error } = await supabase
      .from('pedidos_do_fornecedor')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao carregar pedidos:', error);
      setErrorMessage('Não foi possível carregar seus pedidos.');
      return;
    }

    setOrders((data || []) as SupplierOrder[]);
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (mounted) {
          navigate('/fornecedor/login', { replace: true });
        }
        return;
      }

      const account = await fetchSupplierAccount(user.id);

      if (!mounted) {
        return;
      }

      setSupplier(account);
      await loadOrders();

      if (mounted) {
        setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [navigate, loadOrders]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setErrorMessage('');
    await loadOrders();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('fornexa_supplier');
    navigate('/fornecedor/login', { replace: true });
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  /**
   * A etiqueta vem em PDF pela Edge Function, que age como proxy: o token do
   * vendedor fica no servidor e nunca chega aqui. O arquivo não é gravado em
   * lugar nenhum — abre numa aba e é descartado.
   */
  const baixarEtiqueta = async (order: SupplierOrder) => {
    setLabelId(order.id);
    setErrorMessage('');

    const { data, error } = await supabase.functions.invoke<Blob>('supplier-order-label', {
      body: { pedido_id: order.id },
    });

    setLabelId(null);

    if (error || !data) {
      let specificMessage: string | undefined;

      const errorContext = (
        error as { context?: { json?: () => Promise<{ error?: string }> } } | null
      )?.context;

      if (errorContext?.json) {
        try {
          const errorBody = await errorContext.json();
          specificMessage = errorBody?.error;
        } catch {
          // segue com a mensagem genérica
        }
      }

      setErrorMessage(specificMessage ?? 'Não foi possível buscar a etiqueta.');
      return;
    }

    const url = URL.createObjectURL(data);
    const aberta = window.open(url, '_blank', 'noopener,noreferrer');

    if (!aberta) {
      setErrorMessage(
        'O navegador bloqueou a janela da etiqueta. Libere pop-ups para este site e tente de novo.'
      );
    }

    // Libera a memória depois que o navegador teve tempo de carregar o PDF.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const updateStatus = async (order: SupplierOrder, nextStatus: OrderStatus) => {
    setActionId(order.id);
    setErrorMessage('');

    // A função valida dono e transição no banco. O fornecedor não consegue
    // dar UPDATE em `orders` de forma alguma.
    const { error } = await supabase.rpc('fornecedor_atualiza_status_pedido', {
      p_pedido_id: order.id,
      p_novo_status: nextStatus,
    });

    setActionId(null);

    if (error) {
      console.error('Erro ao atualizar pedido:', error);
      setErrorMessage(`Não foi possível atualizar o pedido: ${error.message}`);
      return;
    }

    await loadOrders();

    showSuccess(
      nextStatus === 'separating'
        ? 'Pedido marcado como em separação.'
        : 'Pedido marcado como enviado.'
    );
  };

  const currentTab = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  const countByTab = useMemo(() => {
    const counts: Record<string, number> = {};

    tabs.forEach((tab) => {
      counts[tab.id] = orders.filter((order) => tab.statuses.includes(order.status)).length;
    });

    return counts;
  }, [orders]);

  const visibleOrders = useMemo(
    () => orders.filter((order) => currentTab.statuses.includes(order.status)),
    [orders, currentTab]
  );

  return (
    <div className="min-h-screen bg-navy-950 text-white">
      <header className="border-b border-white/5 bg-navy-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-md overflow-hidden bg-navy-900 flex items-center justify-center shrink-0">
              <img
                src="/fornexa-logo.jpeg"
                alt=""
                className="w-full h-full object-cover scale-[2.8]"
                draggable={false}
              />
            </div>

            <div className="min-w-0">
              <p className="font-display font-semibold leading-none tracking-tight truncate">
                {supplier?.company_name || supplier?.name || 'FORNEXA'}
              </p>

              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold mt-1.5">
                Portal do Fornecedor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 sm:px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Atualizar</span>
            </button>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 sm:px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {successMessage && (
          <div
            role="status"
            className="mb-6 flex items-start gap-3 rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-3.5"
          >
            <CheckCircle className="w-[18px] h-[18px] text-green-400 shrink-0 mt-0.5" />
            <p className="text-sm text-green-200">{successMessage}</p>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3.5"
          >
            <AlertCircle className="w-[18px] h-[18px] text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-200">{errorMessage}</p>
          </div>
        )}

        <nav className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" aria-label="Filtrar pedidos">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 ${
                  isActive
                    ? 'bg-gold text-navy-900'
                    : 'border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                {tab.label}

                <span
                  className={`font-mono text-xs tabular-nums ${
                    isActive ? 'text-navy-900/70' : 'text-slate-500'
                  }`}
                >
                  {countByTab[tab.id] ?? 0}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mt-8">
          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 text-slate-600 animate-spin mx-auto" />
              <p className="text-slate-400 mt-4">Carregando seus pedidos...</p>
            </div>
          ) : visibleOrders.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center">
              <PackageSearch className="w-8 h-8 text-slate-600 mx-auto" aria-hidden="true" />
              <p className="text-slate-400 mt-4 max-w-md mx-auto leading-relaxed">
                {currentTab.emptyMessage}
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {visibleOrders.map((order) => {
                const isBusy = actionId === order.id;

                return (
                  <li
                    key={order.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden"
                  >
                    <div className="p-5 sm:p-6">
                      <div className="flex flex-col sm:flex-row gap-5">
                        {order.product_image_url ? (
                          <img
                            src={order.product_image_url}
                            alt=""
                            className="w-full sm:w-24 h-40 sm:h-24 rounded-xl object-cover bg-navy-900 shrink-0"
                          />
                        ) : (
                          <div className="w-full sm:w-24 h-40 sm:h-24 rounded-xl bg-navy-900 shrink-0" />
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              {order.marketplace}
                            </p>

                            <p className="font-mono text-[11px] text-slate-600">
                              {formatDate(order.created_at)}
                            </p>
                          </div>

                          <h2 className="font-display text-lg font-semibold mt-2 leading-snug">
                            {order.product_name}
                          </h2>

                          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 mt-3">
                            <p className="font-mono text-sm text-slate-400 tabular-nums">
                              Quantidade{' '}
                              <span className="text-white text-base">
                                {order.quantidade ?? 1}
                              </span>
                            </p>

                            <p className="font-mono text-sm text-slate-400 tabular-nums">
                              Seu valor{' '}
                              <span className="text-gold text-base">
                                {formatCurrency(order.supplier_price)}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Dados de entrega — o que o fornecedor precisa para
                          separar, embalar e postar. */}
                      <div className="mt-6 rounded-xl bg-navy-900/60 border border-white/5 p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <User
                            className="w-4 h-4 text-slate-500 mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className="text-sm text-white">{order.customer_name}</p>

                            {order.comprador_documento && (
                              <p className="font-mono text-xs text-slate-500 mt-1">
                                {order.comprador_documento}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <MapPin
                            className="w-4 h-4 text-slate-500 mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          <p className="text-sm text-slate-300 leading-relaxed">
                            {order.customer_address}
                          </p>
                        </div>

                        {order.customer_phone && (
                          <div className="flex items-start gap-3">
                            <Phone
                              className="w-4 h-4 text-slate-500 mt-0.5 shrink-0"
                              aria-hidden="true"
                            />
                            <p className="font-mono text-sm text-slate-300">
                              {order.customer_phone}
                            </p>
                          </div>
                        )}

                        {order.tracking_code && (
                          <div className="flex items-start gap-3">
                            <FileText
                              className="w-4 h-4 text-slate-500 mt-0.5 shrink-0"
                              aria-hidden="true"
                            />
                            <p className="font-mono text-sm text-slate-300">
                              Rastreio {order.tracking_code}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-5 flex flex-col sm:flex-row gap-3">
                        {order.etiqueta_disponivel ? (
                          <button
                            onClick={() => baixarEtiqueta(order)}
                            disabled={labelId === order.id}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50"
                          >
                            {labelId === order.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <FileText className="w-4 h-4" aria-hidden="true" />
                            )}
                            {labelId === order.id ? 'Buscando...' : 'Baixar etiqueta'}
                          </button>
                        ) : (
                          <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/5 px-4 py-3 text-sm text-slate-600">
                            <FileText className="w-4 h-4" aria-hidden="true" />
                            Etiqueta ainda não disponível
                          </span>
                        )}

                        {order.status === 'sent_to_supplier' && (
                          <button
                            onClick={() => updateStatus(order, 'separating')}
                            disabled={isBusy}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50"
                          >
                            {isBusy ? (
                              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            ) : null}
                            Estou separando
                          </button>
                        )}

                        {(order.status === 'sent_to_supplier' ||
                          order.status === 'separating') && (
                          <button
                            onClick={() => updateStatus(order, 'shipped')}
                            disabled={isBusy}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-gold-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 disabled:opacity-60"
                          >
                            {isBusy ? (
                              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            ) : null}
                            Marcar como enviado
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
