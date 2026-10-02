import { useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ModalPortal from '../ui/modal-portal';

interface Props {
  /** As categorias que existem de verdade no catálogo carregado. */
  categorias: string[];
  /** Fecha guardando a escolha. Lista vazia = pulou. */
  aoResponder: (escolhidas: string[]) => void;
}

/**
 * A pergunta de entrada do catálogo.
 *
 * São quase 900 produtos de tudo quanto é tipo, e quem chega pela primeira vez
 * vê fone de ouvido ao lado de ração e furador de coco. A pergunta troca uma
 * lista enorme por uma que parece feita para a pessoa.
 *
 * A resposta é sugestão, não trava: decide como o catálogo abre, e o seletor
 * de categoria da tela continua mandando depois.
 */
export default function EscolhaDeNicho({ categorias, aoResponder }: Props) {
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  const alternar = (categoria: string) => {
    setEscolhidas((atuais) =>
      atuais.includes(categoria)
        ? atuais.filter((c) => c !== categoria)
        : [...atuais, categoria]
    );
  };

  const responder = async (lista: string[]) => {
    setSalvando(true);

    // Guardar pode falhar; a escolha vale para esta visita de qualquer jeito.
    // Perder a preferência é um aborrecimento, travar a entrada do catálogo é
    // perder a pessoa.
    await supabase.rpc('salvar_nicho', { p_categorias: lista });

    setSalvando(false);
    aoResponder(lista);
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 py-6">
        <div className="w-full max-w-xl max-h-full overflow-y-auto rounded-2xl bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 shadow-2xl">
          <div className="flex items-start justify-between gap-4 p-6 pb-0">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-gold" aria-hidden="true" />
              </span>

              <h2 className="text-lg font-bold text-navy-900 dark:text-white">
                O que você quer vender?
              </h2>
            </div>

            {/* Fechar no X é a mesma coisa que pular: a pergunta não volta, e
                quem fecha já respondeu "agora não quero escolher". */}
            <button
              type="button"
              onClick={() => responder([])}
              aria-label="Pular"
              className="text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="p-6">
            <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">
              Escolha uma ou mais categorias para personalizar seu catálogo. Dá para
              mudar depois nas Configurações, e o filtro da tela continua valendo.
            </p>

            <div className="flex flex-wrap gap-2 mt-5">
              {categorias.map((categoria) => {
                const marcada = escolhidas.includes(categoria);

                return (
                  <button
                    key={categoria}
                    type="button"
                    onClick={() => alternar(categoria)}
                    aria-pressed={marcada}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      marcada
                        ? 'bg-gold text-navy-900'
                        : 'border border-gray-200 dark:border-navy-700 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700'
                    }`}
                  >
                    {marcada && <Check className="w-4 h-4" aria-hidden="true" />}
                    {categoria}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-6">
              <button
                type="button"
                onClick={() => responder(escolhidas)}
                disabled={salvando || escolhidas.length === 0}
                className="inline-flex items-center justify-center rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-gold-hover disabled:opacity-50"
              >
                Aplicar filtro
              </button>

              <button
                type="button"
                onClick={() => responder([])}
                disabled={salvando}
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 dark:border-navy-700 px-5 py-3 text-sm font-semibold text-navy-900 dark:text-white transition-colors hover:bg-gray-50 dark:hover:bg-navy-700 disabled:opacity-50"
              >
                Pular, ver tudo
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
