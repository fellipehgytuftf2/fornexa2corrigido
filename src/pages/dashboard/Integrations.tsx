import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle,
  Link2,
  RefreshCw,
  Unplug,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import EnderecoDoFornecedor from '../../components/dashboard/EnderecoDoFornecedor';
import ImpressaoDaEtiqueta from '../../components/dashboard/ImpressaoDaEtiqueta';
import MarketplaceBadge from '../../components/ui/marketplace-badge';

interface MlConnection {
  id: string;
  user_id: string;
  status: 'disconnected' | 'prepared' | 'connected';
  account_name: string;
  external_account_id: string;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Uma pendência do cadastro no Mercado Livre, já em linguagem de gente. */
interface Pendencia {
  codigo: string;
  titulo: string;
  oQueFazer: string;
  onde: string;
}

/**
 * Diagnóstico da conta do Mercado Livre.
 *
 * Estar conectado não é o mesmo que estar apto a vender: o Mercado Livre
 * recusa anúncio de conta com cadastro pendente, e o vendedor descobria isso
 * só ao clicar em publicar, depois de montar o anúncio inteiro.
 */
interface StatusDaConta {
  conectado: boolean;
  apto: boolean;
  /** Conta apta, mas o Mercado Livre está limitando novos anúncios. */
  limite_de_anuncios?: boolean;
  pode_vender?: boolean;
  pode_anunciar?: boolean;
  apelido?: string | null;
  /** 'CPF' ou 'CNPJ', direto do cadastro no Mercado Livre. */
  tipo_de_documento?: string | null;
  pessoa_juridica?: boolean;
  erro_de_leitura?: boolean;
  mensagem?: string;
  pendencias: Pendencia[];
}

export default function Integrations() {
  const [connection, setConnection] = useState<MlConnection | null>(null);
  const [statusDaConta, setStatusDaConta] = useState<StatusDaConta | null>(null);
  const [conferindoConta, setConferindoConta] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadConnection = async () => {
    setLoading(true);
    setErrorMessage('');

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setLoading(false);
      setErrorMessage('Sessão não encontrada. Faça login novamente.');
      return;
    }

    const { data, error } = await supabase
      .from('ml_connections')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle<MlConnection>();

    if (error) {
      setLoading(false);
      setErrorMessage('Não foi possível carregar a integração do Mercado Livre.');
      return;
    }

    if (data) {
      setConnection(data);
      setLoading(false);

      // Conectar não é o mesmo que estar apto a vender. A conta pode estar
      // ligada e mesmo assim ser recusada pelo Mercado Livre por pendência de
      // cadastro — e antes disso o vendedor só descobria no último passo, ao
      // clicar em publicar, depois de montar o anúncio inteiro.
      conferirStatusDaConta();
      return;
    }

    setConnection(null);
    setStatusDaConta(null);
    setLoading(false);
  };

  const conferirStatusDaConta = async () => {
    setConferindoConta(true);

    const { data } = await supabase.functions.invoke<StatusDaConta>('ml-status-conta');

    setStatusDaConta(data ?? null);
    setConferindoConta(false);
  };

  useEffect(() => {
    loadConnection();

    // Se o usuário acabou de voltar do fluxo de autorização do Mercado
    // Livre (redirect do ml-oauth-callback trouxe ?ml=conectado na URL),
    // mostramos a mensagem de sucesso e limpamos o parâmetro da URL.
    const params = new URLSearchParams(window.location.search);
    const mlStatus = params.get('ml');

    if (mlStatus === 'conectado') {
      showSuccess('Mercado Livre conectado com sucesso!');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (mlStatus === 'erro') {
      const motivo = params.get('motivo');

      // O único motivo que o vendedor consegue resolver sozinho merece ser
      // dito em português. Os outros são falha interna e o código crú ajuda
      // o suporte a achar a causa.
      const explicacao =
        motivo === 'conta_ja_ligada'
          ? 'Esta conta do Mercado Livre já está conectada a outra conta do FORNEXA. Cada conta do Mercado Livre só pode estar ligada a uma. Desconecte-a lá antes, ou fale com o suporte.'
          : motivo
            ? `Não foi possível conectar ao Mercado Livre (motivo: ${motivo}).`
            : 'Não foi possível conectar ao Mercado Livre.';

      setErrorMessage(explicacao);
      window.history.replaceState({}, '', window.location.pathname);
    }
    // Roda uma vez, na entrada da tela. Incluir `loadConnection` nas
    // dependências refaria a consulta a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);

    setTimeout(() => {
      setSuccessMessage('');
    }, 4000);
  };

  // Chama a Edge Function ml-oauth-start, que devolve a URL de autorização
  // oficial do Mercado Livre, e redireciona o navegador pra lá. Depois que
  // o vendedor autorizar, o Mercado Livre chama o ml-oauth-callback, que
  // salva os tokens reais e redireciona de volta pra essa mesma tela com
  // ?ml=conectado.
  const handleConnectMercadoLivre = async () => {
    setSaving(true);
    setErrorMessage('');

    const { data, error } = await supabase.functions.invoke<{ url: string; error?: string }>(
      'ml-oauth-start'
    );

    if (error || !data?.url) {
      // Mesmo cuidado já usado no ProductModal.tsx e em Orders.tsx: em
      // respostas não-2xx, o supabase-js não popula "data" — o corpo real
      // do erro vem em error.context.
      let mensagemEspecifica: string | undefined = data?.error;

      const errorContext = (
        error as { context?: { json?: () => Promise<{ error?: string }> } } | null
      )?.context;

      if (!mensagemEspecifica && errorContext?.json) {
        try {
          const errorBody = await errorContext.json();
          mensagemEspecifica = errorBody?.error;
        } catch {
          // segue com a mensagem genérica abaixo
        }
      }

      setSaving(false);
      setErrorMessage(
        mensagemEspecifica ?? 'Não foi possível iniciar a conexão com o Mercado Livre. Tente novamente.'
      );
      return;
    }

    // Redireciona o navegador inteiro pra tela de autorização do ML.
    // Não precisamos desligar o "saving" aqui porque a página vai navegar
    // pra fora do app.
    window.location.href = data.url;
  };

  const handleDisconnectMercadoLivre = async () => {
    if (!connection) {
      return;
    }

    setSaving(true);
    setErrorMessage('');

    const { data, error } = await supabase
      .from('ml_connections')
      .update({
        status: 'disconnected',
        account_name: '',
        external_account_id: '',
        access_token: null,
        refresh_token: null,
        expires_at: null,
        connected_at: null,
      })
      .eq('id', connection.id)
      .select('*')
      .single<MlConnection>();

    setSaving(false);

    if (error) {
      setErrorMessage(`Não foi possível desconectar o Mercado Livre: ${error.message}`);
      return;
    }

    setConnection(data);
    showSuccess('Mercado Livre desconectado.');
  };

  // IMPORTANTE: só 'connected' significa que existe uma conexão real, com
  // tokens válidos, obtida pelo fluxo OAuth de verdade. 'prepared' era um
  // status de placeholder usado antes de o OAuth estar ligado na interface
  // e não deve mais liberar funcionalidades que dependem da API do ML.
  const mercadoLivreConnected = connection?.status === 'connected';

  const formatarData = (valor?: string | null) => {
    if (!valor) {
      return '—';
    }

    return new Date(valor).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-900 dark:text-white">
          Integrações
        </h1>

        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
          Conecte marketplaces, fornecedores e ferramentas externas.
        </p>
      </div>

      {/* Vem antes do status da conexão: configurar o remetente errado só é
          descoberto quando a primeira etiqueta sai — e aí não dá mais para
          mudar aquele envio. */}
      <EnderecoDoFornecedor />

      {/* Ao lado do endereço de propósito: são as duas configurações que o
          vendedor faz uma vez no Mercado Livre e que decidem como o pacote
          sai do galpão do fornecedor. */}
      <ImpressaoDaEtiqueta />

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

      {loading ? (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-black dark:border-navy-700 dark:border-t-white rounded-full animate-spin mx-auto" />

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-4">
            Carregando integrações...
          </p>
        </div>
      ) : (
        <>
          {/* ------------------------------------------------------------
              Resumo da conexão
             ------------------------------------------------------------ */}
          <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                  mercadoLivreConnected
                    ? 'bg-green-100 dark:bg-green-900/30'
                    : 'bg-gray-100 dark:bg-navy-700'
                }`}
              >
                <RefreshCw
                  className={`w-6 h-6 ${
                    mercadoLivreConnected
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-500 dark:text-slate-400'
                  }`}
                />
              </div>

              <div className="min-w-0">
                <h2 className="text-navy-900 dark:text-white font-semibold">
                  Status da integração
                </h2>

                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                  {mercadoLivreConnected
                    ? `Conectada desde ${formatarData(connection?.connected_at)}. Pedidos e anúncios usam esta conta.`
                    : 'Nenhum marketplace conectado. Conecte para publicar anúncios e receber pedidos.'}
                </p>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------
              Lojas conectadas
             ------------------------------------------------------------ */}
          {mercadoLivreConnected && (
            <div>
              <h2 className="text-lg font-bold text-navy-900 dark:text-white mb-3">
                Lojas conectadas
              </h2>

              <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-navy-700">
                  <div className="flex items-center gap-3 min-w-0">
                    <MarketplaceBadge
                      marketplace="Mercado Livre"
                      showName={false}
                      size="lg"
                    />

                    <div className="min-w-0">
                      <h3 className="text-navy-900 dark:text-white font-semibold truncate">
                        {connection?.account_name || 'Conta do Mercado Livre'}
                      </h3>

                      <p className="text-sm text-gray-500 dark:text-slate-400">
                        Mercado Livre
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    Conectada
                  </span>
                </div>

                <dl className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
                  {[
                    ['Conta', connection?.account_name || '—'],
                    ['Identificador do vendedor', connection?.external_account_id || '—'],
                    ['Conectada em', formatarData(connection?.connected_at)],
                  ].map(([rotulo, valor]) => (
                    <div key={rotulo} className="min-w-0">
                      <dt className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">
                        {rotulo}
                      </dt>

                      <dd className="text-sm font-medium text-navy-900 dark:text-white mt-1.5 break-all">
                        {valor}
                      </dd>
                    </div>
                  ))}
                </dl>

                {/* Diagnóstico do cadastro no Mercado Livre.
                    Conectar não basta: a conta pode estar ligada e mesmo assim
                    ter todo anúncio recusado por pendência de cadastro. Antes
                    disso o vendedor só descobria ao clicar em publicar, com uma
                    mensagem genérica de recusa, depois de montar o anúncio
                    inteiro. */}
                {conferindoConta && (
                  <div className="mx-5 mb-5 flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Conferindo se a conta está apta a vender...
                  </div>
                )}

                {!conferindoConta && statusDaConta?.erro_de_leitura && (
                  <div className="mx-5 mb-5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      {statusDaConta.mensagem}
                    </p>
                  </div>
                )}

                {!conferindoConta && statusDaConta?.apto && (
                  <div className="mx-5 mb-5 flex items-start gap-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />

                    <div>
                      <p className="text-sm text-green-800 dark:text-green-200">
                        Conta apta a vender. Seus anúncios podem ser publicados
                        normalmente.
                      </p>

                      {/* O tipo da conta decide se ela emite nota fiscal, e é
                          isso que separa um envio que imprime etiqueta de um
                          que fica esperando. Ficou visível porque um pedido
                          travou nisso e a conversa inteira correu supondo o
                          tipo, sem ninguém ter conferido. */}
                      {statusDaConta.tipo_de_documento && (
                        <p className="text-sm text-green-800/80 dark:text-green-200/80 mt-2 leading-relaxed">
                          Cadastrada como{' '}
                          <strong>
                            {statusDaConta.pessoa_juridica
                              ? 'pessoa jurídica (CNPJ)'
                              : 'pessoa física (CPF)'}
                          </strong>
                          .{' '}
                          {statusDaConta.pessoa_juridica
                            ? 'Contas com CNPJ emitem nota fiscal, o que alguns tipos de envio exigem antes de liberar a etiqueta.'
                            : 'Contas com CPF normalmente não emitem nota fiscal.'}
                        </p>
                      )}

                      {/* A armadilha que custou dias em 2026-09.
                          Cinco vendas de um cliente ficaram travadas em
                          invoice_pending, e a causa não era ser pessoa física:
                          a conta tinha o Emissor de NF-e ligado com certificado
                          inválido. Ligado, o Mercado Livre espera nota em toda
                          venda; sem certificado válido, a nota nunca sai. O
                          resultado é etiqueta que não libera nunca, sem
                          explicação em lugar nenhum. */}
                      {!statusDaConta.pessoa_juridica && (
                        <p className="text-sm text-green-800/80 dark:text-green-200/80 mt-2 leading-relaxed">
                          <strong>Se algum pedido travar esperando nota fiscal:</strong>{' '}
                          confira, nas configurações do Mercado Livre, se o
                          Emissor de NF-e está ligado na sua conta. Ligado sem
                          certificado válido, ele faz o Mercado Livre esperar uma
                          nota que nunca é emitida — e a etiqueta não libera. Quem
                          não emite nota deve mantê-lo desligado.
                        </p>
                      )}

                      {/* Aviso em outro tom: não é impedimento de conta, é
                          limite de quantos anúncios ela sustenta sem pagar. */}
                      {statusDaConta.limite_de_anuncios && (
                        <p className="text-sm text-green-800/80 dark:text-green-200/80 mt-2 leading-relaxed">
                          O Mercado Livre está limitando novos anúncios nesta
                          conta no momento. Costuma ser a cota de anúncios
                          grátis: ela libera conforme anúncios antigos saem do
                          ar, ou você publica como anúncio pago.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Sem pendência identificada não existe caixa vermelha. Acusar
                    problema sem dizer qual assusta e não ajuda — foi o que
                    aconteceu numa conta que publicava normalmente. */}
                {!conferindoConta &&
                  statusDaConta &&
                  !statusDaConta.apto &&
                  !statusDaConta.erro_de_leitura &&
                  statusDaConta.pendencias.length > 0 && (
                    <div className="mx-5 mb-5 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-5">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />

                        <div>
                          <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                            O Mercado Livre ainda não liberou esta conta para
                            vender
                          </p>

                          <p className="text-sm text-red-700 dark:text-red-300 mt-1.5 leading-relaxed">
                            Enquanto isso, qualquer anúncio será recusado — pelo
                            FORNEXA ou pelo painel do próprio Mercado Livre. A
                            pendência é no cadastro da conta e só você pode
                            resolver.
                          </p>
                        </div>
                      </div>

                      {statusDaConta.pendencias.length > 0 && (
                        <ol className="mt-4 space-y-3">
                          {statusDaConta.pendencias.map((pendencia, indice) => (
                            <li
                              key={pendencia.codigo}
                              className="flex gap-3 rounded-lg bg-white dark:bg-navy-800 border border-red-200 dark:border-red-900 p-3"
                            >
                              <span className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-bold flex items-center justify-center shrink-0">
                                {indice + 1}
                              </span>

                              <div>
                                <p className="text-sm font-semibold text-navy-900 dark:text-white">
                                  {pendencia.titulo}
                                </p>

                                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1 leading-relaxed">
                                  {pendencia.oQueFazer}
                                </p>

                                <p className="text-xs font-medium text-gray-500 dark:text-slate-500 mt-1.5">
                                  {pendencia.onde}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}

                      <button
                        onClick={conferirStatusDaConta}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Já resolvi, conferir de novo
                      </button>
                    </div>
                  )}

                <div className="px-5 pb-5">
                  <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
                    Para sincronizar pedidos, use o botão em{' '}
                    <Link
                      to="/dashboard/orders"
                      className="font-medium text-navy-900 dark:text-white hover:underline"
                    >
                      Pedidos
                    </Link>
                    .
                  </p>

                  <button
                    onClick={handleDisconnectMercadoLivre}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    <Unplug className="w-4 h-4" />
                    Desconectar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------
              Marketplaces disponíveis
             ------------------------------------------------------------ */}
          <div>
            <h2 className="text-lg font-bold text-navy-900 dark:text-white mb-3">
              Marketplaces disponíveis
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm flex flex-col">
                <div className="flex items-start gap-3">
                  <MarketplaceBadge
                    marketplace="Mercado Livre"
                    showName={false}
                    size="lg"
                  />

                  <div className="min-w-0">
                    <h3 className="text-navy-900 dark:text-white font-semibold">
                      Mercado Livre
                    </h3>

                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
                      {mercadoLivreConnected
                        ? '1 loja conectada'
                        : 'Nenhuma loja conectada'}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-gray-500 dark:text-slate-400 mt-4 flex-1">
                  Publique anúncios e receba os pedidos automaticamente pela API
                  oficial.
                </p>

                {/* O Mercado Livre não pergunta em qual conta conectar: aprova
                    sozinho a que já estiver logada no navegador. Quem tem duas
                    contas conecta a errada, e ao tentar de novo conecta a
                    errada outra vez — parece defeito do FORNEXA e é sessão do
                    navegador. Não existe parâmetro na API deles para forçar a
                    escolha.

                    Já teve aviso aqui, primeiro em amarelo, depois em cinza.
                    Os dois ficaram feios num cartão que é só um botão, para
                    tratar de um caso que atinge a minoria. Enquanto não houver
                    lugar melhor, isto vive no suporte: janela anônima resolve,
                    e é o que se responde a quem perguntar. */}
                {!mercadoLivreConnected && (
                  <button
                    onClick={handleConnectMercadoLivre}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 mt-4 px-4 py-2.5 rounded-lg bg-black hover:bg-gray-900 text-white text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    <Link2 className="w-4 h-4" />
                    {saving ? 'Redirecionando...' : 'Conectar'}
                  </button>
                )}
              </div>

              <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm flex flex-col">
                <div className="flex items-start gap-3">
                  <MarketplaceBadge marketplace="Shopee" showName={false} size="lg" />

                  <div className="min-w-0">
                    <h3 className="text-navy-900 dark:text-white font-semibold">Shopee</h3>

                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
                      Nenhuma loja conectada
                    </p>
                  </div>
                </div>

                <p className="text-sm text-gray-500 dark:text-slate-400 mt-4 flex-1">
                  Integração futura para expansão em novos marketplaces.
                </p>

                <span className="inline-flex items-center self-start mt-4 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-navy-700 dark:text-slate-300">
                  Em breve
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
