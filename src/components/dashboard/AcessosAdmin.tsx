import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  KeyRound,
  Link2,
  Loader2,
  Search,
  Truck,
  UserPlus,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ModalPortal from '../ui/modal-portal';

/** Janela do que ainda conta como cadastro novo. */
const DIAS_DE_NOVIDADE = 7;

/**
 * Conta criada dentro da janela de novidade.
 *
 * Sete dias porque é o intervalo em que ainda dá para agir: se a pessoa pagou e
 * não entrou, ou entrou e não conectou o Mercado Livre, é aí que um contato
 * resolve — depois disso vira reembolso.
 */
function ehNova(criadoEm: string | null): boolean {
  if (!criadoEm) {
    return false;
  }

  const dias = (Date.now() - new Date(criadoEm).getTime()) / 86400000;

  return dias >= 0 && dias <= DIAS_DE_NOVIDADE;
}

interface Conta {
  user_id: string;
  nome: string | null;
  email: string | null;
  tipo: 'Administrador' | 'Vendedor' | 'Fornecedor';
  plano: string | null;
  plan_status: string | null;
  plan_expira_em: string | null;
  entra_no_painel: boolean;
  ml_conectado: boolean;
  /** 'nunca' nunca ligou · 'conectada' ligada agora · 'caiu' já ligou e caiu. */
  ml_situacao: 'nunca' | 'conectada' | 'caiu' | null;
  fornecedores_visiveis: number;
  total_pedidos: number;
  total_produtos: number;
  criado_em: string | null;
  ultimo_acesso: string | null;
}

interface FornecedorDaConta {
  supplier_id: string;
  fornecedor: string | null;
  pedidos: number;
  primeiro_pedido: string | null;
  ultimo_pedido: string | null;
}

const rotulosDePlano: Record<string, string> = {
  free: 'Gratuito',
  basico: 'Básico',
  premium: 'Premium',
  start: 'Start',
  pro: 'Pro',
  enterprise: 'Enterprise',
  lifetime: 'Vitalício',
};

/**
 * Recortes da lista, cada um respondendo uma pergunta de rotina.
 *
 * São filtros e não colunas novas porque a tabela já tem dez colunas: o que
 * faltava não era mais informação na tela, era conseguir olhar um grupo de
 * cada vez.
 *
 * A ordem importa — começa em "quem precisa de mim hoje" e termina em
 * "como está a base".
 */
const FILTROS: { id: string; rotulo: string; aplica: (conta: Conta) => boolean }[] = [
  { id: 'todas', rotulo: 'Todas', aplica: () => true },
  { id: 'novas', rotulo: 'Novas', aplica: (conta) => ehNova(conta.criado_em) },

  // Pagou e nunca entrou é reembolso a caminho — o recorte mais urgente.
  {
    id: 'nunca_entrou',
    rotulo: 'Nunca entraram',
    aplica: (conta) => conta.entra_no_painel && !conta.ultimo_acesso,
  },

  // Tem acesso e não ligou o Mercado Livre: não vendeu nada ainda, e não vai.
  {
    id: 'sem_ml',
    rotulo: 'Sem Mercado Livre',
    aplica: (conta) => conta.entra_no_painel && !conta.ml_conectado,
  },

  // O recorte mais acionável de todos: já usou, parou de funcionar, e a pessoa
  // provavelmente nem sabe.
  {
    id: 'ml_caiu',
    rotulo: 'Conexão caiu',
    aplica: (conta) => conta.entra_no_painel && conta.ml_situacao === 'caiu',
  },

  { id: 'premium', rotulo: 'Premium', aplica: (conta) => conta.plano === 'premium' },
  { id: 'basico', rotulo: 'Básico', aplica: (conta) => conta.plano === 'basico' },
  { id: 'ativas', rotulo: 'Em dia', aplica: (conta) => conta.plan_status === 'ativo' },
  {
    id: 'bloqueadas',
    rotulo: 'Sem acesso',
    aplica: (conta) => !conta.entra_no_painel,
  },
];

const selosDeSituacao: Record<string, { texto: string; cor: string }> = {
  ativo: {
    texto: 'Em dia',
    cor: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  },
  vencido: {
    texto: 'Vencido',
    cor: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  cancelado: {
    texto: 'Cancelado',
    cor: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  },
  reembolsado: {
    texto: 'Reembolsado',
    cor: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  },
  inativo: {
    texto: 'Sem assinatura',
    cor: 'bg-gray-100 text-gray-600 dark:bg-navy-600 dark:text-slate-300',
  },
};

/**
 * Contas, acesso e assinatura numa tabela só.
 *
 * Antes eram duas seções: uma dizia o que a conta alcança, outra o que ela
 * paga. Ninguém decide nada olhando só metade — para saber se vale cortar
 * alguém é preciso ver plano e uso lado a lado, e cruzar duas tabelas de
 * cabeça é como se erra.
 *
 * Fornecedor fica numa lista à parte porque não tem plano, não publica anúncio
 * e não conecta marketplace: quatro das colunas não se aplicam a ele, e linha
 * cheia de traço só atrapalha a leitura das que importam.
 */
export default function AcessosAdmin() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [confirmarEntrada, setConfirmarEntrada] = useState<Conta | null>(null);
  const [entrando, setEntrando] = useState(false);

  const [detalhe, setDetalhe] = useState<Conta | null>(null);
  const [fornecedoresDaConta, setFornecedoresDaConta] = useState<FornecedorDaConta[]>([]);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const [editando, setEditando] = useState<Conta | null>(null);
  const [novoPlano, setNovoPlano] = useState('premium');
  const [novoStatus, setNovoStatus] = useState('ativo');
  const [dias, setDias] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    setErro('');

    const { data, error } = await supabase.rpc('admin_mapa_de_acesso');

    if (error) {
      setErro(`Não foi possível carregar os acessos: ${error.message}`);
      setContas([]);
    } else {
      setContas((data as Conta[]) || []);
    }

    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    const recorte = FILTROS.find((item) => item.id === filtro) ?? FILTROS[0];

    return contas.filter((conta) => {
      // Fornecedor tem lista própria embaixo e não tem plano nem Mercado
      // Livre, então nenhum destes recortes se aplica a ele.
      if (conta.tipo !== 'Fornecedor' && !recorte.aplica(conta)) {
        return false;
      }

      if (!termo) {
        return true;
      }

      return (
        (conta.nome || '').toLowerCase().includes(termo) ||
        (conta.email || '').toLowerCase().includes(termo)
      );
    });
  }, [contas, busca, filtro]);

  // Só vendedores: fornecedor entra por convite do admin, não por cadastro, e
  // contar junto esconderia o número que interessa.
  const novasDaSemana = contas.filter(
    (conta) => conta.tipo !== 'Fornecedor' && ehNova(conta.criado_em)
  );

  const vendedores = filtradas.filter((conta) => conta.tipo !== 'Fornecedor');
  const fornecedores = filtradas.filter((conta) => conta.tipo === 'Fornecedor');

  const administradores = contas.filter((conta) => conta.tipo === 'Administrador');

  // Conta que paga e nunca entrou é reembolso a caminho.
  const pagamNaoUsam = contas.filter(
    (conta) => conta.entra_no_painel && conta.tipo === 'Vendedor' && !conta.ultimo_acesso
  );

  const abrirDetalhe = async (conta: Conta) => {
    setDetalhe(conta);
    setFornecedoresDaConta([]);
    setCarregandoDetalhe(true);

    const { data, error } = await supabase.rpc('admin_fornecedores_da_conta', {
      p_user_id: conta.user_id,
    });

    setCarregandoDetalhe(false);

    if (!error) {
      setFornecedoresDaConta((data as FornecedorDaConta[]) || []);
    }
  };

  const abrirEdicao = (conta: Conta) => {
    setEditando(conta);
    setNovoPlano(conta.plano || 'premium');
    setNovoStatus(conta.plan_status || 'ativo');

    // Vazio quer dizer "não expira". Preencher com a data atual induziria a
    // criar validade onde não existia.
    setDias('');
  };

  const salvarPlano = async () => {
    if (!editando) {
      return;
    }

    setSalvando(true);
    setErro('');

    const { error } = await supabase.rpc('admin_define_plano', {
      p_user_id: editando.user_id,
      p_plano: novoPlano,
      p_status: novoStatus,
      p_dias: dias ? Number(dias) : null,
    });

    setSalvando(false);

    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }

    setAviso(`Plano de ${editando.email} atualizado.`);
    setTimeout(() => setAviso(''), 4000);

    setEditando(null);
    await carregar();
  };

  /**
   * Entra na conta do cliente para ver a plataforma como ele vê.
   *
   * A sessão do admin é TROCADA, não duplicada: o navegador guarda uma sessão
   * só. Por isso a confirmação avisa antes — quem clica sem saber acha que o
   * sistema deslogou sozinho.
   */
  const entrarNaConta = async (conta: Conta) => {
    setEntrando(true);
    setErro('');

    const { data, error } = await supabase.functions.invoke<{
      token_hash?: string;
      error?: string;
    }>('admin-entrar-como', {
      body: { user_id: conta.user_id },
    });

    let mensagem = data?.error;

    // Resposta fora do 2xx não vem em `data`; o corpo fica em error.context.
    const contexto = (
      error as { context?: { json?: () => Promise<{ error?: string }> } } | null
    )?.context;

    if (!mensagem && contexto?.json) {
      try {
        mensagem = (await contexto.json())?.error;
      } catch {
        // segue com a mensagem genérica
      }
    }

    if (!data?.token_hash) {
      setEntrando(false);
      setErro(mensagem ?? 'Não foi possível entrar nesta conta.');
      return;
    }

    // Guarda a sessão do admin ANTES de trocar por a do cliente.
    //
    // O navegador guarda uma sessão só, então entrar no cliente sempre
    // substitui a do admin — não há como ter as duas ao mesmo tempo na mesma
    // aba. O que dá para evitar é ter que digitar a senha de novo: com os
    // tokens guardados aqui, sair do modo suporte devolve o admin ao lugar em
    // um clique.
    const { data: sessaoAtual } = await supabase.auth.getSession();

    if (sessaoAtual.session) {
      window.localStorage.setItem(
        'fornexa:sessao-admin',
        JSON.stringify({
          access_token: sessaoAtual.session.access_token,
          refresh_token: sessaoAtual.session.refresh_token,
        })
      );
    }

    const { error: sessaoError } = await supabase.auth.verifyOtp({
      token_hash: data.token_hash,
      type: 'magiclink',
    });

    if (sessaoError) {
      setEntrando(false);
      window.localStorage.removeItem('fornexa:sessao-admin');
      setErro(`Não foi possível abrir a sessão: ${sessaoError.message}`);
      return;
    }

    // Marca para o aviso de modo suporte aparecer no painel. É informação de
    // tela, não de segurança — quem manda é a sessão, e ela já é do cliente.
    window.localStorage.setItem(
      'fornexa:modo-suporte',
      JSON.stringify({ nome: conta.nome, email: conta.email })
    );

    window.location.assign('/dashboard');
  };

  const formatarData = (valor: string | null) => {
    if (!valor) {
      return 'nunca';
    }

    const data = new Date(valor);
    const dias = Math.floor((Date.now() - data.getTime()) / 86400000);

    if (dias === 0) return 'hoje';
    if (dias === 1) return 'ontem';
    if (dias < 30) return `${dias} dias atrás`;

    return data.toLocaleDateString('pt-BR');
  };

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm mt-8">
      <div className="flex items-center gap-3 mb-1">
        <KeyRound className="w-5 h-5 text-gray-600 dark:text-slate-400" />

        <h2 className="text-lg font-semibold text-navy-900 dark:text-white">
          Contas e acessos
        </h2>
      </div>

      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
        Quem é cada conta, o que ela paga e até onde ela alcança. Clique numa
        linha para ver quais fornecedores ela já enxerga.
      </p>

      {erro && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 mb-5">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{erro}</p>
        </div>
      )}

      {aviso && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3 mb-5">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <p className="text-sm text-green-700 dark:text-green-300">{aviso}</p>
        </div>
      )}

      {administradores.length > 1 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3.5 mb-4">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />

          <p className="text-sm text-amber-800 dark:text-amber-200">
            {administradores.length} contas são administradoras:{' '}
            {administradores.map((conta) => conta.email).join(', ')}. Admin
            enxerga e altera tudo, inclusive planos e fornecedores.
          </p>
        </div>
      )}

      {pagamNaoUsam.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3.5 mb-4">
          <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />

          <p className="text-sm text-blue-800 dark:text-blue-200">
            {pagamNaoUsam.length === 1
              ? '1 conta tem acesso liberado e nunca entrou.'
              : `${pagamNaoUsam.length} contas têm acesso liberado e nunca entraram.`}{' '}
            Vale falar com quem pagou e não usou — é o cliente que pede reembolso
            primeiro.
          </p>
        </div>
      )}

      {novasDaSemana.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3.5 mb-4">
          <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />

          <p className="text-sm text-blue-700 dark:text-blue-300 flex-1 min-w-0">
            {novasDaSemana.length === 1
              ? '1 conta nova nos últimos 7 dias.'
              : `${novasDaSemana.length} contas novas nos últimos 7 dias.`}{' '}
            É a janela em que um contato ainda resolve.
          </p>

          <button
            type="button"
            onClick={() => setFiltro((atual) => (atual === 'novas' ? 'todas' : 'novas'))}
            aria-pressed={filtro === 'novas'}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filtro === 'novas'
                ? 'bg-blue-600 text-white'
                : 'border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40'
            }`}
          >
            {filtro === 'novas' ? 'Mostrar todas' : 'Ver só as novas'}
          </button>
        </div>
      )}

      {/* Cada recorte mostra quantos são antes de ser clicado: um "0" ao lado
          de "Nunca entraram" já responde a pergunta sem trocar a tela. */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTROS.map((item) => {
          const quantos = contas.filter(
            (conta) => conta.tipo !== 'Fornecedor' && item.aplica(conta)
          ).length;

          const ativo = filtro === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFiltro(item.id)}
              aria-pressed={ativo}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                ativo
                  ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900'
                  : 'border border-gray-200 dark:border-navy-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-navy-700'
              }`}
            >
              {item.rotulo}

              <span
                className={`font-mono tabular-nums ${
                  ativo ? 'opacity-70' : 'text-gray-400 dark:text-slate-500'
                }`}
              >
                {quantos}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative mb-6">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />

        <input
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder="Buscar por nome ou e-mail"
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-700 text-navy-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
        />
      </div>

      {carregando ? (
        <div className="flex items-center gap-3 text-gray-500 dark:text-slate-400 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Carregando...
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-navy-600">
                  <th className="pb-3 pr-4 font-medium">Conta</th>
                  <th className="pb-3 pr-4 font-medium">Plano</th>
                  <th className="pb-3 pr-4 font-medium">Situação</th>
                  <th className="pb-3 pr-4 font-medium">Validade</th>
                  <th className="pb-3 pr-4 font-medium">ML</th>
                  <th className="pb-3 pr-4 font-medium">Fornec.</th>
                  <th className="pb-3 pr-4 font-medium">Pedidos</th>
                  <th className="pb-3 pr-4 font-medium">Criada</th>
                  <th className="pb-3 pr-4 font-medium">Último acesso</th>
                  <th className="pb-3" />
                </tr>
              </thead>

              <tbody>
                {vendedores.map((conta) => {
                  const selo =
                    selosDeSituacao[conta.plan_status || 'inativo'] ||
                    selosDeSituacao.inativo;

                  return (
                    <tr
                      key={conta.user_id}
                      onClick={() => abrirDetalhe(conta)}
                      className="border-b border-gray-100 dark:border-navy-700 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-navy-700/50"
                    >
                      <td className="py-3 pr-4">
                        <p className="text-navy-900 dark:text-white font-medium flex items-center gap-2">
                          {conta.nome}

                          {conta.tipo === 'Administrador' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                              Admin
                            </span>
                          )}

                          {ehNova(conta.criado_em) && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                              Nova
                            </span>
                          )}
                        </p>

                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          {conta.email}
                        </p>
                      </td>

                      <td className="py-3 pr-4 text-navy-900 dark:text-white">
                        {rotulosDePlano[conta.plano || ''] || conta.plano || '—'}
                      </td>

                      <td className="py-3 pr-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${selo.cor}`}
                        >
                          {selo.texto}
                        </span>
                      </td>

                      <td className="py-3 pr-4 text-gray-500 dark:text-slate-400 whitespace-nowrap">
                        {conta.plan_expira_em
                          ? new Date(conta.plan_expira_em).toLocaleDateString('pt-BR')
                          : 'não expira'}
                      </td>

                      {/* "Caiu" e "nunca ligou" pedem conversas diferentes:
                          uma é reconectar, a outra é ensinar a conectar. */}
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {conta.ml_conectado ? (
                          <Link2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                        ) : conta.ml_situacao === 'caiu' ? (
                          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                            Caiu
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-slate-600">—</span>
                        )}
                      </td>

                      <td className="py-3 pr-4 text-navy-900 dark:text-white">
                        {conta.tipo === 'Administrador'
                          ? 'todos'
                          : conta.fornecedores_visiveis === 0
                            ? 'nenhum'
                            : conta.fornecedores_visiveis}
                      </td>

                      <td className="py-3 pr-4 text-gray-600 dark:text-slate-300">
                        {conta.total_pedidos}
                      </td>

                      <td className="py-3 pr-4 text-gray-600 dark:text-slate-300 whitespace-nowrap">
                        {formatarData(conta.criado_em)}
                      </td>

                      <td className="py-3 pr-4 text-gray-600 dark:text-slate-300 whitespace-nowrap">
                        {formatarData(conta.ultimo_acesso)}
                      </td>

                      <td className="py-3 text-right">
                        <button
                          onClick={(evento) => {
                            // Sem isto, ajustar o plano abriria o detalhe junto.
                            evento.stopPropagation();
                            abrirEdicao(conta);
                          }}
                          className="text-xs font-semibold text-navy-900 dark:text-white underline underline-offset-2 hover:opacity-70 whitespace-nowrap"
                        >
                          Ajustar
                        </button>

                        <button
                          onClick={(evento) => {
                            evento.stopPropagation();
                            setConfirmarEntrada(conta);
                          }}
                          className="ml-3 text-xs font-semibold text-navy-900 dark:text-white underline underline-offset-2 hover:opacity-70 whitespace-nowrap"
                        >
                          Entrar
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {vendedores.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="py-8 text-center text-sm text-gray-500 dark:text-slate-400"
                    >
                      Nenhuma conta encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Fornecedores à parte: sem plano, sem marketplace, sem anúncio. */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-navy-600">
            <div className="flex items-center gap-2 mb-1">
              <Truck className="w-4 h-4 text-gray-600 dark:text-slate-400" />

              <h3 className="text-sm font-semibold text-navy-900 dark:text-white">
                Fornecedores com acesso ao portal
              </h3>
            </div>

            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
              Entram pelo portal próprio, não pelo painel do vendedor. Não têm
              plano nem conexão com marketplace.
            </p>

            {fornecedores.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-slate-400 py-3">
                Nenhum fornecedor com login criado.
              </p>
            ) : (
              <div className="space-y-2">
                {fornecedores.map((conta) => (
                  <div
                    key={conta.user_id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-navy-600 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-navy-900 dark:text-white">
                        {conta.nome}
                      </p>

                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        {conta.email}
                      </p>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      Último acesso: {formatarData(conta.ultimo_acesso)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {confirmarEntrada && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto">
              <h3 className="text-lg font-semibold text-navy-900 dark:text-white">
                Entrar na conta de {confirmarEntrada.nome || confirmarEntrada.email}?
              </h3>

              <p className="text-sm text-gray-500 dark:text-slate-400 mt-3 leading-relaxed">
                Você vai ver a plataforma exatamente como esta pessoa vê, e o que
                você fizer lá é como se fosse ela.
              </p>

              <p className="text-sm text-gray-500 dark:text-slate-400 mt-3 leading-relaxed">
                <strong className="text-navy-900 dark:text-white">
                  Para voltar, é só sair do modo suporte.
                </strong>{' '}
                Sua conta de admin volta sozinha, sem precisar digitar a senha.
              </p>

              <p className="text-sm text-gray-500 dark:text-slate-400 mt-3 leading-relaxed">
                A entrada fica registrada com seu nome e a data.
              </p>

              <div className="flex flex-col sm:flex-row gap-2 mt-6 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmarEntrada(null)}
                  disabled={entrando}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={() => entrarNaConta(confirmarEntrada)}
                  disabled={entrando}
                  className="px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-white text-white dark:text-navy-900 text-sm font-semibold disabled:opacity-50"
                >
                  {entrando ? 'Entrando...' : 'Entrar na conta'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {detalhe && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black/50 z-[100] overflow-y-auto flex min-h-full items-start justify-center p-4">
            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 w-full max-w-lg my-auto">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="text-lg font-semibold text-navy-900 dark:text-white">
                    {detalhe.nome}
                  </h3>

                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    {detalhe.email}
                  </p>
                </div>

                <button
                  onClick={() => setDetalhe(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  { rotulo: 'Tipo', valor: detalhe.tipo },
                  {
                    rotulo: 'Plano',
                    valor: `${rotulosDePlano[detalhe.plano || ''] || detalhe.plano || '—'} · ${
                      detalhe.plan_status || '—'
                    }`,
                  },
                  { rotulo: 'Produtos preparados', valor: String(detalhe.total_produtos) },
                  { rotulo: 'Pedidos', valor: String(detalhe.total_pedidos) },
                  {
                    rotulo: 'Mercado Livre',
                    valor: detalhe.ml_conectado ? 'conectado' : 'não conectado',
                  },
                  { rotulo: 'Conta criada', valor: formatarData(detalhe.criado_em) },
                ].map((item) => (
                  <div
                    key={item.rotulo}
                    className="bg-gray-50 dark:bg-navy-700 rounded-lg p-3"
                  >
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {item.rotulo}
                    </p>

                    <p className="text-sm font-semibold text-navy-900 dark:text-white mt-0.5">
                      {item.valor}
                    </p>
                  </div>
                ))}
              </div>

              <h4 className="text-sm font-semibold text-navy-900 dark:text-white mb-1">
                Fornecedores que esta conta enxerga
              </h4>

              <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
                {detalhe.tipo === 'Administrador'
                  ? 'Administrador enxerga o cadastro inteiro, com pedido ou sem.'
                  : 'Um vendedor passa a enxergar o fornecedor quando tem pedido com ele — é quando precisa pagar.'}
              </p>

              {carregandoDetalhe ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando...
                </div>
              ) : fornecedoresDaConta.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-slate-400 py-3">
                  Nenhum. Esta conta nunca teve pedido com fornecedor algum.
                </p>
              ) : (
                <ul className="space-y-2">
                  {fornecedoresDaConta.map((item) => (
                    <li
                      key={item.supplier_id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-navy-600 px-3 py-2.5"
                    >
                      <span className="text-sm text-navy-900 dark:text-white">
                        {item.fornecedor}
                      </span>

                      <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                        {item.pedidos === 0
                          ? 'sem pedidos'
                          : `${item.pedidos} pedido(s) · ${formatarData(item.ultimo_pedido)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </ModalPortal>
      )}

      {editando && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black/50 z-[100] overflow-y-auto flex min-h-full items-start justify-center p-4">
            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 w-full max-w-md my-auto">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="text-lg font-semibold text-navy-900 dark:text-white">
                    Ajustar plano
                  </h3>

                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    {editando.email}
                  </p>
                </div>

                <button
                  onClick={() => setEditando(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                    Plano
                  </label>

                  <select
                    value={novoPlano}
                    onChange={(evento) => setNovoPlano(evento.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-700 text-navy-900 dark:text-white text-sm"
                  >
                    <option value="basico">Básico</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                    Situação
                  </label>

                  <select
                    value={novoStatus}
                    onChange={(evento) => setNovoStatus(evento.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-700 text-navy-900 dark:text-white text-sm"
                  >
                    <option value="ativo">Ativo — libera o acesso</option>
                    <option value="inativo">Inativo — bloqueia</option>
                    <option value="vencido">Vencido — bloqueia</option>
                    <option value="cancelado">Cancelado — bloqueia</option>
                    <option value="reembolsado">Reembolsado — bloqueia</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                    Dias de acesso
                  </label>

                  <input
                    type="number"
                    min={1}
                    value={dias}
                    onChange={(evento) => setDias(evento.target.value)}
                    placeholder="Deixe vazio para não expirar"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-700 text-navy-900 dark:text-white text-sm"
                  />

                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                    Vazio serve para compra única e cortesia. Preencha 33 para uma
                    mensalidade do Básico.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={salvarPlano}
                  disabled={salvando}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-gold text-white dark:text-navy-900 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                  Salvar
                </button>

                <button
                  onClick={() => setEditando(null)}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm font-semibold"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
