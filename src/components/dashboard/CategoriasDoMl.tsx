import { useState } from 'react';
import { Loader2, Tags } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Aprendida {
  categoria: string;
  ml_category_id: string;
  anuncios: number;
}

interface Resultado {
  ok?: boolean;
  aprendidas?: Aprendida[];
  sem_resposta?: string[];
  error?: string;
}

/**
 * Ensina ao FORNEXA a categoria do Mercado Livre de cada gaveta do catálogo.
 *
 * Desde 22/10 o Mercado Livre não responde mais qual é a categoria de um
 * produto, e publicar passou a depender de uma categoria aprendida. Só que o
 * aprendizado acontece quando alguém publica — e quem publica está travado.
 *
 * Este botão quebra o ciclo: lê os anúncios que já estão no ar e preenche a
 * tabela antes de o primeiro vendedor tentar de novo.
 */
export default function CategoriasDoMl() {
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const aprender = async () => {
    setRodando(true);
    setResultado(null);

    const { data, error } = await supabase.functions.invoke('admin-aprender-categorias', {
      body: {},
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

      setResultado({ error: motivo ?? 'Não foi possível aprender agora. Tente de novo.' });
      return;
    }

    setResultado(data as Resultado);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-start gap-3">
        <Tags className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />

        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">
            Categorias do Mercado Livre
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            O Mercado Livre parou de responder a categoria de um produto. Isto lê os
            anúncios já publicados e descobre qual categoria cada gaveta do catálogo usa —
            é o que permite publicar produto que ninguém publicou ainda.
          </p>
        </div>
      </div>

      <button
        onClick={aprender}
        disabled={rodando}
        className="mt-4 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
      >
        {rodando && <Loader2 className="w-4 h-4 animate-spin" />}
        {rodando ? 'Aprendendo…' : 'Aprender com os anúncios publicados'}
      </button>

      {resultado && (
        <div className="mt-4 space-y-3">
          {resultado.error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{resultado.error}</p>
          ) : (
            <>
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {resultado.aprendidas?.length ?? 0} categoria(s) aprendidas.
                {(resultado.sem_resposta?.length ?? 0) > 0 &&
                  ` ${resultado.sem_resposta?.length} sem anúncio para consultar.`}
              </p>

              {(resultado.aprendidas?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
                  {resultado.aprendidas?.map((linha) => (
                    <div
                      key={linha.categoria}
                      className="flex items-center justify-between gap-3 p-3 text-sm"
                    >
                      <span className="text-slate-900 dark:text-white truncate">
                        {linha.categoria}
                      </span>

                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400 shrink-0">
                        {linha.ml_category_id} · {linha.anuncios} anúncio(s)
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {(resultado.sem_resposta?.length ?? 0) > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sem anúncio publicado para consultar:{' '}
                  {resultado.sem_resposta?.join(', ')}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
