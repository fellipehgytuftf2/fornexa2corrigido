import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldQuestion } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Tentativa = {
  caminho: string;
  http: number;
  resposta: unknown;
  reclamacoes_encontradas: number | null;
};

type Resultado = {
  ok?: boolean;
  veredito?: string;
  tentativas?: Tentativa[];
  reclamacao_testada?: string | null;
  pedido_da_reclamacao?: string | null;
  error?: string;
};

/**
 * Pergunta ao Mercado Livre se a aplicação pode ler reclamações.
 *
 * A devolução que o comprador abre depois de receber chega por um canal que
 * quase nunca dispara — só quando alguém reclama. Descobrir ali que a permissão
 * estava errada é descobrir tarde, com a mediação correndo. Aqui a pergunta é
 * feita em dia calmo, sem esperar reclamação nenhuma.
 */
export default function SondaDeReclamacoes() {
  const [email, setEmail] = useState('');
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const sondar = async () => {
    setRodando(true);
    setResultado(null);

    const { data, error } = await supabase.functions.invoke('admin-sondar-reclamacoes', {
      body: email.trim() ? { email: email.trim() } : {},
    });

    setRodando(false);

    if (error) {
      setResultado({ error: 'Não deu para sondar agora. Tente de novo.' });
      return;
    }

    setResultado(data as Resultado);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-start gap-3">
        <ShieldQuestion className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">
            Reclamações do Mercado Livre
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Confere se a aplicação consegue ler reclamações de compradores. É o que faz a devolução
            de arrependimento, defeito ou produto errado abrir sozinha.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail do vendedor (vazio = sua conta)"
          className="flex-1 min-w-[260px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
        />
        <button
          onClick={sondar}
          disabled={rodando}
          className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {rodando && <Loader2 className="w-4 h-4 animate-spin" />}
          {rodando ? 'Perguntando…' : 'Sondar'}
        </button>
      </div>

      {resultado && (
        <div className="mt-4 space-y-3">
          {resultado.error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{resultado.error}</p>
          ) : (
            <>
              <div
                className={`flex items-start gap-2 text-sm rounded-lg p-3 ${
                  resultado.ok
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200'
                    : 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200'
                }`}
              >
                {resultado.ok ? (
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                )}
                <span>{resultado.veredito}</span>
              </div>

              {resultado.reclamacao_testada && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Reclamação usada no teste: {resultado.reclamacao_testada}
                  {resultado.pedido_da_reclamacao && ` (venda ${resultado.pedido_da_reclamacao})`}
                </p>
              )}

              {/* O detalhe cru fica à vista de propósito: quando o Mercado
                  Livre recusa, o motivo vem escrito na resposta dele, e é por
                  ele que se descobre qual permissão marcar. */}
              {resultado.tentativas?.map((t) => (
                <details
                  key={t.caminho}
                  className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 p-3"
                >
                  <summary className="cursor-pointer text-slate-600 dark:text-slate-300">
                    <span className="font-mono">{t.caminho}</span> — HTTP {t.http}
                    {t.reclamacoes_encontradas !== null &&
                      ` · ${t.reclamacoes_encontradas} reclamação(ões)`}
                  </summary>
                  <pre className="mt-2 overflow-auto max-h-64 text-slate-500 dark:text-slate-400">
                    {JSON.stringify(t.resposta, null, 2)}
                  </pre>
                </details>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
