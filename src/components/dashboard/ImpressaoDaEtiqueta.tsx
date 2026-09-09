import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Printer } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * Em que formato a etiqueta deste vendedor sai: térmica ou A4.
 *
 * POR QUE ISTO PRECISA ESTAR NA TELA DELE
 *
 * O PDF sai no formato configurado na conta dele, e não há parâmetro na API
 * para pedir de outro jeito. Em A4, o fornecedor recebe uma folha com a
 * etiqueta num pedaço e a Declaração no outro, e passa a cortar com tesoura e
 * colar com fita em toda venda — sem nunca descobrir que a causa está na
 * configuração da conta de outra pessoa.
 *
 * A CONFERÊNCIA
 *
 * `GET /users/{id}/shipping_preferences` traz `thermal_printer`, e é assim que
 * a tela sabe dizer se está certo em vez de só pedir. O campo não está na
 * documentação; foi achado por sonda, como a API de DC-e.
 */
export default function ImpressaoDaEtiqueta() {
  const [termica, setTermica] = useState<boolean | null>(null);
  const [conferiu, setConferiu] = useState(false);

  useEffect(() => {
    const conferir = async () => {
      const { data } = await supabase.functions.invoke<{
        conectado?: boolean;
        termica?: boolean;
      }>('ml-preferencia-de-impressao');

      if (!data?.conectado || data.termica === undefined) return;

      setTermica(data.termica);
      setConferiu(true);
    };

    conferir();
  }, []);

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
      <p className="font-semibold text-navy-900 dark:text-white flex items-center gap-2">
        <Printer className="w-4 h-4 text-gray-600 dark:text-slate-400" aria-hidden="true" />
        Impressão da etiqueta
      </p>

      <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
        Configure como <strong className="text-navy-900 dark:text-white">térmica</strong> no
        Mercado Livre, em{' '}
        <strong className="text-navy-900 dark:text-white">
          Vendas → Preferências de venda → Configurações de impressão de etiqueta
        </strong>
        .
      </p>

      {conferiu && termica && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3 mt-4">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />

          <p className="text-sm text-green-800 dark:text-green-300 leading-relaxed">
            Já está em térmica. Seu fornecedor imprime e cola, sem cortar nada.
          </p>
        </div>
      )}

      {conferiu && !termica && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 mt-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />

          <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
            Sua conta está em <strong>A4</strong>. Seu fornecedor recebe uma
            folha com a etiqueta num pedaço e a Declaração no outro, e tem que
            cortar com tesoura e colar com fita em toda venda sua. Em térmica,
            sai no tamanho do adesivo.
          </p>
        </div>
      )}

      {/* Sem conferência, não se afirma nada: dizer "está certo" sem ter lido
          seria pior que não dizer — o vendedor confiaria. */}
      {!conferiu && (
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-3 leading-relaxed">
          Em A4, seu fornecedor recebe uma folha com a etiqueta num pedaço e a
          Declaração no outro, e tem que cortar com tesoura e colar com fita em
          toda venda sua. Em térmica, sai no tamanho do adesivo.
        </p>
      )}
    </div>
  );
}
