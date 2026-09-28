import { useEffect, useState } from 'react';
import { BarChart3, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Faixa {
  ordem: number;
  faixa: string;
  vendedores: number;
}

interface Estatisticas {
  vendedores_com_venda: number;
  contas: number;
  faturamento_medio: number;
  faturamento_mediano: number;
  dias_ate_a_primeira_venda: number;
  faixas: Faixa[] | null;
}

const dinheiro = (valor: number) =>
  `R$ ${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

/**
 * O que o ranking não conta: como a base inteira está vendendo.
 *
 * POR QUE MÉDIA E MEDIANA JUNTAS
 *
 * Um vendedor de R$ 40.000 puxa a média para cima e faz parecer que todo mundo
 * vende bem. A mediana mostra o meio da fila, que é onde a maioria está. As
 * duas lado a lado contam a história inteira — separadas, cada uma mente de um
 * jeito.
 */
export default function EstatisticasDeVendas() {
  const [dados, setDados] = useState<Estatisticas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = async () => {
    setCarregando(true);
    setErro('');

    const { data, error } = await supabase.rpc('admin_estatisticas_de_vendas');

    setCarregando(false);

    if (error) {
      setErro(`Não foi possível carregar: ${error.message}`);
      return;
    }

    setDados(data as Estatisticas);
  };

  useEffect(() => {
    carregar();
  }, []);

  const semVenda = dados ? Math.max(dados.contas - dados.vendedores_com_venda, 0) : 0;

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-navy-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-gold" aria-hidden="true" />
            Como a base está vendendo
          </h2>

          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Só vendas confirmadas e não estornadas. Não aparece para os vendedores.
          </p>
        </div>

        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {erro && <p className="text-sm text-red-600 dark:text-red-400 mt-3">{erro}</p>}

      {carregando && !dados ? (
        <div className="py-8 text-center">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin mx-auto" />
        </div>
      ) : dados ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
            {[
              { rotulo: 'Já venderam', valor: String(dados.vendedores_com_venda) },
              { rotulo: 'Nunca venderam', valor: String(semVenda) },
              { rotulo: 'Faturamento médio', valor: dinheiro(dados.faturamento_medio) },
              { rotulo: 'Mediana', valor: dinheiro(dados.faturamento_mediano) },
            ].map((item) => (
              <div key={item.rotulo} className="bg-gray-50 dark:bg-navy-700 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-500 dark:text-slate-400">{item.rotulo}</p>

                <p className="text-lg font-bold text-navy-900 dark:text-white tabular-nums mt-0.5">
                  {item.valor}
                </p>
              </div>
            ))}
          </div>

          <p className="text-sm text-gray-600 dark:text-slate-300 mt-4">
            Da criação da conta até a primeira venda:{' '}
            <strong className="tabular-nums">{dados.dias_ate_a_primeira_venda} dias</strong> em
            média.
          </p>

          {dados.faixas && dados.faixas.length > 0 && (
            <ul className="mt-5 space-y-2">
              {dados.faixas.map((faixa) => {
                const maior = Math.max(
                  ...(dados.faixas ?? []).map((item) => Number(item.vendedores || 0)),
                  1
                );

                const largura = Math.round((Number(faixa.vendedores || 0) / maior) * 100);

                return (
                  <li key={faixa.ordem}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-gray-600 dark:text-slate-300">
                        {faixa.faixa}
                      </span>

                      <span className="text-sm font-semibold text-navy-900 dark:text-white tabular-nums">
                        {faixa.vendedores}
                      </span>
                    </div>

                    <div className="h-2 rounded-full bg-gray-100 dark:bg-navy-700 mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gold"
                        style={{ width: `${largura}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
