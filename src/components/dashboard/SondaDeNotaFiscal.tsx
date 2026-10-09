import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Tentativa {
  caminho: string;
  http: number;
  resposta: unknown;
}

interface VendedorPj {
  email: string | null;
  nome: string | null;
  conta_ml: string | null;
  documento: string | null;
}

interface Varredura {
  ok?: boolean;
  conclusao?: string;
  olhados?: number;
  total_ativos?: number;
  pj?: VendedorPj[];
  pf?: number;
  nao_lidos?: { user_id: string; motivo: string }[];
  error?: string;
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

  /**
   * Quantos vendedores são PJ de verdade.
   *
   * O nome da loja não diz nada sobre CNPJ — "KNSTORE" e "AK STORE" podem ser
   * pessoa física. Sem esse número, decidir se vale pedir reconexão a 400
   * pessoas seria chute.
   */
  const [varrendo, setVarrendo] = useState(false);
  const [varredura, setVarredura] = useState<Varredura | null>(null);

  const varrer = async () => {
    setVarrendo(true);
    setVarredura(null);

    const { data, error } = await supabase.functions.invoke('admin-varrer-pj', {
      body: {},
    });

    setVarrendo(false);

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

      setVarredura({ error: motivo ?? 'Não foi possível varrer agora. Tente de novo.' });
      return;
    }

    setVarredura(data as Varredura);
  };

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

      {/* A outra metade da decisão.
          Saber que a nota é alcançável não basta: o custo é pedir reconexão a
          cada vendedor, e isso só compensa se houver PJ suficiente para
          justificar. O nome da loja não responde isso — o CNPJ responde. */}
      <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-700">
        <p className="text-sm font-medium text-slate-900 dark:text-white">
          Quantos vendedores são PJ?
        </p>

        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Pergunta ao Mercado Livre o documento de cada conta que vendeu nos últimos 60
          dias. É o número que decide se vale pedir reconexão a todo mundo.
        </p>

        <button
          onClick={varrer}
          disabled={varrendo}
          className="mt-3 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-900 dark:text-white disabled:opacity-50 flex items-center gap-2"
        >
          {varrendo && <Loader2 className="w-4 h-4 animate-spin" />}
          {varrendo ? 'Contando…' : 'Contar vendedores PJ'}
        </button>

        {varredura && (
          <div className="mt-3 space-y-3">
            {varredura.error ? (
              <p className="text-sm text-red-600 dark:text-red-400">{varredura.error}</p>
            ) : (
              <>
                <div className="text-sm rounded-lg p-3 bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                  {varredura.conclusao}
                </div>

                {(varredura.pj?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
                    {varredura.pj?.map((vendedor) => (
                      <div
                        key={vendedor.email ?? vendedor.conta_ml ?? Math.random()}
                        className="flex items-center justify-between gap-3 p-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="text-slate-900 dark:text-white truncate">
                            {vendedor.nome ?? '—'}
                          </p>

                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {vendedor.email} · {vendedor.conta_ml}
                          </p>
                        </div>

                        <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                          {vendedor.documento ?? 'CNPJ'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
