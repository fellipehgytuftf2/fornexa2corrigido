import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Share2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Afiliado {
  afiliado: string;
  vendas: number;
  faturamento: number;
  clientes_com_conta: number;
  clientes_ativos: number;
  clientes_perdidos: number;
  usando_ainda: number;
  primeira_venda: string | null;
  ultima_venda: string | null;
}

interface ClienteDoAfiliado {
  email: string | null;
  nome: string | null;
  plano: string | null;
  plan_status: string | null;
  valor: number | null;
  comprou_em: string | null;
  ultimo_acesso: string | null;
}

/**
 * Desempenho de quem indica.
 *
 * A Applyfy já mostra quantas vendas cada afiliado fez e paga a comissão. O
 * que ela não sabe é o que acontece depois: se o indicado ficou usando o
 * sistema ou sumiu. Esse dado só existe aqui, e é ele que separa afiliado que
 * traz cliente de afiliado que traz reembolso.
 */
export default function AfiliadosAdmin() {
  const [afiliados, setAfiliados] = useState<Afiliado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [detalhe, setDetalhe] = useState<Afiliado | null>(null);
  const [clientes, setClientes] = useState<ClienteDoAfiliado[]>([]);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  useEffect(() => {
    const carregar = async () => {
      setCarregando(true);

      const { data, error } = await supabase.rpc('admin_afiliados');

      if (error) {
        setErro(`Não foi possível carregar os afiliados: ${error.message}`);
      } else {
        setAfiliados((data as Afiliado[]) || []);
      }

      setCarregando(false);
    };

    carregar();
  }, []);

  const abrirDetalhe = async (afiliado: Afiliado) => {
    setDetalhe(afiliado);
    setClientes([]);
    setCarregandoDetalhe(true);

    const { data, error } = await supabase.rpc('admin_clientes_do_afiliado', {
      p_afiliado: afiliado.afiliado,
    });

    setCarregandoDetalhe(false);

    if (!error) {
      setClientes((data as ClienteDoAfiliado[]) || []);
    }
  };

  const formatarValor = (valor: number | null) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      Number(valor || 0)
    );

  const formatarData = (valor: string | null) => {
    if (!valor) return 'nunca';

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
        <Share2 className="w-5 h-5 text-gray-600 dark:text-slate-400" />

        <h2 className="text-lg font-semibold text-navy-900 dark:text-white">
          Afiliados
        </h2>
      </div>

      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
        Quem indicou cada venda, e o que aconteceu com o cliente depois. A
        comissão continua sendo calculada e paga pela Applyfy.
      </p>

      {erro && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 mb-5">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{erro}</p>
        </div>
      )}

      {carregando ? (
        <div className="flex items-center gap-3 text-gray-500 dark:text-slate-400 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Carregando...
        </div>
      ) : afiliados.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 dark:border-navy-600 px-4 py-8 text-center">
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Nenhuma venda por afiliado ainda.
          </p>

          <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
            Ative o programa no painel da Applyfy e distribua o link de
            afiliação. A partir da primeira venda indicada, ela aparece aqui
            sozinha.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-navy-600">
                <th className="pb-3 pr-4 font-medium">Afiliado</th>
                <th className="pb-3 pr-4 font-medium">Vendas</th>
                <th className="pb-3 pr-4 font-medium">Faturamento</th>
                <th className="pb-3 pr-4 font-medium">Ativos</th>
                <th className="pb-3 pr-4 font-medium">Perdidos</th>
                <th className="pb-3 pr-4 font-medium">Usando ainda</th>
                <th className="pb-3 font-medium">Última venda</th>
              </tr>
            </thead>

            <tbody>
              {afiliados.map((item) => (
                <tr
                  key={item.afiliado}
                  onClick={() => abrirDetalhe(item)}
                  className="border-b border-gray-100 dark:border-navy-700 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-navy-700/50"
                >
                  <td className="py-3 pr-4 font-mono text-navy-900 dark:text-white">
                    {item.afiliado}
                  </td>

                  <td className="py-3 pr-4 text-navy-900 dark:text-white font-medium">
                    {item.vendas}
                  </td>

                  <td className="py-3 pr-4 text-navy-900 dark:text-white whitespace-nowrap">
                    {formatarValor(item.faturamento)}
                  </td>

                  <td className="py-3 pr-4 text-green-600 dark:text-green-400 font-medium">
                    {item.clientes_ativos}
                  </td>

                  <td
                    className={`py-3 pr-4 font-medium ${
                      item.clientes_perdidos > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-gray-500 dark:text-slate-400'
                    }`}
                  >
                    {item.clientes_perdidos}
                  </td>

                  {/* A coluna que decide se a indicação valeu. */}
                  <td className="py-3 pr-4 text-navy-900 dark:text-white">
                    {item.usando_ainda} de {item.vendas}
                  </td>

                  <td className="py-3 text-gray-600 dark:text-slate-300 whitespace-nowrap">
                    {formatarData(item.ultima_venda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalhe && (
        <div className="fixed inset-0 bg-black/50 z-[100] overflow-y-auto flex min-h-full items-center justify-center p-4">
          <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 w-full max-w-lg">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold text-navy-900 dark:text-white font-mono">
                  {detalhe.afiliado}
                </h3>

                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                  {detalhe.vendas} venda(s) · {formatarValor(detalhe.faturamento)} ·
                  primeira em {formatarData(detalhe.primeira_venda)}
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

            {carregandoDetalhe ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando...
              </div>
            ) : (
              <ul className="space-y-2">
                {clientes.map((cliente, indice) => (
                  <li
                    key={`${cliente.email}-${indice}`}
                    className="rounded-lg border border-gray-200 dark:border-navy-600 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-navy-900 dark:text-white">
                        {cliente.nome || cliente.email}
                      </span>

                      <span className="text-sm font-medium text-navy-900 dark:text-white">
                        {formatarValor(cliente.valor)}
                      </span>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      {cliente.plan_status === 'ativo'
                        ? 'ativo'
                        : cliente.plan_status || 'sem conta ainda'}
                      {' · comprou '}
                      {formatarData(cliente.comprou_em)}
                      {' · último acesso '}
                      {formatarData(cliente.ultimo_acesso)}
                    </p>
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
