import { CalendarClock, Check, CircleDollarSign, Copy, Home, PackageCheck, ShoppingBag, Tag, Truck } from 'lucide-react';
import { useState, type ComponentType } from 'react';

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

/** "em 1 dia e 4 h", "em 6 h", "hoje": quanto falta para a etiqueta sair. */
function quantoFalta(iso: string): string | null {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const horas = Math.round(ms / 3600_000);
  if (horas < 1) return 'em menos de 1 h';
  if (horas < 24) return `em ${horas} h`;
  const dias = Math.floor(horas / 24);
  const resto = horas % 24;
  return `em ${dias} ${dias === 1 ? 'dia' : 'dias'}${resto ? ` e ${resto} h` : ''}`;
}

export default function LinhaDoTempoDoPedido({ pedido }: { pedido: PedidoParaLinhaDoTempo }) {
  const atual = etapaAtual(pedido);
  const indiceAtual = ETAPAS.findIndex((etapa) => etapa.id === atual);
  const entregue = atual === 'entregue';
  const EtapaAgora = ETAPAS[indiceAtual].icone;
  const [copiado, setCopiado] = useState(false);

  const quando: Partial<Record<IdDaEtapa, string>> = {
    venda: diaEHora(pedido.created_at),
    pagamento: pagamentoEm(pedido) ? diaEHora(pagamentoEm(pedido) as string) : undefined,
    reservado: pedido.reservado_em ? diaEHora(pedido.reservado_em) : undefined,
  };

  // A data da etiqueta é a única do futuro que o Mercado Livre informa.
  const liberaEm = pedido.ml_liberacao_em && indiceAtual < 3 ? pedido.ml_liberacao_em : null;
  const falta = liberaEm ? quantoFalta(liberaEm) : null;
  const previsao: Partial<Record<IdDaEtapa, string>> = {
    etiqueta: liberaEm
      ? `Libera ${new Date(liberaEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
      : undefined,
  };

  // Do centro do primeiro círculo ao centro do último: 1/12 de cada lado.
  const progresso = indiceAtual / (ETAPAS.length - 1);

  const copiarRastreio = async () => {
    if (!pedido.tracking_code) return;
    try {
      await navigator.clipboard.writeText(pedido.tracking_code);
    } catch {
      /* sem permissão de área de transferência: só mostra o retorno */
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1600);
  };

  const corForte = entregue ? 'bg-green-500 text-white' : 'bg-gold text-navy-900';

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 dark:border-white/10 bg-gradient-to-br from-white to-gray-50 dark:from-navy-900 dark:to-navy-950/80 p-4 sm:p-5 overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-slate-400">Andamento do pedido</p>
        <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 whitespace-nowrap">
          Etapa <span className={entregue ? 'text-green-600 dark:text-green-400' : 'text-navy-900 dark:text-gold'}>{indiceAtual + 1}</span> de {ETAPAS.length}
        </p>
      </div>

      {/* No celular a linha corre de cima para baixo: seis etapas lado a lado
          não cabem em 360px. Do tablet para cima, da esquerda para a direita. */}
      <div className="relative">
        <div aria-hidden="true" className="hidden sm:block absolute top-5 left-[8.333%] right-[8.333%] h-1 rounded-full bg-gray-200 dark:bg-white/10">
          <div
            className={`pedido-trilho h-full rounded-full ${entregue ? 'bg-green-500' : 'bg-gradient-to-r from-gold/70 to-gold'}`}
            style={{ width: `${progresso * 100}%` }}
          />
        </div>

        <ol className="relative flex flex-col gap-3 sm:grid sm:grid-cols-6 sm:gap-1" aria-label="Andamento do pedido">
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
                    className={`sm:hidden absolute left-[19px] -top-3 h-3 w-0.5 ${
                      indice <= indiceAtual ? `pedido-trilho-v ${entregue ? 'bg-green-500' : 'bg-gold'}` : 'bg-gray-200 dark:bg-white/10'
                    }`}
                    style={{ animationDelay: `${indice * 90}ms` }}
                  />
                )}
                <span className="w-10 h-10 shrink-0 flex items-center justify-center">
                  <span
                    style={{ animationDelay: `${indice * 90}ms` }}
                    className={`pedido-entra relative z-10 rounded-full flex items-center justify-center transition-colors ${
                      agora
                        ? `w-10 h-10 ${corForte} shadow-lg ${entregue ? 'pedido-pulso-verde shadow-green-500/30' : 'pedido-pulso shadow-gold/30'}`
                        : feita
                          ? `w-8 h-8 ${corForte}`
                          : 'w-8 h-8 bg-white text-gray-400 border border-dashed border-gray-300 dark:bg-navy-800 dark:text-slate-500 dark:border-white/15'
                    }`}
                  >
                    {feita ? (
                      <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" />
                    ) : (
                      <Icone className={`${agora ? 'w-5 h-5' : 'w-4 h-4'} ${agora && etapa.id === 'enviado' ? 'pedido-caminhao' : ''}`} aria-hidden="true" />
                    )}
                  </span>
                </span>
                <span className="flex flex-wrap items-baseline gap-x-2 sm:flex-col sm:items-center sm:mt-2">
                  <span
                    className={`text-sm sm:text-xs leading-tight ${
                      agora
                        ? 'font-bold text-navy-900 dark:text-white'
                        : feita
                          ? 'font-semibold text-navy-900/80 dark:text-slate-200'
                          : 'font-medium text-gray-400 dark:text-slate-500'
                    }`}
                  >
                    {etapa.titulo}
                  </span>
                  {texto && (
                    <span
                      className={`text-xs sm:text-[11px] leading-tight sm:mt-0.5 ${
                        previsao[etapa.id]
                          ? 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 bg-gold/15 text-amber-700 dark:text-gold font-semibold'
                          : 'text-gray-500 dark:text-slate-400'
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
      </div>

      <div
        className={`acesso-aviso mt-5 flex gap-3 rounded-xl border p-3.5 ${
          entregue
            ? 'border-green-500/30 bg-green-50 dark:bg-green-500/10'
            : 'border-gold/40 bg-gold/[0.08] dark:bg-gold/[0.06]'
        }`}
      >
        <span className={`hidden sm:flex w-9 h-9 shrink-0 rounded-lg items-center justify-center ${corForte}`}>
          <EtapaAgora className="w-5 h-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-navy-900 dark:text-white">{rotuloDaEtapa(pedido)}</p>
          <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed mt-0.5">{oQueAcontece(pedido, atual)}</p>

          {(falta || (pedido.tracking_code && indiceAtual >= 4)) && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {falta && (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-navy-900 text-gold dark:bg-gold dark:text-navy-900 px-3 py-1 text-xs font-bold">
                  <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
                  Etiqueta sai {falta}
                </span>
              )}
              {pedido.tracking_code && indiceAtual >= 4 && (
                <button
                  type="button"
                  onClick={copiarRastreio}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 dark:border-white/15 bg-white dark:bg-navy-800 px-3 py-1 text-xs font-semibold text-navy-900 dark:text-white hover:border-gold transition-colors"
                >
                  {copiado ? <Check className="w-3.5 h-3.5 text-green-500" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                  {copiado ? 'Rastreio copiado' : 'Copiar rastreio'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
