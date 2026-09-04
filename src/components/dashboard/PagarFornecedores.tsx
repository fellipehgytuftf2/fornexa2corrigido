import { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, FileText, Loader2, Upload, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { montarCodigoPix } from '../../lib/pix';

export interface PedidoAPagar {
  id: string;
  user_id: string;
  product_name: string;
  supplier_price: number | null;
  supplier_id: string | null;
  pago_ao_fornecedor_em: string | null;
  comprovante_url: string | null;
  fornecedor?: {
    id: string;
    nome: string;
    cidade: string | null;
    chave_pix: string | null;
  } | null;
}

interface Props {
  pedidos: PedidoAPagar[];
  /**
   * Quem está logado.
   *
   * O admin enxerga os pedidos de todos os vendedores, e sem este filtro o
   * card somava dívida alheia. Dívida é de quem vendeu, não de quem olha.
   */
  usuarioId: string | null;
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
 * O que o vendedor deve, pedido a pedido.
 *
 * A primeira versão juntava tudo de um fornecedor num PIX só. Menos cliques,
 * menos lançamentos no extrato — e uma defesa mais fraca do outro lado.
 *
 * MED é o mecanismo em que quem pagou um PIX pede o dinheiro de volta alegando
 * fraude, e o valor é bloqueado na conta de quem recebeu. Para contestar, o
 * fornecedor precisa provar aquele pagamento ligado àquele pedido, com o
 * rastreio. Com cinco pedidos num PIX só, o comprovante mostra R$ 192,45 e o
 * pedido contestado vale R$ 17,36: os números não batem e a defesa cai.
 *
 * Então cada pedido tem o seu PIX, o seu identificador e o seu comprovante. Os
 * pedidos continuam agrupados por fornecedor na tela, mas só para achar — o
 * pagamento é um por um.
 */
export default function PagarFornecedores({ pedidos, usuarioId, onMudou }: Props) {
  const [aberto, setAberto] = useState(false);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  /** Qual pedido está esperando o arquivo escolhido no seletor. */
  const aguardandoArquivo = useRef<PedidoAPagar | null>(null);
  const seletorDeArquivo = useRef<HTMLInputElement | null>(null);

  const grupos = useMemo<Grupo[]>(() => {
    const porFornecedor = new Map<string, Grupo>();

    pedidos.forEach((pedido) => {
      const fornecedor = pedido.fornecedor;

      if (!fornecedor?.id || pedido.pago_ao_fornecedor_em) {
        return;
      }

      if (!usuarioId || pedido.user_id !== usuarioId) {
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
  }, [pedidos, usuarioId]);

  const formatar = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      Number(valor || 0)
    );

  const copiarPix = async (grupo: Grupo, pedido: PedidoAPagar) => {
    setErro('');
    setOcupadoId(pedido.id);

    // O identificador é criado no banco, não aqui. Ele precisa existir do lado
    // de lá para o aviso do PIX poder ser reconhecido depois — e precisa ser o
    // MESMO se o vendedor copiar duas vezes sem pagar, senão a mesma dívida
    // ganharia dois códigos e alguém pagaria duas vezes.
    const { data, error } = await supabase.rpc('abrir_repasse_do_pedido', {
      p_order_id: pedido.id,
    });

    setOcupadoId(null);

    const lote = (Array.isArray(data) ? data[0] : data) as
      | { txid?: string; valor?: number }
      | null;

    if (error || !lote?.txid) {
      setErro(error?.message ?? 'Não foi possível preparar o pagamento.');
      return;
    }

    const codigo = montarCodigoPix({
      chave: grupo.chavePix ?? '',
      nome: grupo.nome,
      cidade: grupo.cidade ?? 'BRASIL',
      valor: Number(lote.valor ?? pedido.supplier_price ?? 0),
      identificador: lote.txid,
    });

    if (!codigo) {
      setErro('Não foi possível montar o código PIX.');
      return;
    }

    await navigator.clipboard.writeText(codigo);
    setCopiadoId(pedido.id);
    window.setTimeout(() => setCopiadoId((atual) => (atual === pedido.id ? null : atual)), 2000);
  };

  const escolherComprovante = (pedido: PedidoAPagar) => {
    aguardandoArquivo.current = pedido;
    seletorDeArquivo.current?.click();
  };

  const enviarComprovante = async (arquivo: File) => {
    const pedido = aguardandoArquivo.current;
    aguardandoArquivo.current = null;

    if (!pedido) {
      return;
    }

    setOcupadoId(pedido.id);
    setErro('');

    const extensao = arquivo.name.split('.').pop() || 'jpg';
    const nome = `comprovantes/${pedido.id}-${Date.now()}.${extensao}`;

    const { error: envioError } = await supabase.storage
      .from('product-images')
      .upload(nome, arquivo, { cacheControl: '3600', upsert: false });

    if (envioError) {
      setOcupadoId(null);
      setErro(`Não foi possível enviar o comprovante: ${envioError.message}`);
      return;
    }

    const { data } = supabase.storage.from('product-images').getPublicUrl(nome);

    const { error } = await supabase
      .from('orders')
      .update({ comprovante_url: data.publicUrl })
      .eq('id', pedido.id);

    setOcupadoId(null);

    if (error) {
      setErro(`Não foi possível salvar o comprovante: ${error.message}`);
      return;
    }

    onMudou();
  };

  const marcarPago = async (pedido: PedidoAPagar) => {
    setOcupadoId(pedido.id);
    setErro('');

    const { error } = await supabase
      .from('orders')
      .update({ pago_ao_fornecedor_em: new Date().toISOString() })
      .eq('id', pedido.id);

    setOcupadoId(null);

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
  const quantosPedidos = grupos.reduce((soma, grupo) => soma + grupo.pedidos.length, 0);

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
      <input
        ref={seletorDeArquivo}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(evento) => {
          const arquivo = evento.target.files?.[0];
          evento.target.value = '';

          if (arquivo) {
            enviarComprovante(arquivo);
          }
        }}
      />

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
            {formatar(totalGeral)} em {quantosPedidos} pedido
            {quantosPedidos > 1 ? 's' : ''}
          </p>
        </div>

        <ChevronDown
          className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {aberto && (
        <div className="border-t border-gray-200 dark:border-navy-700 p-5 space-y-5">
          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

          {grupos.map((grupo) => (
            <div key={grupo.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <p className="font-semibold text-navy-900 dark:text-white">{grupo.nome}</p>

                <p className="text-sm text-gray-500 dark:text-slate-400 tabular-nums">
                  {formatar(grupo.total)} no total
                </p>
              </div>

              {!grupo.chavePix && (
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
                  Este fornecedor ainda não cadastrou a chave PIX no Portal dele.
                  Combine o pagamento direto com ele.
                </p>
              )}

              <ul className="space-y-3">
                {grupo.pedidos.map((pedido) => (
                  <li
                    key={pedido.id}
                    className="rounded-xl border border-gray-200 dark:border-navy-600 p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm text-navy-900 dark:text-white font-medium">
                        {pedido.product_name}
                      </p>

                      <p className="font-bold text-navy-900 dark:text-white tabular-nums shrink-0">
                        {formatar(Number(pedido.supplier_price || 0))}
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row flex-wrap gap-2 mt-3">
                      {grupo.chavePix && (
                        <button
                          type="button"
                          onClick={() => copiarPix(grupo, pedido)}
                          disabled={ocupadoId === pedido.id}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                          {copiadoId === pedido.id ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                          {copiadoId === pedido.id ? 'Código copiado' : 'Copiar PIX'}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => escolherComprovante(pedido)}
                        disabled={ocupadoId === pedido.id}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-50"
                      >
                        {ocupadoId === pedido.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : pedido.comprovante_url ? (
                          <FileText className="w-4 h-4" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        {pedido.comprovante_url ? 'Trocar comprovante' : 'Enviar comprovante'}
                      </button>

                      <button
                        type="button"
                        onClick={() => marcarPago(pedido)}
                        disabled={ocupadoId === pedido.id}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-50"
                      >
                        Marcar como pago
                      </button>
                    </div>

                    {pedido.comprovante_url && (
                      <a
                        href={pedido.comprovante_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-xs text-gray-500 dark:text-slate-400 underline underline-offset-2 mt-3"
                      >
                        Ver comprovante enviado
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* O porquê de ser um por um fica escrito: sem isso, a primeira
              pessoa a achar repetitivo vai querer juntar de novo. */}
          <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
            Um PIX por pedido, de propósito. Se alguém contestar um pagamento
            junto ao banco, o fornecedor precisa provar aquele PIX ligado
            àquele pedido e ao rastreio. Um pagamento somado não serve de prova
            para nenhum deles em separado.
          </p>
        </div>
      )}
    </div>
  );
}
