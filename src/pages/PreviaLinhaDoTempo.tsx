import { Package } from 'lucide-react';
import LinhaDoTempoDoPedido, { rotuloDaEtapa, type PedidoParaLinhaDoTempo } from '../components/dashboard/LinhaDoTempoDoPedido';

/**
 * PRÉVIA — branch feat/linha-do-tempo-do-pedido. Sai antes de ir para o ar.
 *
 * Um pedido de exemplo em cada etapa, no mesmo cartão da tela de Pedidos,
 * para ver todas as fases sem depender de ter um pedido real em cada uma.
 */

const agora = Date.now();
const ha = (horas: number) => new Date(agora - horas * 3600_000).toISOString();
const daqui = (horas: number) => new Date(agora + horas * 3600_000).toISOString();

const EXEMPLOS: { nome: string; pedido: PedidoParaLinhaDoTempo; venda: string; lucro: string }[] = [
  {
    nome: 'Venda que acabou de entrar',
    venda: 'R$ 34,95',
    lucro: 'R$ 1,66',
    pedido: { status: 'pending', created_at: ha(1), pago_ao_fornecedor_em: null, recebimento_confirmado_em: null, tracking_code: null },
  },
  {
    nome: 'Pagamento ao fornecedor caiu',
    venda: 'R$ 59,90',
    lucro: 'R$ 12,40',
    pedido: { status: 'pending', created_at: ha(5), pago_ao_fornecedor_em: ha(4), recebimento_confirmado_em: null, tracking_code: null },
  },
  {
    nome: 'Venda agendada pelo Mercado Livre (o caso do áudio)',
    venda: 'R$ 34,95',
    lucro: 'R$ 1,66',
    pedido: {
      status: 'pending',
      created_at: ha(20),
      pago_ao_fornecedor_em: ha(14),
      recebimento_confirmado_em: ha(14),
      reservado_em: ha(14),
      ml_shipment_substatus: 'buffered',
      ml_liberacao_em: daqui(30),
      tracking_code: null,
    },
  },
  {
    nome: 'Etiqueta liberada',
    venda: 'R$ 89,00',
    lucro: 'R$ 21,30',
    pedido: {
      status: 'pending',
      created_at: ha(30),
      pago_ao_fornecedor_em: ha(29),
      recebimento_confirmado_em: ha(28),
      ml_shipment_substatus: 'ready_to_print',
      tracking_code: null,
    },
  },
  {
    nome: 'Enviado',
    venda: 'R$ 45,50',
    lucro: 'R$ 9,80',
    pedido: {
      status: 'shipped',
      created_at: ha(60),
      pago_ao_fornecedor_em: ha(59),
      recebimento_confirmado_em: ha(58),
      reservado_em: ha(58),
      tracking_code: 'F5GG2C7I6RLF3CNF765SFHS5NU',
    },
  },
  {
    nome: 'Entregue',
    venda: 'R$ 120,00',
    lucro: 'R$ 30,10',
    pedido: {
      status: 'delivered',
      created_at: ha(140),
      pago_ao_fornecedor_em: ha(139),
      recebimento_confirmado_em: ha(138),
      tracking_code: 'F5GG2C7I6RLF3CNF765SFHS5NU',
    },
  },
];

export default function PreviaLinhaDoTempo() {
  return (
    <div className="dark min-h-screen bg-navy-950 text-white">
      <div className="max-w-5xl mx-auto px-5 py-10">
        <p className="text-xs font-bold uppercase tracking-wider text-gold">Prévia</p>
        <h1 className="font-display text-3xl font-semibold mt-1">Pedidos — andamento</h1>
        <p className="text-slate-400 mt-2 max-w-2xl">
          Um pedido de exemplo em cada etapa. Na tela de Pedidos de verdade, cada pedido mostra a etapa em que ele está.
        </p>

        <div className="mt-8 space-y-5">
          {EXEMPLOS.map(({ nome, pedido, venda, lucro }) => (
            <article key={nome} className="bg-navy-800 rounded-2xl border border-white/10 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-3">{nome}</p>
              <div className="flex flex-col lg:flex-row gap-5">
                <div className="flex gap-4 flex-1 min-w-0">
                  <div className="w-20 h-20 rounded-xl bg-navy-700 flex items-center justify-center shrink-0">
                    <Package className="w-8 h-8 text-slate-500" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-navy-700 text-slate-300">Mercado Livre</span>
                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gold/15 text-gold">{rotuloDaEtapa(pedido)}</span>
                      {pedido.tracking_code && (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-navy-700 text-slate-300">
                          Rastreio: {pedido.tracking_code}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold mt-3">Mini Processador de Alimentos Tomate SRQ-017B 45W Portátil USB</h3>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:w-56 self-start">
                  <div className="bg-navy-700 rounded-xl p-3">
                    <p className="text-xs text-slate-400">Venda</p>
                    <p className="text-sm font-bold mt-1">{venda}</p>
                  </div>
                  <div className="bg-navy-700 rounded-xl p-3">
                    <p className="text-xs text-slate-400">Lucro</p>
                    <p className="text-sm font-bold text-green-400 mt-1">{lucro}</p>
                  </div>
                </div>
              </div>
              <LinhaDoTempoDoPedido pedido={pedido} />
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
