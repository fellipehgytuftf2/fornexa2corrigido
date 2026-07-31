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

export default function Integrations() {
  const [connection, setConnection] = useState<MlConnection | null>(null);
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
      return;
    }

    setConnection(null);
    setLoading(false);
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
      setErrorMessage(
        motivo
          ? `Não foi possível conectar ao Mercado Livre (motivo: ${motivo}).`
          : 'Não foi possível conectar ao Mercado Livre.'
      );
      window.history.replaceState({}, '', window.location.pathname);
    }
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
