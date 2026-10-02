import { useState } from 'react';
import { ExternalLink, Store, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ModalPortal from '../ui/modal-portal';

/**
 * Onde o Mercado Livre cria a conta de vendedor.
 *
 * A página de endereços do hub, que estava aqui antes, exige conta de vendedor
 * para abrir — manda justamente quem ainda não tem para uma porta fechada.
 */
const CRIAR_CONTA_DE_VENDEDOR = 'https://vendedores.mercadolivre.com.br/';

interface Props {
  /** Fecha sem conectar. */
  aoFechar: () => void;
  /** Segue para a autorização do Mercado Livre, como já funcionava. */
  aoContinuar: () => void;
}

/**
 * A pergunta que evita conectar a conta errada.
 *
 * No Mercado Livre, comprar e vender são contas diferentes, e a de comprador é
 * a que todo mundo já tem. Conectada aqui, ela parece funcionar: entra, mostra
 * o nome, fica verde. O erro só aparece no fim — anúncio montado, botão de
 * publicar, recusa. Quem chegou até ali conclui que a ferramenta não presta e
 * pede reembolso, quando o que faltava era uma conta que leva dois minutos
 * para criar.
 *
 * Perguntar antes custa um clique a quem já tem, e poupa a tarde de quem não
 * tem.
 */
export default function AntesDeConectar({ aoFechar, aoContinuar }: Props) {
  // Duas telas no mesmo modal: a pergunta, e a espera de quem foi criar a
  // conta. A segunda não fecha sozinha de propósito — a pessoa está noutra
  // aba, e um modal que some enquanto ela cria a conta a devolve para o mesmo
  // botão, sem saber se já podia clicar.
  const [criandoConta, setCriandoConta] = useState(false);

  const responder = async (tinha: boolean) => {
    // Registro para análise, e nada além disso: se falhar, a conexão segue.
    // Perder uma estatística é barato; travar quem quer conectar não é.
    await supabase.rpc('registrar_resposta_conta_vendedor', { p_tinha: tinha });
  };

  const naoTenho = async () => {
    // Abre antes do await: navegador bloqueia janela aberta depois de uma
    // espera, por não conseguir mais ligá-la ao clique da pessoa.
    window.open(CRIAR_CONTA_DE_VENDEDOR, '_blank', 'noopener,noreferrer');
    setCriandoConta(true);
    await responder(false);
  };

  const jaTenho = async () => {
    await responder(true);
    aoContinuar();
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 py-6">
        <div className="w-full max-w-lg max-h-full overflow-y-auto rounded-2xl bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 shadow-2xl">
          <div className="flex items-start justify-between gap-4 p-6 pb-0">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <Store
                  className="w-5 h-5 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
              </span>

              <h2 className="text-lg font-bold text-navy-900 dark:text-white">
                Antes de conectar
              </h2>
            </div>

            <button
              type="button"
              onClick={aoFechar}
              aria-label="Fechar"
              className="text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="p-6">
            {criandoConta ? (
              <>
                <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">
                  Assim que criar sua conta de vendedor, volte a esta aba e clique em
                  "Já criei, continuar" para conectar.
                </p>

                <p className="text-xs text-gray-500 dark:text-slate-400 mt-3 leading-relaxed">
                  A página do Mercado Livre abriu em outra aba. Esta aqui fica esperando
                  — pode levar o tempo que precisar.
                </p>

                <div className="flex flex-col sm:flex-row gap-2 mt-6">
                  <button
                    type="button"
                    onClick={aoContinuar}
                    className="inline-flex items-center justify-center rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-gold-hover"
                  >
                    Já criei, continuar
                  </button>

                  <a
                    href={CRIAR_CONTA_DE_VENDEDOR}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-navy-700 px-5 py-3 text-sm font-semibold text-navy-900 dark:text-white transition-colors hover:bg-gray-50 dark:hover:bg-navy-700"
                  >
                    <ExternalLink className="w-4 h-4" aria-hidden="true" />
                    Abrir de novo
                  </a>
                </div>
              </>
            ) : (
              <>
                <p className="text-base text-navy-900 dark:text-white font-medium">
                  Você já possui uma conta de VENDEDOR no Mercado Livre?
                </p>

                <p className="text-sm text-gray-600 dark:text-slate-300 mt-3 leading-relaxed">
                  Comprar e vender são contas diferentes por lá. A de comprador conecta
                  normalmente aqui, mas recusa todo anúncio na hora de publicar.
                </p>

                <div className="flex flex-col sm:flex-row gap-2 mt-6">
                  <button
                    type="button"
                    onClick={jaTenho}
                    className="inline-flex items-center justify-center rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-gold-hover"
                  >
                    Sim, já tenho
                  </button>

                  <button
                    type="button"
                    onClick={naoTenho}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-navy-700 px-5 py-3 text-sm font-semibold text-navy-900 dark:text-white transition-colors hover:bg-gray-50 dark:hover:bg-navy-700"
                  >
                    Não tenho ainda
                    <ExternalLink className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
