import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Tentativa {
  caminho: string;
  http: number;
  resposta: unknown;
}

interface Resultado {
  ok?: boolean;
  venda?: string;
  envio?: string | null;
  produto?: string | null;
  conclusao?: string;
  tentativas?: Tentativa[];
  error?: string;
}

/**
 * Dá para buscar a NF-e de um vendedor PJ pelo Mercado Livre?
 *
 * Pessoa física emite DC-e, e o FORNEXA já entrega o DACE ao fornecedor junto
 * da etiqueta. PJ emite NF-e, e disso o sistema não sabe nada — a caixa sai do
 * galpão sem documento fiscal, ou o vendedor manda por fora.
 *
 * A documentação do Mercado Livre para nota é ruim, como era a da DC-e. Esta
 * tela faz o que funcionou lá: pergunta a todos os endereços plausíveis com um
 * pedido real e mostra a resposta crua de cada um.
 */
export default function SondaDeNotaFiscal() {
  const [venda, setVenda] = useState('');
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const sondar = async () => {
    if (!venda.trim()) return;

    setRodando(true);
    setResultado(null);

    const { data, error } = await supabase.functions.invoke('admin-sondar-nota-fiscal', {
      body: { venda: venda.trim() },
    });

    setRodando(false);

    if (error) {
      let motivo: string | undefined;

      const contexto = (
        error as { context?: { json?: () => Promise<{ error?: string }> } } | null
      )?.context;

      if (contexto?.json) {
        try {
          motivo = (await contexto.json())?.error;
        } catch {
          // segue com a mensagem genérica
        }
      }

      setResultado({ error: motivo ?? 'Não foi possível sondar agora. Tente de novo.' });
      return;
    }

    setResultado(data as Resultado);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-start gap-3">
        <FileText className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />

        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">
            Nota fiscal de vendedor PJ
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Pergunta ao Mercado Livre, por vários caminhos, se a NF-e de uma venda pode ser
            baixada. Serve para decidir se dá para entregar a nota ao fornecedor junto da
            etiqueta, como já fazemos com o DACE.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <input
          value={venda}
          onChange={(e) => setVenda(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sondar();
          }}
          placeholder="Número da venda de um vendedor PJ"
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

                <div>
                  <p>{resultado.conclusao}</p>

                  <p className="text-xs opacity-80 mt-1">
                    Venda {resultado.venda}
                    {resultado.envio ? ` · envio ${resultado.envio}` : ''}
                    {resultado.produto ? ` · ${resultado.produto}` : ''}
                  </p>
                </div>
              </div>

              {/* O corpo cru é o que decide: 404 de rota que não existe é
                  genérico; 404 com campo de domínio é a rota existindo e
                  dizendo que esta venda não tem nota. */}
              {resultado.tentativas?.map((t) => (
                <details
                  key={t.caminho}
                  className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 p-3"
                >
                  <summary
                    className={`cursor-pointer ${
                      t.http === 200
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <span className="font-mono">{t.caminho}</span> — HTTP {t.http}
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
