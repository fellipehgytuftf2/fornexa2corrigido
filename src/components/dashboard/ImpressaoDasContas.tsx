import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, Printer, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Conta {
  user_id: string;
  nome: string | null;
  email: string | null;
  empresa: string | null;
  termica: boolean | null;
  vista_em: string | null;
}

/**
 * Quem já trocou a impressão para térmica, e quem ainda não.
 *
 * POR QUE ISTO EXISTE AO LADO DOS AVISOS
 *
 * O aviso diz quantos leram. Ler não é resolver: a pessoa fecha a janela, se
 * distrai, e o fornecedor continua cortando folha com tesoura em toda venda
 * dela. Sem esta lista, a cobrança volta a ser repetir o recado para todos —
 * inclusive para quem já fez, que é como se perde a atenção de quem atende.
 *
 * A conferência é uma chamada ao Mercado Livre por vendedor, então é botão e
 * não rotina: roda quando alguém quer saber.
 */
export default function ImpressaoDasContas() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [conferindo, setConferindo] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = async () => {
    const { data, error } = await supabase.rpc('admin_impressao_das_contas');

    setCarregando(false);

    if (error) {
      setErro(`Não foi possível carregar: ${error.message}`);
      return;
    }

    setContas((data as Conta[]) || []);
  };

  useEffect(() => {
    carregar();
  }, []);

  const conferir = async () => {
    setConferindo(true);
    setErro('');

    const { error } = await supabase.functions.invoke('admin-conferir-impressao');

    setConferindo(false);

    if (error) {
      setErro(`Não foi possível conferir: ${error.message}`);
      return;
    }

    await carregar();
  };

  const emA4 = contas.filter((conta) => conta.termica === false);
  const emTermica = contas.filter((conta) => conta.termica === true);
  const semLeitura = contas.filter((conta) => conta.termica === null);

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-navy-900 dark:text-white flex items-center gap-2">
            <Printer className="w-5 h-5 text-gold" aria-hidden="true" />
            Impressão da etiqueta
          </h2>

          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Quem já trocou para térmica. Em A4, o fornecedor corta com tesoura em
            toda venda.
          </p>
        </div>

        <button
          type="button"
          onClick={conferir}
          disabled={conferindo}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${conferindo ? 'animate-spin' : ''}`} />
          {conferindo ? 'Conferindo...' : 'Conferir agora'}
        </button>
      </div>

      {erro && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-3 leading-relaxed">{erro}</p>
      )}

      {carregando ? (
        <div className="py-8 text-center">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin mx-auto" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { rotulo: 'Em A4', valor: emA4.length, cor: 'text-amber-600 dark:text-amber-400' },
              {
                rotulo: 'Em térmica',
                valor: emTermica.length,
                cor: 'text-green-600 dark:text-green-400',
              },
              {
                rotulo: 'Sem leitura',
                valor: semLeitura.length,
                cor: 'text-gray-500 dark:text-slate-400',
              },
            ].map((item) => (
              <div
                key={item.rotulo}
                className="bg-gray-50 dark:bg-navy-700 rounded-lg px-4 py-3"
              >
                <p className="text-xs text-gray-500 dark:text-slate-400">{item.rotulo}</p>

                <p className={`text-xl font-bold tabular-nums mt-0.5 ${item.cor}`}>
                  {item.valor}
                </p>
              </div>
            ))}
          </div>

          {/* Só quem falta. Listar os resolvidos ocuparia a tela com o que já
              não pede nada — e é justamente por isso que a lista existe. */}
          <ul className="mt-5 space-y-2">
            {emA4.length === 0 && (
              <li className="text-sm text-gray-500 dark:text-slate-400">
                {contas.length === 0
                  ? 'Nenhuma conta conectada ainda.'
                  : 'Ninguém em A4 entre os conferidos.'}
              </li>
            )}

            {emA4.map((conta) => (
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

                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Em A4
                </span>
              </li>
            ))}
          </ul>

          {emTermica.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-4 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
              {emTermica.length} já resolveram e não aparecem na lista.
            </p>
          )}

          {semLeitura.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
              {semLeitura.length} ainda não foram conferidos. Cada "Conferir
              agora" lê até 40 contas, começando pelas mais antigas — rode de
              novo para continuar.
            </p>
          )}
        </>
      )}
    </div>
  );
}
