import { useState } from 'react';
import ImpressaoDasContas from '../../components/dashboard/ImpressaoDasContas';
import PausasPorEstoque from '../../components/dashboard/PausasPorEstoque';
import RemetenteTravado from '../../components/dashboard/RemetenteTravado';
import SondaDeReclamacoes from '../../components/dashboard/SondaDeReclamacoes';
import SondaDeVenda from '../../components/dashboard/SondaDeVenda';
import SondaDeNotaFiscal from '../../components/dashboard/SondaDeNotaFiscal';

/**
 * As ferramentas de saúde operacional, uma por vez.
 *
 * São seis painéis, e cada um responde uma pergunta diferente: quem imprime
 * errado, quem está sem estoque, por que a etiqueta não sai, onde está um
 * pedido, se dá para ler reclamação, se dá para buscar nota fiscal.
 *
 * Empilhados, chegavam a meia tela de rolagem — e a rolagem era paga por quem
 * veio responder uma pergunta só. Em abas, cada painel aparece sozinho.
 *
 * Só o escolhido é montado, e isso é de propósito: cada um consulta o banco ou
 * a API do Mercado Livre ao abrir. Montar todos cobraria seis consultas de
 * quem veio fazer uma.
 */
const ABAS = [
  {
    id: 'impressao',
    titulo: 'Impressão',
    descricao: 'Quem ainda imprime etiqueta em A4',
  },
  {
    id: 'estoque',
    titulo: 'Pausas por estoque',
    descricao: 'Anúncio pausado por produto zerado',
  },
  {
    id: 'remetente',
    titulo: 'Remetente travado',
    descricao: 'Etiqueta parada pelo endereço de origem',
  },
  {
    id: 'pedido',
    titulo: 'Onde está este pedido',
    descricao: 'Quando o vendedor diz que o pedido sumiu',
  },
  {
    id: 'reclamacoes',
    titulo: 'Reclamações',
    descricao: 'Se a aplicação consegue ler reclamação do comprador',
  },
  {
    id: 'nota',
    titulo: 'Nota fiscal PJ',
    descricao: 'Se a NF-e de vendedor PJ pode ser baixada',
  },
] as const;

type Aba = (typeof ABAS)[number]['id'];

export default function AdminImpressao() {
  const [aba, setAba] = useState<Aba>('impressao');

  const atual = ABAS.find((item) => item.id === aba) ?? ABAS[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setAba(item.id)}
            aria-pressed={aba === item.id}
            className={
              aba === item.id
                ? 'rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-2 text-sm font-semibold text-white dark:text-slate-900'
                : 'rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800'
            }
          >
            {item.titulo}
          </button>
        ))}
      </div>

      {/* A descrição da aba escolhida fica aqui, e não dentro de cada botão:
          seis descrições na fileira viram parede de texto. */}
      <p className="text-sm text-slate-500 dark:text-slate-400">{atual.descricao}</p>

      {aba === 'impressao' && <ImpressaoDasContas />}
      {aba === 'estoque' && <PausasPorEstoque />}
      {aba === 'remetente' && <RemetenteTravado />}
      {aba === 'pedido' && <SondaDeVenda />}
      {aba === 'reclamacoes' && <SondaDeReclamacoes />}
      {aba === 'nota' && <SondaDeNotaFiscal />}
    </div>
  );
}
