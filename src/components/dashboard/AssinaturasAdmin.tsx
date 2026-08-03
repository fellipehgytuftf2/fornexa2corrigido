import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, Search, ShieldCheck, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Conta {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  plan: string | null;
  plan_status: string | null;
  plan_expira_em: string | null;
  plan_origem: string | null;
  plan_atualizado_em: string | null;
}

const rotulosDeStatus: Record<string, { texto: string; cor: string }> = {
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
 * Controle manual de assinatura.
 *
 * Existe para o dia em que o webhook falhar, o comprador digitar outro e-mail
 * no checkout, ou alguém precisar de acesso sem passar pela plataforma. Sem
 * isto, a única saída seria abrir o banco e editar linha na mão — que é como
 * se estraga dado em produção.
 */
export default function AssinaturasAdmin() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const [editando, setEditando] = useState<Conta | null>(null);
  const [novoPlano, setNovoPlano] = useState('premium');
  const [novoStatus, setNovoStatus] = useState('ativo');
  const [dias, setDias] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = async (termo = '') => {
    setCarregando(true);
    setErro('');

    const { data, error } = await supabase.rpc('admin_lista_contas', {
      p_busca: termo || null,
    });

    if (error) {
      setErro(`Não foi possível carregar as contas: ${error.message}`);
      setContas([]);
    } else {
      setContas((data as Conta[]) || []);
    }

    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const abrirEdicao = (conta: Conta) => {
    setEditando(conta);
    setNovoPlano(conta.plan || 'premium');
    setNovoStatus(conta.plan_status || 'ativo');

    // Campo vazio quer dizer "não expira". Preencher com a data atual induziria
    // o admin a criar validade onde não existia.
    setDias('');
  };

  const salvar = async () => {
    if (!editando) {
      return;
    }

    setSalvando(true);
    setErro('');

    const { error } = await supabase.rpc('admin_define_plano', {
      p_user_id: editando.id,
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
    await carregar(busca);
  };

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm mt-8">
      <div className="flex items-center gap-3 mb-1">
        <ShieldCheck className="w-5 h-5 text-gray-600 dark:text-slate-400" />

        <h2 className="text-lg font-semibold text-navy-900 dark:text-white">
          Assinaturas
        </h2>
      </div>

      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
        Quem está pagando, quem venceu e quem entrou de cortesia. Use o ajuste
        manual quando o pagamento não cair sozinho.
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

      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          carregar(busca);
        }}
        className="flex gap-2 mb-6"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />

          <input
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar por e-mail ou nome"
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-700 text-navy-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
          />
        </div>

        <button
          type="submit"
          className="px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-navy-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Buscar
        </button>
      </form>

      {carregando ? (
        <div className="flex items-center gap-3 text-gray-500 dark:text-slate-400 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Carregando contas...
        </div>
      ) : contas.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400 py-8 text-center">
          Nenhuma conta encontrada.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-navy-600">
                <th className="pb-3 pr-4 font-medium">Conta</th>
                <th className="pb-3 pr-4 font-medium">Plano</th>
                <th className="pb-3 pr-4 font-medium">Situação</th>
                <th className="pb-3 pr-4 font-medium">Validade</th>
                <th className="pb-3 font-medium">Origem</th>
                <th className="pb-3" />
              </tr>
            </thead>

            <tbody>
              {contas.map((conta) => {
                const selo =
                  rotulosDeStatus[conta.plan_status || 'inativo'] ||
                  rotulosDeStatus.inativo;

                return (
                  <tr
                    key={conta.id}
                    className="border-b border-gray-100 dark:border-navy-700 last:border-0"
                  >
                    <td className="py-3 pr-4">
                      <p className="text-navy-900 dark:text-white font-medium">
                        {conta.name || '—'}
                      </p>

                      <p className="text-gray-500 dark:text-slate-400 text-xs">
                        {conta.email}
                        {conta.role === 'admin' && ' · admin'}
                      </p>
                    </td>

                    <td className="py-3 pr-4 text-navy-900 dark:text-white">
                      {conta.plan || '—'}
                    </td>

                    <td className="py-3 pr-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${selo.cor}`}
                      >
                        {selo.texto}
                      </span>
                    </td>

                    <td className="py-3 pr-4 text-gray-500 dark:text-slate-400">
                      {conta.plan_expira_em
                        ? new Date(conta.plan_expira_em).toLocaleDateString('pt-BR')
                        : 'não expira'}
                    </td>

                    <td className="py-3 text-gray-500 dark:text-slate-400">
                      {conta.plan_origem || '—'}
                    </td>

                    <td className="py-3 text-right">
                      <button
                        onClick={() => abrirEdicao(conta)}
                        className="text-xs font-semibold text-navy-900 dark:text-white underline underline-offset-2 hover:opacity-70"
                      >
                        Ajustar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 w-full max-w-md">
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
                onClick={salvar}
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
      )}
    </div>
  );
}
