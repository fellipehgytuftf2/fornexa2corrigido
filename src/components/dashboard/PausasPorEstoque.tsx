import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, PauseCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ContaDesconectada {
  user_id: string;
  nome: string | null;
  email: string | null;
  empresa: string | null;
  anuncios: number;
}

interface Painel {
  pausados: number;
  no_ar_sem_estoque: number;
  em_revisao: number;
  conta_desconectada: number;
  outras_falhas: number;
  ultima_rodada: Record<string, unknown> | null;
  contas: ContaDesconectada[];
}

/** A data da linha do log, seja qual for o nome da coluna. */
function quandoFoi(rodada: Record<string, unknown> | null): string | null {
  const bruto = rodada?.created_at ?? rodada?.criado_em;

  if (typeof bruto !== 'string') return null;

  return new Date(bruto).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Anúncios que o FORNEXA pausou por falta de estoque, e os que não conseguiu.
 *
 * POR QUE EXISTE
 *
 * A pausa roda sozinha a cada 10 minutos, e antes disto só se enxergava por
 * SQL. O número que importa é "no ar sem estoque": anúncio que pode vender o
 * que não existe agora. A lista embaixo diz de quem é a culpa quando esse
 * número não cai — conta desconectada, que só o vendedor resolve.
 */
export default function PausasPorEstoque() {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = async () => {
    setCarregando(true);
    setErro('');

    const { data, error } = await supabase.rpc('admin_pausas_por_estoque');

    setCarregando(false);

    if (error) {
      setErro(`Não foi possível carregar: ${error.message}`);
      return;
    }

    setPainel(data as Painel);
  };

  useEffect(() => {
    carregar();
  }, []);

  const rodada = painel?.ultima_rodada ?? null;
  const quando = quandoFoi(rodada);

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-navy-900 dark:text-white flex items-center gap-2">
            <PauseCircle className="w-5 h-5 text-gold" aria-hidden="true" />
            Pausas por falta de estoque
          </h2>

          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Roda sozinho a cada 10 minutos. Pausa no Mercado Livre o que o
            fornecedor não tem, e reativa quando ele repõe.
          </p>
        </div>

        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {erro && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-3 leading-relaxed">{erro}</p>
      )}

      {carregando && !painel ? (
        <div className="py-8 text-center">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin mx-auto" />
        </div>
      ) : painel ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
            {[
              {
                rotulo: 'Pausados',
                valor: painel.pausados,
                cor: 'text-green-600 dark:text-green-400',
              },
              {
                rotulo: 'No ar sem estoque',
                valor: painel.no_ar_sem_estoque,
                cor:
                  painel.no_ar_sem_estoque > 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-500 dark:text-slate-400',
              },
              {
                rotulo: 'Em revisão no ML',
                valor: painel.em_revisao,
                cor: 'text-gray-500 dark:text-slate-400',
              },
              {
                rotulo: 'Conta desconectada',
                valor: painel.conta_desconectada,
                cor:
                  painel.conta_desconectada > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-gray-500 dark:text-slate-400',
              },
            ].map((item) => (
              <div key={item.rotulo} className="bg-gray-50 dark:bg-navy-700 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-500 dark:text-slate-400">{item.rotulo}</p>

                <p className={`text-xl font-bold tabular-nums mt-0.5 ${item.cor}`}>
                  {item.valor}
                </p>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-500 dark:text-slate-400 mt-3 leading-relaxed">
            {rodada
              ? `Última rodada${quando ? ` (${quando})` : ''}: ${String(rodada.mensagem ?? '')}`
              : 'Nenhuma rodada com movimento ainda.'}
            {painel.outras_falhas > 0 &&
              ` · ${painel.outras_falhas} com outro erro do Mercado Livre.`}
          </p>

          {/* "No ar sem estoque" inclui a fila da próxima rodada: logo depois
              de um produto zerar, o número sobe e cai sozinho. O que não cai
              é a lista abaixo. */}
          {painel.contas.length > 0 && (
            <>
              <p className="text-sm font-medium text-navy-900 dark:text-white mt-5">
                Precisam reconectar o Mercado Livre
              </p>

              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Sem a conexão, o FORNEXA não consegue pausar. Estes anúncios
                continuam vendendo o que o fornecedor não tem.
              </p>

              <ul className="mt-3 space-y-2">
                {painel.contas.map((conta) => (
                  <li
                    key={conta.user_id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-navy-900 dark:text-white truncate">
                        {conta.empresa || conta.nome}
                      </p>

                      <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                        {conta.email}
                      </p>
                    </div>

                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 tabular-nums">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {conta.anuncios} anúncio(s) no ar
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
