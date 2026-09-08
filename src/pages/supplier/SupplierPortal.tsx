import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle,
  FileText,
  KeyRound,
  Loader2,
  LogOut,
  MapPin,
  MessageSquareWarning,
  PackageSearch,
  Phone,
  RefreshCw,
  User,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import EstoqueFornecedor from '../../components/supplier/EstoqueFornecedor';
import DevolucoesFornecedor from '../../components/supplier/DevolucoesFornecedor';
import RecebimentoFornecedor from '../../components/supplier/RecebimentoFornecedor';
import { fetchSupplierAccount, type SupplierAccount } from '../../lib/supplierAuth';
import MarketplaceBadge from '../../components/ui/marketplace-badge';
import { useTravaScrollDeFundo } from '../../lib/useTravaScrollDeFundo';

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
  /** Comprador cancelou no marketplace. Independe do andamento interno. */
  cancelado_no_marketplace: boolean;
  /** Já existe chamado aberto deste fornecedor para este pedido. */
  problema_relatado: boolean;
  /** Chamado mais recente do pedido, resolvido ou não. Null se nunca houve. */
  chamado_id: string | null;
  /** Respostas do vendedor posteriores à última vez que o fornecedor leu. */
  respostas_nao_lidas: number;
  /** Quando o vendedor declarou ter repassado o valor. Null = em aberto. */
  pago_em: string | null;
  /** Quando o próprio fornecedor confirmou que o dinheiro chegou. */
  recebimento_confirmado_em: string | null;
  taxa_embalagem: number | null;
  /** O lote de repasse a que este pedido pertence. Nulo em pedido antigo. */
  repasse_id: string | null;
  repasse_txid: string | null;
  repasse_valor: number | null;
  repasse_pedidos: number | null;
  /** Caminho do comprovante no bucket fechado. Nulo quando não há. */
  comprovante_path: string | null;
  /** Endereço e etiqueta estão trancados esperando o pagamento. */
  aguardando_pagamento: boolean;
  /** Este fornecedor exige pagamento antes do despacho. */
  exige_pagamento_antecipado: boolean;
  /** Quem vendeu: empresa, ou o nome pessoal quando não houver empresa. */
  vendedor_nome: string | null;
  vendedor_responsavel: string | null;
  vendedor_whatsapp: string | null;
  vendedor_email: string | null;
  marketplace: string;
  created_at: string;
}

interface TicketMessage {
  id: string;
  autor: 'vendedor' | 'fornecedor';
  corpo: string;
  created_at: string;
}

interface Tab {
  id: string;
  label: string;
  /**
   * Decide se o pedido pertence à aba. É função, e não lista de status,
   * porque cancelamento não é um status interno: vem do marketplace e tem
   * precedência sobre onde o pedido estava.
   */
  match: (order: SupplierOrder) => boolean;
  emptyMessage: string;
}

/** Cancelado no marketplace sai de todas as abas de trabalho. */
const emAndamento = (order: SupplierOrder, ...statuses: OrderStatus[]) =>
  !order.cancelado_no_marketplace && statuses.includes(order.status);

const tabs: Tab[] = [
  {
    id: 'novos',
    label: 'Novos',
    // `pending` entra aqui porque é o status com que a venda nasce ao vir do
    // Mercado Livre. Sem isso o pedido só apareceria depois de o vendedor
    // liberar um por um, que é justamente o passo manual a ser eliminado.
    match: (order) => emAndamento(order, 'pending', 'sent_to_supplier'),
    emptyMessage: 'Nenhum pedido novo agora. Assim que uma venda chegar, ela aparece aqui.',
  },
  {
    id: 'separacao',
    label: 'Em separação',
    match: (order) => emAndamento(order, 'separating'),
    emptyMessage: 'Nenhum pedido em separação.',
  },
  {
    id: 'enviados',
    label: 'Enviados',
    match: (order) => emAndamento(order, 'shipped'),
    emptyMessage: 'Nenhum pedido enviado ainda.',
  },
  {
    id: 'cancelados',
    label: 'Cancelados',
    // Duas origens: cancelamento no marketplace, e o status interno, que hoje
    // nenhuma tela grava mas continua previsto.
    match: (order) => order.cancelado_no_marketplace || order.status === 'cancelled',
    emptyMessage: 'Nenhum pedido cancelado.',
  },
  {
    id: 'historico',
    label: 'Histórico',
    match: (order) => emAndamento(order, 'delivered'),
    emptyMessage: 'Nenhum pedido entregue ainda.',
  },
];

/**
 * De quanto em quanto tempo o portal procura pedido novo. Quarenta e cinco
 * segundos é curto o bastante para o fornecedor perceber a venda logo, e longo
 * o bastante para não pesar: é uma consulta a cada minuto por aba aberta.
 */
const INTERVALO_VERIFICACAO = 45000;

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

  /**
   * Em que pé está o dinheiro de cada pedido.
   *
   * São três esperas diferentes, e só uma delas é do fornecedor:
   *
   *   aguardando o vendedor  — ele ainda não disse que pagou. Nada a fazer.
   *   conferir               — ele disse. É AQUI que o fornecedor trabalha.
   *   confirmados            — acabou; ficam à mão só para consulta.
   *
   * Misturadas numa lista só, a do meio se perde — e é a única que segura
   * mercadoria parada esperando um clique dele.
   */
  const [filtroPagamento, setFiltroPagamento] = useState<
    'todos' | 'aguardando' | 'conferir' | 'confirmados'
  >('todos');

  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [labelId, setLabelId] = useState<string | null>(null);

  /** Quantos pedidos entraram desde a última vez que o fornecedor olhou. */
  const [pedidosNovos, setPedidosNovos] = useState(0);

  /** Pedido com o formulário de problema aberto, e o texto digitado. */
  const [problemaPedidoId, setProblemaPedidoId] = useState<string | null>(null);
  const [mensagemProblema, setMensagemProblema] = useState('');
  const [enviandoProblema, setEnviandoProblema] = useState(false);

  /** Troca de senha. O fornecedor tem conta no Auth, então muda direto. */
  const [contaAberta, setContaAberta] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  const trocarSenha = async () => {
    setErrorMessage('');

    if (novaSenha.length < 8) {
      setErrorMessage('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }

    if (novaSenha !== confirmaSenha) {
      setErrorMessage('As duas senhas não são iguais.');
      return;
    }

    setSalvandoSenha(true);

    const { error } = await supabase.auth.updateUser({ password: novaSenha });

    setSalvandoSenha(false);

    if (error) {
      console.error('Erro ao trocar senha:', error);
      setErrorMessage(`Não foi possível trocar a senha: ${error.message}`);
      return;
    }

    setNovaSenha('');
    setConfirmaSenha('');
    setContaAberta(false);
    showSuccess('Senha alterada. Use a nova no próximo acesso.');
  };

  /** Conversa do chamado que o fornecedor abriu. */
  const [conversaPedido, setConversaPedido] = useState<SupplierOrder | null>(null);
  const [mensagens, setMensagens] = useState<TicketMessage[]>([]);
  const [carregandoConversa, setCarregandoConversa] = useState(false);
  const [resposta, setResposta] = useState('');
  const [enviandoResposta, setEnviandoResposta] = useState(false);

  const abrirConversa = async (order: SupplierOrder) => {
    if (!order.chamado_id) {
      return;
    }

    setConversaPedido(order);
    setMensagens([]);
    setResposta('');
    setCarregandoConversa(true);
    setErrorMessage('');

    // Lê da view, nunca de `ticket_messages`. Mesma regra de `orders`.
    const { data, error } = await supabase
      .from('mensagens_do_fornecedor')
      .select('id, autor, corpo, created_at')
      .eq('ticket_id', order.chamado_id)
      .order('created_at', { ascending: true });

    setCarregandoConversa(false);

    if (error) {
      console.error('Erro ao carregar a conversa:', error);
      setErrorMessage('Não foi possível carregar a conversa.');
      return;
    }

    setMensagens((data || []) as TicketMessage[]);

    // Abrir é o mesmo que ler. Some o marcador de resposta nova.
    await supabase.rpc('marcar_chamado_lido', { p_chamado_id: order.chamado_id });
    await loadOrders({ silencioso: true });
  };

  const responder = async () => {
    if (!conversaPedido?.chamado_id) {
      return;
    }

    setEnviandoResposta(true);
    setErrorMessage('');

    const { error } = await supabase.rpc('fornecedor_responde_chamado', {
      p_chamado_id: conversaPedido.chamado_id,
      p_mensagem: resposta,
    });

    setEnviandoResposta(false);

    if (error) {
      console.error('Erro ao responder:', error);
      setErrorMessage(error.message);
      return;
    }

    setResposta('');
    await abrirConversa(conversaPedido);
    await loadOrders();
  };

  /**
   * Ids já vistos. Fica em ref, e não em estado, porque serve só de comparação
   * — mudar isso não precisa redesenhar a tela. Começa nulo para a primeira
   * carga não anunciar todos os pedidos como novidade.
   */
  const idsConhecidos = useRef<Set<string> | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  /**
   * O erro de uma ação de pedido, no pedido que a causou.
   *
   * A faixa de erro fica no topo da página. Quem separa pedido trabalha no
   * fim de uma lista longa: clicava em "Baixar etiqueta", nada acontecia, e a
   * explicação estava a três rolagens de distância — invisível.
   *
   * Erro de ação pertence ao lugar onde a ação foi pedida. O topo continua
   * servindo ao que é da página inteira, como falha ao carregar os pedidos.
   */
  const [erroNoPedido, setErroNoPedido] = useState<{
    id: string;
    mensagem: string;
  } | null>(null);

  const avisarNoPedido = (id: string, mensagem: string) =>
    setErroNoPedido({ id, mensagem });
  const [successMessage, setSuccessMessage] = useState('');

  /**
   * @param silencioso usado pela verificação automática: uma falha de rede
   * momentânea não deve cobrir a tela com erro enquanto o fornecedor trabalha.
   */
  const loadOrders = useCallback(async ({ silencioso = false } = {}) => {
    // Lê da view, nunca de `orders`. A view já filtra pelo fornecedor logado e
    // não expõe preço de venda nem lucro do vendedor. O fornecedor não tem
    // permissão nenhuma na tabela.
    const { data, error } = await supabase
      .from('pedidos_do_fornecedor')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao carregar pedidos:', error);

      if (!silencioso) {
        setErrorMessage('Não foi possível carregar seus pedidos.');
      }

      return;
    }

    const novos = (data || []) as SupplierOrder[];

    // Descobre o que chegou desde a última verificação. Comparar ids, e não a
    // quantidade, evita falso alarme quando um pedido some (cancelado) e outro
    // entra no mesmo intervalo.
    const conhecidos = idsConhecidos.current;

    if (conhecidos) {
      const recemChegados = novos.filter((pedido) => !conhecidos.has(pedido.id));

      if (recemChegados.length > 0) {
        setPedidosNovos(recemChegados.length);
      }
    }

    idsConhecidos.current = new Set(novos.map((pedido) => pedido.id));

    setOrders(novos);
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

  /**
   * Verifica pedidos novos de tempos em tempos.
   *
   * Não dá para usar o Realtime do Supabase aqui: ele respeita RLS, e o
   * fornecedor não tem permissão nenhuma em `orders` — é assim que o preço de
   * venda do vendedor fica protegido. Realtime também não funciona sobre view.
   *
   * A verificação pausa com a aba em segundo plano e dispara na hora em que
   * ela volta, para não gastar requisição à toa nem mostrar dado velho.
   */
  useEffect(() => {
    if (loading) {
      return;
    }

    const verificar = () => {
      if (!document.hidden) {
        loadOrders({ silencioso: true });
      }
    };

    const intervalo = window.setInterval(verificar, INTERVALO_VERIFICACAO);

    document.addEventListener('visibilitychange', verificar);

    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', verificar);
    };
  }, [loading, loadOrders]);

  /**
   * Avisa no título da aba. É o único canal que alcança o fornecedor com o
   * portal aberto em segundo plano — enquanto não existe e-mail, é o que há.
   */
  // Pedido novo e resposta não lida somam no mesmo contador: os dois pedem a
  // mesma coisa do fornecedor, que é voltar ao portal.
  const respostasNaoLidas = useMemo(
    () => orders.reduce((total, order) => total + (order.respostas_nao_lidas || 0), 0),
    [orders]
  );

  useEffect(() => {
    const base = 'Portal do Fornecedor — FORNEXA';
    const pendencias = pedidosNovos + respostasNaoLidas;

    document.title = pendencias > 0 ? `(${pendencias}) ${base}` : base;
  }, [pedidosNovos, respostasNaoLidas]);

  // Devolve o título original ao sair, para a aba não continuar anunciando o
  // portal depois que o fornecedor faz logout.
  useEffect(() => {
    const tituloOriginal = document.title;

    return () => {
      document.title = tituloOriginal;
    };
  }, []);

  // Vale para os dois modais do portal: conversa e troca de senha.
  useTravaScrollDeFundo(Boolean(conversaPedido) || contaAberta);

  const handleRefresh = async () => {
    setRefreshing(true);
    setErrorMessage('');
    setPedidosNovos(0);
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
  /**
   * Traz da API um PDF para o navegador abrir.
   *
   * Serve a etiqueta e o DACE, que são dois papéis diferentes com o mesmo
   * caminho: pedir, tratar a recusa, abrir numa aba. Escrever duas vezes faria
   * a mensagem de erro de um divergir da do outro com o tempo.
   */
  const abrirPdfDoPedido = async (
    order: SupplierOrder,
    funcao: string,
    oQueE: string
  ) => {
    setLabelId(order.id);
    setErroNoPedido(null);

    const { data, error } = await supabase.functions.invoke<Blob>(funcao, {
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

      avisarNoPedido(order.id, specificMessage ?? `Não foi possível buscar ${oQueE}.`);
      return;
    }

    const url = URL.createObjectURL(data);
    const aberta = window.open(url, '_blank', 'noopener,noreferrer');

    if (!aberta) {
      avisarNoPedido(
        order.id,
        `O navegador bloqueou a janela ${oQueE === 'a etiqueta' ? 'da etiqueta' : 'do DACE'}. Libere pop-ups para este site e tente de novo.`
      );
    }

    // Libera a memória depois que o navegador teve tempo de carregar o PDF.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const baixarEtiqueta = (order: SupplierOrder) =>
    abrirPdfDoPedido(order, 'supplier-order-label', 'a etiqueta');

  /**
   * O DACE é a versão impressa da Declaração de Conteúdo.
   *
   * Vai dobrado num saquinho plástico do lado de fora da caixa, junto da
   * etiqueta — que fica colada e visível. São dois papéis, e sem os dois a
   * encomenda não pode ser postada.
   */
  const baixarDace = (order: SupplierOrder) =>
    abrirPdfDoPedido(order, 'supplier-order-dace', 'o DACE');

  /**
   * Abre chamado sobre o pedido. Vai por função, e não por insert: o
   * fornecedor não tem permissão em `tickets`, e o chamado precisa nascer no
   * nome do vendedor para aparecer na tela de quem resolve.
   */
  const enviarProblema = async (order: SupplierOrder) => {
    setEnviandoProblema(true);
    setErroNoPedido(null);

    const { error } = await supabase.rpc('fornecedor_relata_problema', {
      p_pedido_id: order.id,
      p_mensagem: mensagemProblema,
    });

    setEnviandoProblema(false);

    if (error) {
      console.error('Erro ao relatar problema:', error);
      avisarNoPedido(order.id, error.message);
      return;
    }

    setProblemaPedidoId(null);
    setMensagemProblema('');
    await loadOrders();
    showSuccess('Problema enviado. O vendedor foi avisado e vai responder por aqui.');
  };

  const updateStatus = async (order: SupplierOrder, nextStatus: OrderStatus) => {
    setActionId(order.id);
    setErroNoPedido(null);

    // A função valida dono e transição no banco. O fornecedor não consegue
    // dar UPDATE em `orders` de forma alguma.
    const { error } = await supabase.rpc('fornecedor_atualiza_status_pedido', {
      p_pedido_id: order.id,
      p_novo_status: nextStatus,
    });

    setActionId(null);

    if (error) {
      console.error('Erro ao atualizar pedido:', error);
      avisarNoPedido(order.id, `Não foi possível atualizar o pedido: ${error.message}`);
      return;
    }

    await loadOrders();

    showSuccess(
      nextStatus === 'separating'
        ? 'Pedido marcado como em separação.'
        : 'Pedido marcado como enviado.'
    );
  };

  /**
   * Carimbo do fornecedor de que o dinheiro chegou.
   *
   * É o único registro de pagamento que não depende da palavra de quem deve.
   * Quando o fornecedor exige pagamento antecipado, é também o que destranca
   * endereço e etiqueta — por isso recarrega a lista em vez de só mexer na
   * linha: os campos ocultos passam a vir preenchidos.
   */
  /**
   * Abre o comprovante do vendedor num endereço temporário.
   *
   * O arquivo fica num lugar fechado e não tem endereço fixo: ele é assinado
   * na hora, para quem tem direito, e vale poucos minutos.
   */
  const abrirComprovante = async (order: SupplierOrder) => {
    setErroNoPedido(null);

    const { data, error } = await supabase.functions.invoke<{ url?: string }>(
      'comprovante-link',
      { body: { order_id: order.id } }
    );

    if (error || !data?.url) {
      avisarNoPedido(order.id, 'Não foi possível abrir o comprovante.');
      return;
    }

    window.open(data.url, '_blank', 'noopener,noreferrer');
  };

  /**
   * O fornecedor confirma que recebeu. Não há caminho de volta.
   *
   * O nome ficou de quando havia: hoje só confirma. Ver a migração
   * 20260908180000 — o banco também recusa desfazer, porque a tela não é a
   * única porta.
   */
  const alternarRecebimento = async (order: SupplierOrder) => {
    setConfirmandoId(order.id);
    setErroNoPedido(null);

    const confirmar = !order.recebimento_confirmado_em;

    // Confirmando um pedido que faz parte de um lote, confirma o lote inteiro.
    // O PIX que caiu foi um só, com o valor de todos — repetir o mesmo
    // julgamento cinco vezes sobre um pagamento só é onde se erra uma delas.
    const { error } =
      confirmar && order.repasse_id
        ? await supabase.rpc('fornecedor_confirma_repasse', {
            p_repasse: order.repasse_id,
          })
        : await supabase.rpc('fornecedor_confirma_recebimento', {
            p_order_id: order.id,
            p_confirmado: confirmar,
          });

    setConfirmandoId(null);

    if (error) {
      console.error('Erro ao confirmar recebimento:', error);
      avisarNoPedido(order.id, `Não foi possível salvar: ${error.message}`);
      return;
    }

    await loadOrders();

    showSuccess(
      confirmar
        ? 'Recebimento confirmado. O pedido está liberado para despacho.'
        : 'Confirmação desfeita.'
    );
  };

  const currentTab = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  const countByTab = useMemo(() => {
    const counts: Record<string, number> = {};

    tabs.forEach((tab) => {
      counts[tab.id] = orders.filter(tab.match).length;
    });

    return counts;
  }, [orders]);

  // Trocar de aba recomeça em "Todos": com o filtro preso, a aba nova abriria
  // vazia e pareceria não ter pedido nenhum.
  useEffect(() => {
    setFiltroPagamento('todos');
  }, [activeTab]);

  /** Em qual das três esperas este pedido está. */
  const faseDoPagamento = (order: SupplierOrder) =>
    order.recebimento_confirmado_em
      ? 'confirmados'
      : order.pago_em
        ? 'conferir'
        : 'aguardando';

  const daAba = useMemo(() => orders.filter(currentTab.match), [orders, currentTab]);

  const visibleOrders = useMemo(
    () =>
      filtroPagamento === 'todos'
        ? daAba
        : daAba.filter((order) => faseDoPagamento(order) === filtroPagamento),
    [daAba, filtroPagamento]
  );

  const contagemPorFase = useMemo(() => {
    const contagem = { aguardando: 0, conferir: 0, confirmados: 0 };

    daAba.forEach((order) => {
      contagem[faseDoPagamento(order)] += 1;
    });

    return contagem;
  }, [daAba]);

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
              onClick={() => {
                setContaAberta(true);
                setNovaSenha('');
                setConfirmaSenha('');
                setErrorMessage('');
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 sm:px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            >
              <KeyRound className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Minha senha</span>
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

        {pedidosNovos > 0 && (
          <div
            role="status"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3.5"
          >
            <p className="text-sm text-gold">
              {pedidosNovos === 1
                ? 'Chegou 1 pedido novo.'
                : `Chegaram ${pedidosNovos} pedidos novos.`}
            </p>

            <button
              onClick={() => setPedidosNovos(0)}
              className="text-sm font-semibold text-gold underline underline-offset-4 transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 rounded"
            >
              Entendi
            </button>
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

          {/* Fora do laço porque estoque não é um filtro de pedido: as abas de
              cima recortam a mesma lista, esta troca a tela inteira. */}
          <button
            onClick={() => setActiveTab('estoque')}
            aria-current={activeTab === 'estoque' ? 'page' : undefined}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 ${
              activeTab === 'estoque'
                ? 'bg-gold text-navy-900'
                : 'border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            Estoque
          </button>

          <button
            onClick={() => setActiveTab('devolucoes')}
            aria-current={activeTab === 'devolucoes' ? 'page' : undefined}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 ${
              activeTab === 'devolucoes'
                ? 'bg-gold text-navy-900'
                : 'border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            Devoluções
          </button>

          <button
            onClick={() => setActiveTab('recebimento')}
            aria-current={activeTab === 'recebimento' ? 'page' : undefined}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 ${
              activeTab === 'recebimento'
                ? 'bg-gold text-navy-900'
                : 'border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            Recebimento
          </button>
        </nav>

        <div className="mt-8">
          {activeTab === 'estoque' ? (
            <EstoqueFornecedor />
          ) : activeTab === 'devolucoes' ? (
            <DevolucoesFornecedor />
          ) : activeTab === 'recebimento' ? (
            <RecebimentoFornecedor />
          ) : loading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 text-slate-600 animate-spin mx-auto" />
              <p className="text-slate-400 mt-4">Carregando seus pedidos...</p>
            </div>
          ) : (
            <>
              {/* Três esperas diferentes, e só a do meio é trabalho dele.
                  Numa lista só, ela se perde entre pedidos que não dependem
                  dele — e é a única que deixa mercadoria parada. */}
              {/* Ficam mesmo com a aba vazia. Sumindo, a lista sobe quando o
                  último pedido sai e a tela parece ter quebrado — e três zeros
                  dizem algo útil: não há nada aqui, nem escondido em filtro. */}
              <div className="flex flex-wrap gap-2 mb-4">
                  {(
                    [
                      // Na ordem em que o pedido anda: o vendedor paga, o
                      // fornecedor confere, e fica confirmado. Fileira que
                      // segue o fluxo se lê sem pensar.
                      ['aguardando', 'Aguardando o vendedor', contagemPorFase.aguardando],
                      ['conferir', 'Conferir pagamento', contagemPorFase.conferir],
                      ['confirmados', 'Confirmados', contagemPorFase.confirmados],
                    ] as const
                  ).map(([id, rotulo, quantos]) => (
                    <button
                      key={id}
                      type="button"
                      // Clicar no filtro ligado desliga. É o que faz o botão
                      // "Todos" ser desnecessário: nenhum ligado já quer dizer
                      // todos, e um botão a menos é uma decisão a menos.
                      onClick={() =>
                        setFiltroPagamento((atual) => (atual === id ? 'todos' : id))
                      }
                      aria-pressed={filtroPagamento === id}
                      className={
                        filtroPagamento === id
                          ? 'rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-navy-900'
                          : 'rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white'
                      }
                    >
                      {rotulo}
                      <span
                        className={
                          filtroPagamento === id
                            ? 'ml-2 font-mono text-xs tabular-nums text-navy-900/60'
                            : 'ml-2 font-mono text-xs tabular-nums text-slate-500'
                        }
                      >
                        {quantos}
                      </span>
                    </button>
                  ))}
              </div>

              {visibleOrders.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center">
              <PackageSearch className="w-8 h-8 text-slate-600 mx-auto" aria-hidden="true" />
              <p className="text-slate-400 mt-4 max-w-md mx-auto leading-relaxed">
                {filtroPagamento === 'todos'
                  ? currentTab.emptyMessage
                  : 'Nenhum pedido nesta situação de pagamento.'}
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
                            <MarketplaceBadge
                              marketplace={order.marketplace}
                              className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400"
                            />

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

                            {/* A mesma conta do lado do vendedor: produto vezes
                                quantidade, mais UMA embalagem. Enquanto esta
                                tela somava só o produto, o fornecedor conferia
                                R$ 10,00 contra um PIX de R$ 12,00. */}
                            <p className="font-mono text-sm text-slate-400 tabular-nums">
                              Seu valor{' '}
                              <span className="text-gold text-base">
                                {formatCurrency(
                                  order.supplier_price * (order.quantidade ?? 1) +
                                    Number(order.taxa_embalagem ?? 0)
                                )}
                              </span>
                              {Number(order.taxa_embalagem ?? 0) > 0 && (
                                <span className="text-slate-500 text-xs ml-2">
                                  (
                                  {formatCurrency(
                                    order.supplier_price * (order.quantidade ?? 1)
                                  )}{' '}
                                  + {formatCurrency(Number(order.taxa_embalagem))} de
                                  embalagem)
                                </span>
                              )}
                            </p>

                            {/* Dois carimbos, não um. O de cima é declaração do
                                vendedor; o de baixo é o seu. Quem só tem o
                                primeiro não tem confirmação de nada. */}
                            <p className="font-mono text-sm text-slate-400 tabular-nums">
                              Pagamento{' '}
                              {order.recebimento_confirmado_em ? (
                                <span className="text-green-400 text-base">
                                  confirmado em{' '}
                                  {new Date(
                                    order.recebimento_confirmado_em
                                  ).toLocaleDateString('pt-BR')}
                                </span>
                              ) : order.pago_em ? (
                                <span className="text-amber-400 text-base">
                                  vendedor declarou em{' '}
                                  {new Date(order.pago_em).toLocaleDateString('pt-BR')}
                                </span>
                              ) : (
                                <span className="text-amber-400 text-base">em aberto</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Confirmação de recebimento.
                          Fica sempre visível, mesmo para quem não exige
                          pagamento antecipado: o carimbo do fornecedor é o
                          único registro que não depende da palavra de quem
                          deve. */}
                      <div className="mt-6 rounded-xl bg-navy-900/60 border border-white/5 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                              Recebimento
                            </p>

                            {/* Antes da declaração do vendedor não há o que
                                conferir: ele ainda está montando o pagamento e
                                pode trocar o comprovante ou pagar amanhã. */}
                            <p className="text-sm text-white mt-1.5">
                              {order.recebimento_confirmado_em
                                ? 'Você confirmou que recebeu este pagamento.'
                                : !order.pago_em
                                  ? 'O vendedor ainda não informou o pagamento deste pedido.'
                                  : order.aguardando_pagamento
                                    ? 'Endereço e etiqueta liberam quando você confirmar.'
                                    : 'Confirme quando o dinheiro cair na sua conta.'}
                            </p>

                            {/* O identificador é o mesmo texto que aparece no
                                extrato do banco. Com ele na tela, conferir
                                deixa de ser adivinhar a que se refere o valor
                                que caiu: é comparar dois números iguais. */}
                            {/* A prova que sustenta a contestação de um MED.
                                Fica junto do identificador porque é o par que
                                o banco pede: qual pagamento, e de qual pedido. */}
                            {order.comprovante_path && (
                              <button
                                type="button"
                                onClick={() => abrirComprovante(order)}
                                className="inline-flex items-center gap-2 mt-3 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5"
                              >
                                <FileText className="w-4 h-4 text-gold" aria-hidden="true" />
                                Ver comprovante do pagamento
                              </button>
                            )}

                            {order.repasse_txid && !order.recebimento_confirmado_em && (
                              <div className="mt-3 rounded-lg bg-navy-900/80 border border-white/5 px-3 py-2.5">
                                <p className="text-xs text-slate-400">
                                  Procure no seu extrato por
                                </p>

                                <p className="font-mono text-sm text-gold mt-0.5 break-all">
                                  {order.repasse_txid}
                                </p>

                                <p className="text-xs text-slate-400 mt-1.5">
                                  {formatCurrency(Number(order.repasse_valor ?? 0))}
                                  {Number(order.repasse_pedidos ?? 0) > 1 &&
                                    ` · um PIX para ${order.repasse_pedidos} pedidos`}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Sem declaração do vendedor não há botão. Confirmar
                              o recebimento de um pagamento que ninguém disse ter
                              feito é a única forma de o carimbo do fornecedor
                              perder o valor que ele tem. */}
                          {/* Confirmado, não há mais botão.
                              
                              Confirmar libera mercadoria do outro lado e fecha
                              a conversa sobre aquele dinheiro. Um "Desfazer"
                              ali convidava a reabrir o que a outra parte já
                              deu por encerrado — e era a mesma porta que
                              deixava o comprovante ser trocado depois de
                              conferido. Engano raro vira conversa; isso é o
                              custo certo. */}
                          {!order.recebimento_confirmado_em && (
                            <button
                              onClick={() => alternarRecebimento(order)}
                              disabled={confirmandoId === order.id}
                              hidden={!order.pago_em}
                              className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-navy-900 transition-colors hover:bg-gold-hover disabled:opacity-50"
                            >
                              Confirmar recebimento
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Trava de despacho. O pedido continua aparecendo — o
                          fornecedor precisa saber que existe venda para se
                          organizar — mas o que permite despachar some. */}
                      {order.aguardando_pagamento && (
                        <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
                          <p className="text-sm font-semibold text-amber-200">
                            Aguardando pagamento
                          </p>

                          <p className="text-sm text-amber-200/80 mt-1.5 leading-relaxed">
                            Endereço, telefone, documento do comprador e etiqueta
                            ficam ocultos até você confirmar o recebimento. Assim o
                            produto não sai antes de o dinheiro entrar.
                          </p>
                        </div>
                      )}

                      {/* Quem vendeu. Com vários vendedores comprando do mesmo
                          fornecedor, sem isto os pedidos chegam sem dono: não dá
                          para separar por cliente, cobrar quem está devendo, nem
                          emitir nota contra quem comprou. */}
                      {order.vendedor_nome && (
                        <div className="mt-6 rounded-xl bg-navy-900/60 border border-white/5 p-4">
                          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-3">
                            Vendedor
                          </p>

                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-white">
                                {order.vendedor_nome}
                              </p>

                              {order.vendedor_responsavel &&
                                order.vendedor_responsavel !== order.vendedor_nome && (
                                  <p className="text-sm text-slate-400 mt-0.5">
                                    Falar com {order.vendedor_responsavel}
                                  </p>
                                )}

                              {order.vendedor_email && (
                                <p className="text-sm text-slate-400 mt-0.5">
                                  {order.vendedor_email}
                                </p>
                              )}
                            </div>

                            {order.vendedor_whatsapp && (
                              <a
                                href={`https://wa.me/55${order.vendedor_whatsapp.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/5"
                              >
                                <Phone className="w-4 h-4" aria-hidden="true" />
                                {order.vendedor_whatsapp}
                              </a>
                            )}
                          </div>
                        </div>
                      )}

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

                      {/* Cancelado no marketplace: nada a fazer, e é preciso
                          dizer isso com todas as letras. O fornecedor pode já
                          ter separado e embalado. */}
                      {order.cancelado_no_marketplace ? (
                        <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3.5">
                          <AlertCircle
                            className="w-[18px] h-[18px] text-red-400 shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                          <p className="text-sm text-red-200">
                            Este pedido foi cancelado no {order.marketplace}. Não envie.
                            Se já tiver separado, pode devolver ao estoque.
                          </p>
                        </div>
                      ) : (
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

                        {/* Dois papéis, não um: a etiqueta vai colada e
                            visível, e o DACE dobrado num saquinho plástico do
                            lado de fora. Sem os dois a encomenda não é postada. */}
                        {order.etiqueta_disponivel && (
                          <button
                            onClick={() => baixarDace(order)}
                            disabled={labelId === order.id}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50"
                          >
                            <FileText className="w-4 h-4" aria-hidden="true" />
                            Baixar DACE
                          </button>
                        )}

                        {(order.status === 'pending' ||
                          order.status === 'sent_to_supplier') && (
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

                        {(order.status === 'pending' ||
                          order.status === 'sent_to_supplier' ||
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

                        {order.chamado_id ? (
                          <button
                            onClick={() => abrirConversa(order)}
                            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 ${
                              order.problema_relatado
                                ? 'border border-orange-500/25 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20'
                                : 'border border-white/10 text-slate-400 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            <MessageSquareWarning className="w-4 h-4" aria-hidden="true" />
                            {order.problema_relatado ? 'Problema relatado' : 'Ver conversa'}

                            {order.respostas_nao_lidas > 0 && (
                              <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gold text-navy-900 font-mono text-[11px] font-semibold tabular-nums">
                                {order.respostas_nao_lidas}
                              </span>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setProblemaPedidoId(order.id);
                              setMensagemProblema('');
                            }}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                          >
                            <MessageSquareWarning className="w-4 h-4" aria-hidden="true" />
                            Tenho um problema
                          </button>
                        )}
                      </div>
                      )}

                      {/* O erro fica onde o botão está. Ver `erroNoPedido`. */}
                      {erroNoPedido?.id === order.id && (
                        <div className="mt-3 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                          <AlertCircle
                            className="w-4 h-4 text-red-400 shrink-0 mt-0.5"
                            aria-hidden="true"
                          />

                          <p className="text-sm text-red-200 leading-relaxed">
                            {erroNoPedido.mensagem}
                          </p>
                        </div>
                      )}

                      {problemaPedidoId === order.id && (
                        <div className="mt-4 rounded-xl border border-white/10 bg-navy-900/60 p-4">
                          <label
                            htmlFor={`problema-${order.id}`}
                            className="block font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2.5"
                          >
                            O que aconteceu com este pedido?
                          </label>

                          <textarea
                            id={`problema-${order.id}`}
                            value={mensagemProblema}
                            onChange={(event) => setMensagemProblema(event.target.value)}
                            rows={3}
                            placeholder="Ex: produto sem estoque, endereço incompleto, quantidade errada."
                            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white placeholder:text-slate-600 transition-colors hover:border-white/20 focus:border-gold focus:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/25"
                            disabled={enviandoProblema}
                          />

                          <p className="text-xs text-slate-500 mt-2">
                            O vendedor recebe isto na tela de Chamados, já ligado a este
                            pedido.
                          </p>

                          <div className="flex flex-col sm:flex-row gap-3 mt-4">
                            <button
                              onClick={() => enviarProblema(order)}
                              disabled={
                                enviandoProblema || mensagemProblema.trim().length < 10
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-gold-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {enviandoProblema ? (
                                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                              ) : null}
                              Enviar ao vendedor
                            </button>

                            <button
                              onClick={() => setProblemaPedidoId(null)}
                              disabled={enviandoProblema}
                              className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
              )}
            </>
          )}
        </div>
      </main>

      {/* Troca de senha. Sem isto, fornecedor que esquece a senha depende do
          admin apagar e recriar o acesso. */}
      {contaAberta && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setContaAberta(false)}
          />

          <div className="relative w-full sm:max-w-md bg-navy-900 rounded-t-2xl sm:rounded-2xl border border-white/10 p-6">
            <h2 className="font-display text-lg font-semibold">Trocar minha senha</h2>

            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              A senha nova vale no próximo acesso. Esta sessão continua aberta.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="senha-nova"
                  className="block font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2.5"
                >
                  Nova senha
                </label>

                <input
                  id="senha-nova"
                  type="password"
                  autoComplete="new-password"
                  value={novaSenha}
                  onChange={(event) => setNovaSenha(event.target.value)}
                  placeholder="Pelo menos 8 caracteres"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white placeholder:text-slate-600 transition-colors hover:border-white/20 focus:border-gold focus:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/25"
                  disabled={salvandoSenha}
                />
              </div>

              <div>
                <label
                  htmlFor="senha-confirma"
                  className="block font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2.5"
                >
                  Repita a nova senha
                </label>

                <input
                  id="senha-confirma"
                  type="password"
                  autoComplete="new-password"
                  value={confirmaSenha}
                  onChange={(event) => setConfirmaSenha(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white placeholder:text-slate-600 transition-colors hover:border-white/20 focus:border-gold focus:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/25"
                  disabled={salvandoSenha}
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-6 justify-end">
              <button
                onClick={() => setContaAberta(false)}
                disabled={salvandoSenha}
                className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                onClick={trocarSenha}
                disabled={salvandoSenha || !novaSenha || !confirmaSenha}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-gold-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvandoSenha ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : null}
                Trocar senha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conversa do chamado */}
      {conversaPedido && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setConversaPedido(null)}
          />

          <div className="relative w-full sm:max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col bg-navy-900 rounded-t-2xl sm:rounded-2xl border border-white/10">
            <div className="p-5 border-b border-white/10">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Conversa sobre o pedido
              </p>

              <h2 className="font-display text-lg font-semibold mt-2 leading-snug">
                {conversaPedido.product_name}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {carregandoConversa ? (
                <p className="text-slate-400">Carregando conversa...</p>
              ) : mensagens.length === 0 ? (
                <p className="text-slate-400 leading-relaxed">
                  Você relatou o problema e o vendedor ainda não respondeu. Assim que
                  ele escrever, a resposta aparece aqui.
                </p>
              ) : (
                mensagens.map((mensagem) => {
                  const meu = mensagem.autor === 'fornecedor';

                  return (
                    <div
                      key={mensagem.id}
                      className={`flex ${meu ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-xl p-4 ${
                          meu
                            ? 'bg-gold text-navy-900'
                            : 'bg-white/[0.06] text-white border border-white/10'
                        }`}
                      >
                        <p className="text-xs opacity-70 mb-1.5">
                          {meu ? 'Você' : 'Vendedor'} ·{' '}
                          {new Date(mensagem.created_at).toLocaleString('pt-BR')}
                        </p>

                        <p className="text-sm whitespace-pre-wrap">{mensagem.corpo}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-5 border-t border-white/10">
              <textarea
                value={resposta}
                onChange={(event) => setResposta(event.target.value)}
                rows={3}
                placeholder="Escreva para o vendedor..."
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white placeholder:text-slate-600 transition-colors hover:border-white/20 focus:border-gold focus:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/25"
                disabled={enviandoResposta}
              />

              <div className="flex flex-col sm:flex-row gap-3 mt-4 justify-end">
                <button
                  onClick={() => setConversaPedido(null)}
                  className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5"
                >
                  Fechar
                </button>

                <button
                  onClick={responder}
                  disabled={enviandoResposta || resposta.trim().length < 2}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-gold-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {enviandoResposta ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Enviar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
