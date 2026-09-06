import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Link2,
  Package,
  RefreshCw,
  Trash2,
  Truck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import DevolucaoNoPedido, { Devolucao } from '../../components/dashboard/DevolucaoNoPedido';
import ParadosNoCD from '../../components/dashboard/ParadosNoCD';
import RepasseNoPedido from '../../components/dashboard/RepasseNoPedido';
import MarketplaceBadge from '../../components/ui/marketplace-badge';
import { situacaoDoCorte } from '../../lib/horarioDeCorte';

type OrderStatus =
  | 'pending'
  | 'sent_to_supplier'
  | 'separating'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

interface Supplier {
  id: string;
  name: string;
  company_name: string;
  whatsapp: string;
  city: string;
  state: string;
  status: 'active' | 'inactive';
  /** Cadastrada pelo próprio fornecedor no Portal. Nula até ele preencher. */
  chave_pix: string | null;
  /** Até que horas ele ainda despacha no mesmo dia. Nulo = não trabalha assim. */
  horario_corte: string | null;
  horario_corte_flex: string | null;
  /** O que o vendedor precisa saber antes de vender com ele. */
  avisos: string | null;
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
  quantidade: number | null;
  lucro_liquido: number | null;
  custos_apurados_em: string | null;
  pago_ao_fornecedor_em: string | null;
  comprovante_path: string | null;
  repasse_id: string | null;
  status: OrderStatus;
  tracking_code: string | null;
  ml_shipment_id: string | null;
  marketplace: string;
  created_at: string;
  suppliers?: Supplier | Supplier[] | null;
}

/**
 * Resposta do diagnóstico de envio. Existe para descobrir se a confirmação de
 * despacho no Mercado Livre é feita por API (envio do vendedor) ou não se
 * aplica (Mercado Envios, onde a transportadora é quem atualiza).
 */
interface DiagnosticoEnvio {
  pedidoId: string;
  mode: string | null;
  logistic_type: string | null;
  status: string | null;
  substatus: string | null;
  conclusao: string;
}

const statusLabels: Record<OrderStatus, string> = {
  pending: 'Pendente',
  sent_to_supplier: 'Enviado ao fornecedor',
  separating: 'Em separação',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

interface PendingIssue {
  origem: 'webhook' | 'sincronizacao';
  ml_order_id: string | null;
  motivo: string;
  data: string;
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  /** Devolução aberta de cada pedido, por order_id. */
  const [devolucoes, setDevolucoes] = useState<Record<string, Devolucao>>({});

  /**
   * Recorte por situação do repasse.
   *
   * Dois recortes, e nenhum "Todos": a lista misturada era o problema que este
   * filtro veio resolver, e mantê-la como opção convidaria a voltar a ela.
   *
   * Abre em "A pagar" porque é a que tem trabalho pendente. O que já foi pago
   * continua existindo em "Pagos" — o pedido segue andando na logística depois
   * do repasse.
   */
  const [filtroRepasse, setFiltroRepasse] = useState<'pagar' | 'pagos'>('pagar');

  const [syncingMl, setSyncingMl] = useState(false);
  const [pendingIssues, setPendingIssues] = useState<PendingIssue[]>([]);
  const [showIssues, setShowIssues] = useState(false);
  const [diagnosticoId, setDiagnosticoId] = useState<string | null>(null);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoEnvio | null>(null);

  /**
   * Emissão da DC-e, e a resposta crua da API do Mercado Livre.
   *
   * Só para admin, e a tela precisa saber disso: o botão chama uma função que
   * já recusa quem não é admin, mas deixar o botão à vista para o vendedor era
   * oferecer um ato fiscal em nome dele que ele não pode executar — e ainda
   * despejava JSON da API na tela de quem só quer despachar um pedido.
   */
  const [ehAdmin, setEhAdmin] = useState(false);
  const [dcePedidoId, setDcePedidoId] = useState<string | null>(null);
  const [dceResultado, setDceResultado] = useState<{
    pedidoId: string;
    conteudo: string;
  } | null>(null);

  const consultarDce = async (order: Order, acao: 'info' | 'emitir' = 'info') => {
    // Emitir é ato fiscal: a DC-e declara o que vai dentro da caixa e acompanha
    // a carga. Um clique por engano vira documento errado em nome do vendedor.
    if (acao === 'emitir') {
      const confirmado = window.confirm(
        `Emitir a Declaração de Conteúdo (DC-e) desta venda no Mercado Livre?\n\n` +
          `${order.product_name}\n\n` +
          `É um documento fiscal e não dá para desfazer por aqui. Depois de emitido, ` +
          `a etiqueta libera e o fornecedor consegue despachar.`
      );

      if (!confirmado) {
        return;
      }
    }

    setDcePedidoId(order.id);
    setDceResultado(null);
    setErrorMessage('');

    const { data, error } = await supabase.functions.invoke('ml-dce', {
      body: { pedido_id: order.id, acao },
    });

    setDcePedidoId(null);

    // A resposta crua é o produto, não um detalhe: é ela que prova se o
    // caminho existe. Erro também serve — o status já responde.
    let conteudo = JSON.stringify(data ?? {}, null, 2);

    if (error) {
      const contexto = (
        error as { context?: { status?: number; text?: () => Promise<string> } } | null
      )?.context;

      let corpo = '';

      try {
        corpo = (await contexto?.text?.()) ?? '';
      } catch {
        corpo = '';
      }

      conteudo = [
        `status ${contexto?.status ?? '?'}`,
        '',
        corpo || error.message,
      ].join('\n');
    }

    setDceResultado({ pedidoId: order.id, conteudo });
  };

  /**
   * Consulta o Mercado Livre sobre como o envio deste pedido é classificado.
   * Só lê — não altera nada lá.
   */
  const diagnosticarEnvio = async (order: Order) => {
    setDiagnosticoId(order.id);
    setErrorMessage('');
    setDiagnostico(null);

    const { data, error } = await supabase.functions.invoke<{
      mode?: string | null;
      logistic_type?: string | null;
      status?: string | null;
      substatus?: string | null;
      conclusao?: string;
      error?: string;
    }>('ml-shipment-info', {
      body: { pedido_id: order.id },
    });

    setDiagnosticoId(null);

    if (error || !data?.conclusao) {
      let mensagem: string | undefined = data?.error;

      const contexto = (
        error as { context?: { json?: () => Promise<{ error?: string }> } } | null
      )?.context;

      if (!mensagem && contexto?.json) {
        try {
          const corpo = await contexto.json();
          mensagem = corpo?.error;
        } catch {
          // segue com a mensagem genérica
        }
      }

      setErrorMessage(mensagem ?? 'Não foi possível consultar o envio no Mercado Livre.');
      return;
    }

    setDiagnostico({
      pedidoId: order.id,
      mode: data.mode ?? null,
      logistic_type: data.logistic_type ?? null,
      status: data.status ?? null,
      substatus: data.substatus ?? null,
      conclusao: data.conclusao,
    });
  };

  const loadPendingIssues = async () => {
    const { data, error } = await supabase.functions.invoke<{
      success?: boolean;
      issues?: PendingIssue[];
    }>('ml-pending-issues');

    if (error || !data?.success) {
      // Não interrompe a tela por causa disso — é uma informação
      // complementar, não crítica para o funcionamento da página.
      console.error('Falha ao buscar pedidos com problema:', error);
      return;
    }

    setPendingIssues(data.issues ?? []);
  };

  const syncMercadoLivreOrders = async () => {
    setSyncingMl(true);
    setErrorMessage('');
    setSuccessMessage('');

    const { data: syncResult, error: syncInvokeError } = await supabase.functions.invoke<{
      success?: boolean;
      error?: string;
      total_encontrados?: number;
      criados?: number;
      atualizados?: number;
      pulados_sem_produto?: number;
      pulados_sem_fornecedor?: number;
      erros?: number;
    }>('ml-sync-orders');

    if (syncInvokeError || !syncResult?.success) {
      // Mesmo cuidado do ml-publish-product: em respostas não-2xx, o
      // supabase-js não popula "data" — o corpo real vem em
      // syncInvokeError.context.
      let mensagemEspecifica: string | undefined = syncResult?.error;

      const errorContext = (
        syncInvokeError as { context?: { json?: () => Promise<{ error?: string }> } } | null
      )?.context;

      if (!mensagemEspecifica && errorContext?.json) {
        try {
          const errorBody = await errorContext.json();
          mensagemEspecifica = errorBody?.error;
        } catch {
          // segue com a mensagem genérica abaixo
        }
      }

      setSyncingMl(false);
      setErrorMessage(mensagemEspecifica ?? 'Não foi possível sincronizar os pedidos do Mercado Livre.');
      return;
    }

    setSyncingMl(false);
    setSuccessMessage(
      `Sincronização concluída: ${syncResult.criados ?? 0} pedido(s) novo(s), ${
        syncResult.atualizados ?? 0
      } atualizado(s).`
    );

    await loadOrders();
    await loadPendingIssues();
  };

  const loadOrders = async () => {
    setLoading(true);
    setErrorMessage('');

    const {
      data: { user: usuarioAtual },
    } = await supabase.auth.getUser();

    if (usuarioAtual) {
      const { data: perfil } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', usuarioAtual.id)
        .maybeSingle();

      setEhAdmin(perfil?.role === 'admin');
    }

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
        quantidade,
        lucro_liquido,
        custos_apurados_em,
        pago_ao_fornecedor_em,
        comprovante_path,
        repasse_id,
        status,
        tracking_code,
        ml_shipment_id,
        marketplace,
        created_at,
        suppliers (
          id,
          name,
          company_name,
          whatsapp,
          city,
          state,
          status,
          chave_pix,
          horario_corte,
          horario_corte_flex,
          avisos
        )
      `)
      .order('created_at', { ascending: false });

    // A política de RLS já limita às devoluções do próprio vendedor, então não
    // precisa filtrar por pedido aqui.
    const { data: devolucoesData } = await supabase
      .from('devolucoes')
      .select('*')
      .order('avisada_em', { ascending: false });

    const porPedido: Record<string, Devolucao> = {};

    ((devolucoesData || []) as Devolucao[]).forEach((devolucao) => {
      // A consulta vem da mais nova para a mais antiga, então a primeira de
      // cada pedido é a que vale.
      if (!porPedido[devolucao.order_id]) {
        porPedido[devolucao.order_id] = devolucao;
      }
    });

    setDevolucoes(porPedido);

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
    loadPendingIssues();
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



  const getStatusStyle = (status: OrderStatus) => {
    if (status === 'pending') {
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    }

    if (status === 'sent_to_supplier') {
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    }

    // O fornecedor marcou que está separando o pedido, pelo Portal.
    if (status === 'separating') {
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    }

    if (status === 'shipped') {
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    }

    if (status === 'delivered') {
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    }

    return 'bg-gray-100 text-gray-700 dark:bg-navy-700 dark:text-slate-300';
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

  const pedidosVisiveis = useMemo(
    () =>
      filtroRepasse === 'pagar'
        ? orders.filter((order) => !order.pago_ao_fornecedor_em)
        : orders.filter((order) => order.pago_ao_fornecedor_em),
    [orders, filtroRepasse]
  );

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

        <div className="flex gap-3">
          <button
            onClick={loadOrders}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar pedidos
          </button>

          <button
            onClick={syncMercadoLivreOrders}
            disabled={syncingMl}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gold hover:bg-gold-hover text-black text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {syncingMl ? (
              <Link2 className="w-4 h-4 animate-spin" />
            ) : (
              <MarketplaceBadge marketplace="Mercado Livre" showName={false} />
            )}
            {syncingMl ? 'Sincronizando...' : 'Sincronizar com Mercado Livre'}
          </button>
        </div>
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

      {pendingIssues.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowIssues((prev) => !prev)}
            className="w-full flex items-center justify-between gap-3 p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-amber-800 dark:text-amber-300 text-sm font-medium">
                {pendingIssues.length} pedido(s) do Mercado Livre não puderam ser processados automaticamente
              </p>
            </div>

            <span className="text-amber-700 dark:text-amber-400 text-xs font-medium shrink-0">
              {showIssues ? 'Ocultar' : 'Ver detalhes'}
            </span>
          </button>

          {showIssues && (
            <div className="border-t border-amber-200 dark:border-amber-800 divide-y divide-amber-200 dark:divide-amber-800">
              {pendingIssues.map((issue, index) => (
                <div key={`${issue.ml_order_id}-${index}`} className="p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="flex-1">
                    <p className="text-sm text-navy-900 dark:text-white font-medium">
                      {issue.ml_order_id ? `Pedido #${issue.ml_order_id}` : 'Pedido sem identificação'}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-slate-400 mt-0.5">
                      {issue.motivo}
                    </p>
                  </div>

                  <p className="text-xs text-gray-400 dark:text-slate-500 shrink-0">
                    {new Date(issue.data).toLocaleString('pt-BR')}
                  </p>
                </div>
              ))}

              <div className="p-4 bg-amber-100/50 dark:bg-amber-900/10">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Corrija o motivo indicado (ex: vincule um fornecedor ao produto) e clique em
                  "Sincronizar com Mercado Livre" para tentar novamente.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Só aparece quando há algo parado. Fica acima dos números porque é
          dinheiro que os números não mostram. */}
      <ParadosNoCD />

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

      {/* Contagem em cada recorte, para o número responder antes do clique. */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['pagar', 'A pagar', orders.filter((o) => !o.pago_ao_fornecedor_em).length],
            ['pagos', 'Pagos', orders.filter((o) => o.pago_ao_fornecedor_em).length],
          ] as ['pagar' | 'pagos', string, number][]
        ).map(([id, rotulo, quantos]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFiltroRepasse(id)}
            aria-pressed={filtroRepasse === id}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              filtroRepasse === id
                ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900'
                : 'border border-gray-200 dark:border-navy-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-navy-700'
            }`}
          >
            {rotulo}
            <span className="font-mono tabular-nums opacity-70">{quantos}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-black dark:border-navy-700 dark:border-t-white rounded-full animate-spin mx-auto" />

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-4">
            Carregando pedidos...
          </p>
        </div>
      ) : pedidosVisiveis.length > 0 ? (
        <div className="space-y-5">
          {pedidosVisiveis.map((order) => {
            const supplier = getSupplier(order);
            const supplierWhatsapp = order.supplier_whatsapp || supplier?.whatsapp;

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
                          <MarketplaceBadge
                            marketplace={order.marketplace}
                            className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-navy-700 dark:text-slate-300"
                          />

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
                          Lucro líquido
                        </p>

                        {/* O lucro líquido já desconta comissão e frete. Enquanto
                            o Mercado Livre não fecha esses valores, cai no bruto
                            e a tela avisa, em vez de mostrar número otimista sem
                            ressalva. */}
                        <p
                          className={`text-sm font-bold mt-1 ${
                            Number(order.lucro_liquido ?? order.profit) < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-green-600 dark:text-green-400'
                          }`}
                        >
                          {formatCurrency(order.lucro_liquido ?? order.profit)}
                        </p>

                        {!order.custos_apurados_em && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                            sem taxas ainda
                          </p>
                        )}
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
                            {supplier?.city
                              ? `${supplier.city}${supplier.state ? `/${supplier.state}` : ''}`
                              : 'Local não informado'}
                          </p>

                          {/* O corte do fornecedor, comparado com a hora agora
                              no Brasil. Antes isso vivia no WhatsApp, e o
                              vendedor descobria errando: mandava as 14h achando
                              que sairia no mesmo dia. */}
                          {[
                            situacaoDoCorte(supplier?.horario_corte ?? null, 'etiqueta normal'),
                            situacaoDoCorte(supplier?.horario_corte_flex ?? null, 'Flex'),
                          ]
                            .filter(Boolean)
                            .map((situacao) => (
                              <p
                                key={situacao!.texto}
                                className={`text-sm mt-1 ${
                                  situacao!.saiHoje
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-amber-600 dark:text-amber-400'
                                }`}
                              >
                                {situacao!.texto}
                              </p>
                            ))}

                          {supplier?.avisos && (
                            <p className="text-sm text-gray-600 dark:text-slate-300 mt-2 leading-relaxed whitespace-pre-line border-l-2 border-gray-300 dark:border-navy-600 pl-3">
                              {supplier.avisos}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Junto das outras ações do pedido, e depois dos dados de
                      cliente e fornecedor: pagar é a última coisa que se faz
                      olhando um pedido, não a primeira. */}
                  <RepasseNoPedido
                    order={order}
                    fornecedor={
                      supplier
                        ? {
                            nome: supplier.company_name || supplier.name,
                            cidade: supplier.city ?? null,
                            chave_pix: supplier.chave_pix ?? null,
                          }
                        : null
                    }
                    onMudou={loadOrders}
                  />

                  <div className="mt-5 flex flex-col sm:flex-row gap-3">
                    {/* Só depois de entregue: antes disso não existe devolução
                        para avisar, e o pedido ainda segue o fluxo normal. */}
                    {order.status === 'delivered' && !devolucoes[order.id] && (
                      <DevolucaoNoPedido
                        order={order}
                        supplierWhatsapp={supplierWhatsapp}
                        onMudou={loadOrders}
                      />
                    )}

                    {order.ml_shipment_id && (
                      <button
                        onClick={() => diagnosticarEnvio(order)}
                        disabled={diagnosticoId === order.id}
                        className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-50"
                      >
                        <Truck className="w-4 h-4" />
                        {diagnosticoId === order.id ? 'Consultando...' : 'Dados de envio'}
                      </button>
                    )}

                    {/* A sonda "Testar DC-e" saiu daqui. Existia para descobrir
                        se a API de emissão existia — descobriu, e virou a
                        emissão de verdade logo abaixo. */}
                    {ehAdmin && order.ml_shipment_id && (
                      <button
                        onClick={() => consultarDce(order, 'emitir')}
                        disabled={dcePedidoId === order.id}
                        className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                      >
                        Emitir DC-e
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteOrder(order.id)}
                      disabled={actionId === order.id}
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir
                    </button>
                  </div>

                  {/* Devolução já registrada: onde está e quanto falta do
                      prazo do CD. Fica fora da fileira de botões porque é
                      estado do pedido, não uma ação. */}
                  {devolucoes[order.id] && (
                    <DevolucaoNoPedido
                      order={order}
                      devolucao={devolucoes[order.id]}
                      supplierWhatsapp={supplierWhatsapp}
                      onMudou={loadOrders}
                    />
                  )}

                  {ehAdmin && dceResultado?.pedidoId === order.id && (
                    <div className="mt-4 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 p-4">
                      <p className="text-sm font-semibold text-navy-900 dark:text-white">
                        Resposta da API de DC-e
                      </p>

                      <pre className="mt-3 text-xs text-navy-900 dark:text-slate-200 overflow-x-auto whitespace-pre-wrap break-words">
                        {dceResultado.conteudo}
                      </pre>
                    </div>
                  )}

                  {/* Diagnóstico de envio — decide qual caminho a confirmação
                      de despacho no Mercado Livre precisa seguir. */}
                  {diagnostico?.pedidoId === order.id && (
                    <div className="mt-4 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 p-4">
                      <p className="text-sm font-semibold text-navy-900 dark:text-white">
                        Como o Mercado Livre classifica este envio
                      </p>

                      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          ['Modo', diagnostico.mode],
                          ['Logística', diagnostico.logistic_type],
                          ['Status', diagnostico.status],
                          ['Substatus', diagnostico.substatus],
                        ].map(([rotulo, valor]) => (
                          <div key={rotulo as string}>
                            <dt className="text-xs text-gray-500 dark:text-slate-400">{rotulo}</dt>
                            <dd className="text-sm font-medium text-navy-900 dark:text-white mt-1 break-all">
                              {valor ?? '—'}
                            </dd>
                          </div>
                        ))}
                      </dl>

                      <p className="text-sm text-gray-600 dark:text-slate-300 mt-4 leading-relaxed">
                        {diagnostico.conclusao}
                      </p>

                      <button
                        onClick={() => setDiagnostico(null)}
                        className="text-sm font-semibold text-navy-900 dark:text-white hover:underline mt-3"
                      >
                        Fechar
                      </button>
                    </div>
                  )}
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