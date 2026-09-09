import { Printer } from 'lucide-react';

/**
 * Como o vendedor deve configurar a impressão da etiqueta no Mercado Livre.
 *
 * POR QUE ISTO PRECISA ESTAR NA TELA DELE
 *
 * O PDF da etiqueta sai no formato que a conta do VENDEDOR tem configurada:
 * A4 ou térmica. Não é parâmetro da API — não há como o FORNEXA pedir de outro
 * jeito, e não há endpoint para ler nem trocar essa preferência.
 *
 * Quem paga por isso é o fornecedor, do outro lado: recebe uma folha A4 com a
 * etiqueta num pedaço e a Declaração no outro, e passa a cortar com tesoura e
 * colar com fita em toda venda. Ele nunca vai descobrir sozinho que a causa
 * está numa configuração da conta de outra pessoa.
 *
 * Por isso o aviso mora aqui, ao lado do endereço do remetente: são as duas
 * coisas que o vendedor configura uma vez no Mercado Livre e que decidem como
 * o pacote sai.
 */
export default function ImpressaoDaEtiqueta() {
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

      <p className="text-sm text-gray-500 dark:text-slate-400 mt-2 leading-relaxed">
        Em A4, seu fornecedor recebe uma folha com a etiqueta num pedaço e a
        Declaração no outro — e passa a cortar com tesoura e colar com fita em
        toda venda sua. Em térmica, sai no tamanho do adesivo: ele imprime e
        cola.
      </p>

      {/* O FORNEXA não consegue conferir isto, e dizer o contrário seria pior
          que não dizer nada: o vendedor confiaria numa verificação que não
          existe. O formato vem da conta dele, e a API do Mercado Livre não
          expõe essa preferência nem para ler. */}
      <p className="text-xs text-gray-400 dark:text-slate-500 mt-3 leading-relaxed">
        Este é o único ajuste do envio que não conseguimos conferir por aqui: o
        Mercado Livre não informa essa preferência. Confira na conta.
      </p>
    </div>
  );
}
