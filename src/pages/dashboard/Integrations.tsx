import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Link2,
  Plug,
  RefreshCw,
  ShoppingBag,
  Store,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

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
  }, []);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);

    setTimeout(() => {
      setSuccessMessage('');
    }, 4000);
  };

  const handlePrepareMercadoLivre = async () => {
    setSaving(true);
    setErrorMessage('');

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setSaving(false);
      setErrorMessage('Sessão não encontrada. Faça login novamente.');
      return;
    }

    const { data, error } = await supabase
      .from('ml_connections')
      .upsert(
        {
          user_id: user.id,
          status: 'prepared',
          account_name: 'Mercado Livre preparado',
          external_account_id: '',
          connected_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      )
      .select('*')
      .single<MlConnection>();

    setSaving(false);

    if (error) {
      setErrorMessage('Não foi possível preparar a integração com o Mercado Livre.');
      return;
    }

    setConnection(data);
    showSuccess('Mercado Livre preparado com sucesso.');
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
        connected_at: null,
      })
      .eq('id', connection.id)
      .select('*')
      .single<MlConnection>();

    setSaving(false);

    if (error) {
      setErrorMessage('Não foi possível desconectar o Mercado Livre.');
      return;
    }

    setConnection(data);
    showSuccess('Mercado Livre desconectado.');
  };

  const mercadoLivreReady =
    connection?.status === 'prepared' || connection?.status === 'connected';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-900 dark:text-white">
          Integrações
        </h1>

        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
          Prepare conexões com marketplaces, fornecedores e ferramentas externas.
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
          <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
            <div className="p-5">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                <div className="flex gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-7 h-7 text-yellow-700 dark:text-yellow-400" />
                  </div>

                  <div>
                    <h2 className="text-lg font-bold text-navy-900 dark:text-white">
                      Mercado Livre
                    </h2>

                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-2 max-w-2xl">
                      Prepare o fluxo do Mercado Livre para que o FORNEXA possa montar anúncios,
                      organizar produtos e futuramente publicar pela API oficial.
                    </p>

                    <div className="mt-4">
                      <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
                        Status
                      </p>

                      <div
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${
                          mercadoLivreReady
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            mercadoLivreReady ? 'bg-green-500' : 'bg-red-500'
                          }`}
                        />
                        {mercadoLivreReady ? 'Conectada' : 'Desconectada'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 shrink-0">
                  {mercadoLivreReady ? (
                    <>
                      <button
                        onClick={handlePrepareMercadoLivre}
                        disabled={saving}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-black hover:bg-gray-900 text-white text-sm font-medium transition-colors disabled:opacity-60"
                      >
                        <RefreshCw className="w-4 h-4" />
                        {saving ? 'Atualizando...' : 'Atualizar preparação'}
                      </button>

                      <button
                        onClick={handleDisconnectMercadoLivre}
                        disabled={saving}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors disabled:opacity-60"
                      >
                        Desconectar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handlePrepareMercadoLivre}
                      disabled={saving}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-black hover:bg-gray-900 text-white text-sm font-medium transition-colors disabled:opacity-60"
                    >
                      <Link2 className="w-4 h-4" />
                      {saving ? 'Preparando...' : 'Preparar Mercado Livre'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-navy-700 flex items-center justify-center">
                  <Store className="w-6 h-6 text-gray-600 dark:text-slate-400" />
                </div>

                <div>
                  <h3 className="text-navy-900 dark:text-white font-semibold">
                    Shopee
                  </h3>

                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    Integração futura para expansão em novos marketplaces.
                  </p>

                  <span className="inline-flex items-center mt-4 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                    Em breve
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-navy-700 flex items-center justify-center">
                  <Plug className="w-6 h-6 text-gray-600 dark:text-slate-400" />
                </div>

                <div>
                  <h3 className="text-navy-900 dark:text-white font-semibold">
                    ERP e estoque
                  </h3>

                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    Tiny, Bling e controle de estoque de fornecedores poderão entrar em uma próxima fase.
                  </p>

                  <span className="inline-flex items-center mt-4 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                    Em breve
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}