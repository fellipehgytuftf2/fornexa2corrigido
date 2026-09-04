import { useMemo, useState } from 'react';
import { Check, ChevronDown, Copy, Loader2, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { montarCodigoPix } from '../../lib/pix';

export interface PedidoAPagar {
  id: string;
  product_name: string;
  supplier_price: number | null;
  supplier_id: string | null;
  pago_ao_fornecedor_em: string | null;
  fornecedor?: {
    id: string;
    nome: string;
    cidade: string | null;
    chave_pix: string | null;
  } | null;
}

interface Props {
  pedidos: PedidoAPagar[];
  onMudou: () => void;
}

interface Grupo {
  id: string;
  nome: string;
  cidade: string | null;
  chavePix: string | null;
  pedidos: PedidoAPagar[];
  total: number;
}

/**
 * O que o vendedor deve a cada fornecedor, num lugar só.
 *
 * Antes, pagar era: achar o pedido, procurar o WhatsApp do fornecedor,
 * perguntar a chave PIX, esperar responder, digitar chave e valor, pagar,
 * mandar comprovante. Oito passos por pedido — e o fornecedor recebendo doze
 * PIX de dezessete reais no mesmo dia.
 *
 * Aqui é um código por fornecedor, com a soma de tudo que está em aberto. Um
 * PIX, um clique, todos os pedidos quitados.
 *
 * O dinheiro não passa pelo FORNEXA: o código é só texto, e o PIX sai do banco
 * do vendedor direto para o do fornecedor.
 */
export default function PagarFornecedores({ pedidos, onMudou }: Props) {
  const [aberto, setAberto] = useState(false);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [quitandoId, setQuitandoId] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  const grupos = useMemo<Grupo[]>(() => {
    const porFornecedor = new Map<string, Grupo>();

    pedidos.forEach((pedido) => {
      const fornecedor = pedido.fornecedor;

      // Sem fornecedor ou já pago não entra: a lista existe para o que falta
      // fazer, não para o histórico.
      if (!fornecedor?.id || pedido.pago_ao_fornecedor_em) {
        return;
      }

      const atual = porFornecedor.get(fornecedor.id) ?? {
        id: fornecedor.id,
        nome: fornecedor.nome,
        cidade: fornecedor.cidade,
        chavePix: fornecedor.chave_pix,
        pedidos: [],
        total: 0,
      };

      atual.pedidos.push(pedido);
      atual.total += Number(pedido.supplier_price || 0);

      porFornecedor.set(fornecedor.id, atual);
    });

    return [...porFornecedor.values()].sort((a, b) => b.total - a.total);
  }, [pedidos]);

  const formatar = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      Number(valor || 0)
    );

  const copiarPix = async (grupo: Grupo) => {
    const codigo = montarCodigoPix({
      chave: grupo.chavePix ?? '',
      nome: grupo.nome,
      cidade: grupo.cidade ?? 'BRASIL',
      valor: grupo.total,
      // Vai no extrato do fornecedor. Sem isso ele vê o valor cair e não sabe
      // a que se refere.
      identificador: `FORNEXA ${grupo.pedidos.length}PED`,
    });

    if (!codigo) {
      setErro('Não foi possível montar o código PIX.');
      return;
    }

    await navigator.clipboard.writeText(codigo);
    setCopiadoId(grupo.id);
    window.setTimeout(() => setCopiadoId((atual) => (atual === grupo.id ? null : atual)), 2000);
  };

  const marcarTodosPagos = async (grupo: Grupo) => {
    setQuitandoId(grupo.id);
    setErro('');

    const { error } = await supabase
      .from('orders')
      .update({ pago_ao_fornecedor_em: new Date().toISOString() })
      .in(
        'id',
        grupo.pedidos.map((pedido) => pedido.id)
      );

    setQuitandoId(null);

    if (error) {
      setErro(`Não foi possível marcar como pago: ${error.message}`);
      return;
    }

    onMudou();
  };

  // Nada em aberto é o normal. Não vale ocupar espaço por isso.
  if (grupos.length === 0) {
    return null;
  }

  const totalGeral = grupos.reduce((soma, grupo) => soma + grupo.total, 0);

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        aria-expanded={aberto}
        className="w-full flex items-center gap-3 p-5 text-left hover:bg-gray-50 dark:hover:bg-navy-700/50 transition-colors"
      >
        <Wallet className="w-5 h-5 text-gray-600 dark:text-slate-400 shrink-0" aria-hidden="true" />

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-navy-900 dark:text-white">A pagar aos fornecedores</p>

          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            {formatar(totalGeral)} em {grupos.length} fornecedor
            {grupos.length > 1 ? 'es' : ''}
          </p>
        </div>

        <ChevronDown
          className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {aberto && (
        <div className="border-t border-gray-200 dark:border-navy-700 p-5 space-y-4">
          {erro && (
            <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>
          )}

          {grupos.map((grupo) => (
            <div
              key={grupo.id}
              className="rounded-xl border border-gray-200 dark:border-navy-600 p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-navy-900 dark:text-white">{grupo.nome}</p>

                <p className="text-lg font-bold text-navy-900 dark:text-white tabular-nums">
                  {formatar(grupo.total)}
                </p>
              </div>

              <ul className="mt-3 space-y-1">
                {grupo.pedidos.map((pedido) => (
                  <li
                    key={pedido.id}
                    className="flex flex-wrap justify-between gap-2 text-sm text-gray-600 dark:text-slate-300"
                  >
                    <span className="truncate">{pedido.product_name}</span>
                    <span className="tabular-nums shrink-0">
                      {formatar(Number(pedido.supplier_price || 0))}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                {grupo.chavePix ? (
                  <button
                    type="button"
                    onClick={() => copiarPix(grupo)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors"
                  >
                    {copiadoId === grupo.id ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    {copiadoId === grupo.id
                      ? 'Código copiado'
                      : `Copiar PIX de ${formatar(grupo.total)}`}
                  </button>
                ) : (
                  // Fornecedor sem chave cadastrada: dizer o que falta, e de
                  // quem é o passo, em vez de esconder o botão sem explicação.
                  <p className="text-sm text-gray-500 dark:text-slate-400 flex-1">
                    Este fornecedor ainda não cadastrou a chave PIX no Portal
                    dele. Combine o pagamento direto com ele.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => marcarTodosPagos(grupo)}
                  disabled={quitandoId === grupo.id}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {quitandoId === grupo.id && <Loader2 className="w-4 h-4 animate-spin" />}
                  Marcar {grupo.pedidos.length} como pago
                  {grupo.pedidos.length > 1 ? 's' : ''}
                </button>
              </div>
            </div>
          ))}

          <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
            O código já vai com o valor e a chave certos. Cole no seu banco e
            confirme. O dinheiro sai da sua conta direto para a do fornecedor —
            o FORNEXA não passa no meio.
          </p>
        </div>
      )}
    </div>
  );
}
