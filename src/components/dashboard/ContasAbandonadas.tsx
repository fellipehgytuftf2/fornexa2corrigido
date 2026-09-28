import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/** Quantas contas cada chamada apaga. O servidor recusa mais que isso. */
const POR_VEZ = 200;

/**
 * Contas que se cadastraram, nunca pagaram e nunca usaram nada.
 *
 * POR QUE A TELA EXISTE, EM VEZ DE UMA ROTINA SILENCIOSA
 *
 * Conta apagada não volta. Uma rotina que roda sozinha todo dia erra em
 * silêncio e só é descoberta quando alguém reclama que perdeu o acesso — e aí
 * já são semanas de contas apagadas.
 *
 * Aqui o número fica à vista, o critério fica escrito, e a exclusão só
 * acontece quando alguém manda. Quando a regra provar que acerta, virar
 * rotina é fácil; o contrário, não.
 */
export default function ContasAbandonadas() {
  const [dias, setDias] = useState(7);
  const [total, setTotal] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [apagando, setApagando] = useState(false);
  const [apagadas, setApagadas] = useState(0);
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState('');

  const contar = async () => {
    setCarregando(true);
    setErro('');

    const { data, error } = await supabase.rpc('admin_contas_abandonadas_total', {
      p_dias: dias,
    });

    setCarregando(false);

    if (error) {
      setErro(`Não foi possível contar: ${error.message}`);
      return;
    }

    setTotal(Number(data ?? 0));
  };

  useEffect(() => {
    contar();
    // Recontar a cada troca de dias é a única forma de o número bater com o
    // que o botão vai apagar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  const apagar = async () => {
    setApagando(true);
    setErro('');
    setApagadas(0);

    // Em lotes, porque são milhares: uma chamada só estouraria o tempo da
    // função no meio da fila, sem saber onde parou.
    for (;;) {
      const { data, error } = await supabase.functions.invoke<{
        apagadas?: number;
        restam?: number;
        falhas?: string[];
      }>('admin-apagar-contas-abandonadas', {
        body: { dias, limite: POR_VEZ, simular: false },
      });

      if (error) {
        setErro(`A exclusão parou: ${error.message}`);
        break;
      }

      const feitas = Number(data?.apagadas ?? 0);
      setApagadas((antes) => antes + feitas);

      if (data?.falhas?.length) {
        setErro(`Algumas contas não saíram: ${data.falhas.join(' · ')}`);
        break;
      }

      // Nada apagado nesta volta significa que não há mais, ou que todas
      // falharam — nos dois casos, insistir só repetiria o erro.
      if (feitas === 0 || Number(data?.restam ?? 0) === 0) break;
    }

    setApagando(false);
    setConfirmacao('');
    await contar();
  };

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-navy-900 dark:text-white flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-gold" aria-hidden="true" />
            Contas abandonadas
          </h2>

          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Cadastraram, nunca pagaram e nunca usaram nada do sistema.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="dias-abandono" className="text-sm text-gray-500 dark:text-slate-400">
            Há mais de
          </label>

          <input
            id="dias-abandono"
            type="number"
            min={1}
            value={dias}
            onChange={(evento) => setDias(Math.max(Number(evento.target.value) || 1, 1))}
            className="w-20 px-3 py-2 rounded-lg bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-sm text-navy-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
          />

          <span className="text-sm text-gray-500 dark:text-slate-400">dias</span>

          <button
            type="button"
            onClick={contar}
            disabled={carregando}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
            Conferir
          </button>
        </div>
      </div>

      {erro && <p className="text-sm text-red-600 dark:text-red-400 mt-3">{erro}</p>}

      <div className="flex items-baseline gap-3 mt-5">
        <p className="text-3xl font-bold text-navy-900 dark:text-white tabular-nums">
          {carregando && total === null ? '—' : total}
        </p>

        <p className="text-sm text-gray-500 dark:text-slate-400">
          contas seriam apagadas
        </p>
      </div>

      {/* O critério fica escrito ao lado do botão. Quem vai apagar milhares de
          contas precisa saber o que está de fora sem abrir o código. */}
      <div className="mt-4 rounded-xl bg-gray-50 dark:bg-navy-700/50 px-4 py-3">
        <p className="text-sm font-medium text-navy-900 dark:text-white">Nunca entram nesta lista</p>

        <ul className="text-sm text-gray-600 dark:text-slate-300 mt-1.5 space-y-1 list-disc pl-5 leading-relaxed">
          <li>quem pagou alguma vez, mesmo tendo pedido reembolso, cancelado ou sido bloqueado</li>
          <li>quem tem plano ativo</li>
          <li>fornecedores e afiliados</li>
          <li>quem conectou o Mercado Livre, publicou anúncio, teve pedido, abriu chamado ou falou com o suporte</li>
        </ul>
      </div>

      {apagando && (
        <p className="text-sm text-gray-600 dark:text-slate-300 mt-4 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Apagando... {apagadas} até agora.
        </p>
      )}

      {!apagando && apagadas > 0 && (
        <p className="text-sm text-green-600 dark:text-green-400 mt-4">
          {apagadas} conta(s) apagada(s).
        </p>
      )}

      {(total ?? 0) > 0 && !apagando && (
        <div className="mt-5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-4">
          <p className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2 leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            Isto não tem volta. A pessoa perde o acesso e precisa se cadastrar de
            novo. Fica registrado quem saiu, mas a conta não é restaurada.
          </p>

          <label
            htmlFor="confirmar-exclusao"
            className="block text-sm font-medium text-navy-900 dark:text-white mt-4 mb-2"
          >
            Para confirmar, digite APAGAR
          </label>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="confirmar-exclusao"
              value={confirmacao}
              onChange={(evento) => setConfirmacao(evento.target.value)}
              placeholder="APAGAR"
              className="flex-1 px-4 py-2.5 rounded-lg bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-600 text-sm text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
            />

            <button
              type="button"
              onClick={apagar}
              disabled={confirmacao.trim().toUpperCase() !== 'APAGAR'}
              className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50 shrink-0"
            >
              Apagar {total} conta(s)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
