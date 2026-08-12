import { useEffect, useState } from 'react';
import { AlertCircle, KeyRound, Link2, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

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

const corDoTipo: Record<string, string> = {
  Administrador: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  Vendedor: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  Fornecedor: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
};

/**
 * Quem é cada conta e até onde ela alcança.
 *
 * O que decide acesso mora em cinco lugares do banco. Reunir aqui é o que
 * permite responder de relance perguntas que antes exigiam consulta na mão:
 * quem paga e nunca entrou, quem virou admin sem que ninguém lembre, e quais
 * fornecedores cada vendedor já consegue enxergar.
 *
 * Só lê. Alterar plano continua sendo na seção Assinaturas.
 */
export default function AcessosAdmin() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [detalhe, setDetalhe] = useState<Conta | null>(null);
  const [fornecedores, setFornecedores] = useState<FornecedorDaConta[]>([]);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

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

  const abrirDetalhe = async (conta: Conta) => {
    setDetalhe(conta);
    setFornecedores([]);
    setCarregandoDetalhe(true);

    const { data, error } = await supabase.rpc('admin_fornecedores_da_conta', {
      p_user_id: conta.user_id,
    });

    setCarregandoDetalhe(false);

    if (!error) {
      setFornecedores((data as FornecedorDaConta[]) || []);
    }
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

  // Conta que paga e nunca entrou é dinheiro que vai virar reembolso.
  const pagamNaoUsam = contas.filter(
    (conta) => conta.entra_no_painel && conta.tipo === 'Vendedor' && !conta.ultimo_acesso
  );

  const administradores = contas.filter((conta) => conta.tipo === 'Administrador');

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm mt-8">
      <div className="flex items-center gap-3 mb-1">
        <KeyRound className="w-5 h-5 text-gray-600 dark:text-slate-400" />

        <h2 className="text-lg font-semibold text-navy-900 dark:text-white">
          Acessos
        </h2>
      </div>

      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
        Quem é cada conta e até onde ela alcança. Clique numa linha para ver
        quais fornecedores ela já enxerga.
      </p>

      {erro && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 mb-5">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{erro}</p>
        </div>
      )}

      {/* Dois alertas que valem mais que a tabela inteira. */}
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

      {carregando ? (
        <div className="flex items-center gap-3 text-gray-500 dark:text-slate-400 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Carregando...
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
                <th className="pb-3 pr-4 font-medium">Tipo</th>
                <th className="pb-3 pr-4 font-medium">Entra?</th>
                <th className="pb-3 pr-4 font-medium">ML</th>
                <th className="pb-3 pr-4 font-medium">Fornecedores</th>
                <th className="pb-3 pr-4 font-medium">Pedidos</th>
                <th className="pb-3 font-medium">Último acesso</th>
              </tr>
            </thead>

            <tbody>
              {contas.map((conta) => (
                <tr
                  key={conta.user_id}
                  onClick={() => abrirDetalhe(conta)}
                  className="border-b border-gray-100 dark:border-navy-700 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-navy-700/50"
                >
                  <td className="py-3 pr-4">
                    <p className="text-navy-900 dark:text-white font-medium">
                      {conta.nome}
                    </p>

                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {conta.email}
                    </p>
                  </td>

                  <td className="py-3 pr-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                        corDoTipo[conta.tipo] || corDoTipo.Vendedor
                      }`}
                    >
                      {conta.tipo}
                    </span>
                  </td>

                  <td className="py-3 pr-4">
                    {conta.tipo === 'Fornecedor' ? (
                      <span className="text-gray-500 dark:text-slate-400 text-xs">
                        portal
                      </span>
                    ) : conta.entra_no_painel ? (
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        sim
                      </span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        não
                      </span>
                    )}
                  </td>

                  <td className="py-3 pr-4">
                    {conta.ml_conectado ? (
                      <Link2 className="w-4 h-4 text-green-600 dark:text-green-400" />
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

                  <td className="py-3 text-gray-600 dark:text-slate-300 whitespace-nowrap">
                    {formatarData(conta.ultimo_acesso)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalhe && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
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
                  valor: `${detalhe.plano || '—'} (${detalhe.plan_status || '—'})`,
                },
                { rotulo: 'Produtos preparados', valor: String(detalhe.total_produtos) },
                { rotulo: 'Pedidos', valor: String(detalhe.total_pedidos) },
                {
                  rotulo: 'Mercado Livre',
                  valor: detalhe.ml_conectado ? 'conectado' : 'não conectado',
                },
                { rotulo: 'Conta criada em', valor: formatarData(detalhe.criado_em) },
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
            ) : fornecedores.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-slate-400 py-3">
                Nenhum. Esta conta nunca teve pedido com fornecedor algum.
              </p>
            ) : (
              <ul className="space-y-2">
                {fornecedores.map((item) => (
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
      )}
    </div>
  );
}
