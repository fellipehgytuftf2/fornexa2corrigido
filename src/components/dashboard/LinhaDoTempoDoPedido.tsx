import { Check, CircleDollarSign, PackageCheck, ShoppingBag, Tag, Truck, Home } from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * Por onde o pedido já passou, na tela de Pedidos do vendedor.
 *
 * O PEDIDO, NA VOZ DO FORNECEDOR (áudio de 16/11/2026)
 *
 * "Era bom o vendedor acompanhar o status. Continua com o pendente, mas esse
 * pedido a gente colocou como reservado: está agendado pelo Mercado Livre,
 * ainda não tem etiqueta. Era bom aparecer essa etapa: confirmado o
 * pagamento, depois reservado, depois enviado. O vendedor acha que não está
 * acontecendo nada com o pedido dele [...] e mostrar o dia que vai liberar a
 * etiqueta, como o próprio Mercado Livre mostra."
 *
 * Os vendedores olham o painel da FORNEXA, não a conta do Mercado Livre. Um
 * selo "Pendente" parado por três dias parece abandono, mesmo quando o
 * produto já está separado esperando a etiqueta sair.
 *
 * Tudo aqui é lido do que já está gravado no pedido; nada é estimado.
 */

export interface PedidoParaLinhaDoTempo {
  status: string;
  created_at: string;
  /** Quando o Pix do vendedor ao fornecedor caiu. */
  pago_ao_fornecedor_em: string | null;
  /** Quando o fornecedor conferiu esse Pix na conta dele. */
  recebimento_confirmado_em: string | null;
  reservado_em?: string | null;
  ml_shipment_substatus?: string | null;
  /** Quando o Mercado Livre solta a etiqueta de uma venda agendada. */
  ml_liberacao_em?: string | null;
  tracking_code: string | null;
}

type IdDaEtapa = 'venda' | 'pagamento' | 'reservado' | 'etiqueta' | 'enviado' | 'entregue';

interface Etapa {
  id: IdDaEtapa;
  titulo: string;
  icone: ComponentType<{ className?: string }>;
}

const ETAPAS: Etapa[] = [
  { id: 'venda', titulo: 'Venda feita', icone: ShoppingBag },
  { id: 'pagamento', titulo: 'Pagamento confirmado', icone: CircleDollarSign },
  { id: 'reservado', titulo: 'Reservado', icone: PackageCheck },
  { id: 'etiqueta', titulo: 'Etiqueta liberada', icone: Tag },
  { id: 'enviado', titulo: 'Enviado', icone: Truck },
  { id: 'entregue', titulo: 'Entregue', icone: Home },
];

/** Etiqueta já existe no Mercado Livre: liberada, impressa ou a caminho. */
const ETIQUETA_SAIU = new Set(['ready_to_print', 'printed', 'ready_for_pickup', 'picked_up', 'in_hub']);

const diaEHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const soDia = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

const pagamentoEm = (pedido: PedidoParaLinhaDoTempo) =>
  pedido.pago_ao_fornecedor_em ?? pedido.recebimento_confirmado_em;

/** Até onde o pedido chegou. */
export function etapaAtual(pedido: PedidoParaLinhaDoTempo): IdDaEtapa {
  if (pedido.status === 'delivered') return 'entregue';
  if (pedido.status === 'shipped') return 'enviado';
  if (
    pedido.status === 'separating' ||
    (pedido.ml_shipment_substatus && ETIQUETA_SAIU.has(pedido.ml_shipment_substatus))
  )
    return 'etiqueta';
  if (pedido.reservado_em || (pagamentoEm(pedido) && pedido.ml_shipment_substatus === 'buffered'))
    return 'reservado';
  if (pagamentoEm(pedido)) return 'pagamento';
  return 'venda';
}

/** O que o selo do pedido diz, no lugar do "Pendente" genérico. */
export function rotuloDaEtapa(pedido: PedidoParaLinhaDoTempo): string {
  const atual = etapaAtual(pedido);
  if (atual === 'venda') return 'Aguardando pagamento ao fornecedor';
  return ETAPAS.find((etapa) => etapa.id === atual)?.titulo ?? 'Pendente';
}

/** A frase que explica o que está acontecendo agora e o que vem depois. */
function oQueAcontece(pedido: PedidoParaLinhaDoTempo, atual: IdDaEtapa): string {
  const agendado = pedido.ml_shipment_substatus === 'buffered';

  switch (atual) {
    case 'venda':
      return 'O cliente já pagou no Mercado Livre. Assim que o seu pagamento ao fornecedor cair, ele separa o produto.';
    case 'pagamento':
      return agendado
        ? 'O pagamento ao fornecedor caiu. A venda está agendada pelo Mercado Livre: a etiqueta ainda não saiu.'
        : 'O pagamento ao fornecedor caiu, e ele vai separar o produto.';
    case 'reservado':
      if (pedido.ml_liberacao_em) {
        return `O produto já está separado para você. O Mercado Livre libera a etiqueta ${soDia(pedido.ml_liberacao_em)}, e o fornecedor despacha em seguida.`;
      }
      return agendado
        ? 'O produto já está separado para você. A venda está agendada pelo Mercado Livre: assim que ele liberar a etiqueta, o fornecedor despacha.'
        : 'O produto já está separado para você, esperando a etiqueta para ser despachado.';
    case 'etiqueta':
      return 'A etiqueta saiu. O fornecedor imprime, embala e despacha.';
    case 'enviado':
      return pedido.tracking_code
        ? 'O pacote saiu do fornecedor e está com o Mercado Livre. Acompanhe pelo rastreio.'
        : 'O pacote saiu do fornecedor e está com o Mercado Livre.';
    case 'entregue':
      return 'O cliente recebeu o pedido.';
  }
}

export default function LinhaDoTempoDoPedido({ pedido }: { pedido: PedidoParaLinhaDoTempo }) {
  const atual = etapaAtual(pedido);
  const indiceAtual = ETAPAS.findIndex((etapa) => etapa.id === atual);

  const quando: Partial<Record<IdDaEtapa, string>> = {
    venda: diaEHora(pedido.created_at),
    pagamento: pagamentoEm(pedido) ? diaEHora(pagamentoEm(pedido) as string) : undefined,
    reservado: pedido.reservado_em ? diaEHora(pedido.reservado_em) : undefined,
  };

  // A data da etiqueta é a única do futuro que o Mercado Livre informa.
  const previsao: Partial<Record<IdDaEtapa, string>> = {
    etiqueta: pedido.ml_liberacao_em && indiceAtual < 3 ? `Libera ${diaEHora(pedido.ml_liberacao_em)}` : undefined,
  };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/70 dark:bg-navy-900/60 p-4">
      {/* No celular a linha corre de cima para baixo: seis etapas lado a lado
          não cabem em 360px. Do tablet para cima, da esquerda para a direita. */}
      <ol className="flex flex-col gap-3 sm:grid sm:grid-cols-6 sm:gap-1" aria-label="Andamento do pedido">
        {ETAPAS.map((etapa, indice) => {
          const feita = indice < indiceAtual;
          const agora = indice === indiceAtual;
          const Icone = etapa.icone;
          const texto = quando[etapa.id] ?? previsao[etapa.id];

          return (
            <li
              key={etapa.id}
              className="relative flex items-center gap-3 sm:flex-col sm:gap-0 sm:text-center"
              aria-current={agora ? 'step' : undefined}
            >
              {indice > 0 && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[15px] -top-3 h-3 w-0.5 sm:left-auto sm:top-4 sm:right-1/2 sm:h-0.5 sm:w-full ${
                    indice <= indiceAtual ? 'bg-gold' : 'bg-gray-200 dark:bg-white/10'
                  }`}
                />
              )}
              <span
                className={`relative z-10 w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                  feita
                    ? 'bg-gold text-navy-900'
                    : agora
                      ? 'bg-navy-900 text-gold ring-4 ring-gold/30 dark:bg-gold dark:text-navy-900'
                      : 'bg-white text-gray-400 border border-gray-200 dark:bg-navy-800 dark:text-slate-500 dark:border-white/10'
                }`}
              >
                {feita ? <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" /> : <Icone className="w-4 h-4" aria-hidden="true" />}
              </span>
              <span className="flex flex-wrap items-baseline gap-x-2 sm:flex-col sm:items-center sm:mt-2">
                <span
                  className={`text-sm sm:text-xs leading-tight font-semibold ${
                    feita || agora ? 'text-navy-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'
                  }`}
                >
                  {etapa.titulo}
                </span>
                {texto && (
                  <span
                    className={`text-xs sm:text-[11px] leading-tight sm:mt-0.5 ${
                      previsao[etapa.id] ? 'text-amber-600 dark:text-gold font-semibold' : 'text-gray-500 dark:text-slate-400'
                    }`}
                  >
                    {texto}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-sm text-gray-700 dark:text-slate-300 leading-relaxed">{oQueAcontece(pedido, atual)}</p>
    </div>
  );
}
