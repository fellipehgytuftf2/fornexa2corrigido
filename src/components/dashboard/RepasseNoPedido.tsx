import { useRef, useState } from 'react';
import { Check, Copy, FileText, Loader2, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { montarCodigoPix } from '../../lib/pix';

interface Props {
  order: {
    id: string;
    supplier_price: number;
    quantidade: number | null;
    pago_ao_fornecedor_em: string | null;
    comprovante_path: string | null;
    repasse_id: string | null;
  };
  fornecedor?: {
    nome: string;
    cidade: string | null;
    chave_pix: string | null;
  } | null;
  onMudou: () => void;
}

/**
 * O acerto com o fornecedor, dentro do próprio pedido.
 *
 * Antes isso vivia num painel separado no topo da tela, somando os pedidos de
 * um fornecedor. Duas coisas quebravam nisso: o vendedor tinha que sair do
 * pedido que estava olhando para pagar, e o pagamento somado enfraquece a
 * defesa do fornecedor num MED — para contestar, ele precisa provar aquele PIX
 * ligado àquele pedido e ao rastreio.
 *
 * A ORDEM DOS BOTÕES É A ORDEM DOS FATOS
 *
 *   copiar o PIX      → só então existe cobrança para comprovar
 *   enviar comprovante → só então há prova de que o dinheiro saiu
 *   marcar como pago   → o registro que o fornecedor vai conferir
 *
 * Cada passo destrava o seguinte. Liberados todos de uma vez, o caminho mais
 * fácil seria marcar como pago sem ter pago nada — e é justamente essa marca
 * que o fornecedor usa para liberar mercadoria.
 */
export default function RepasseNoPedido({ order, fornecedor, onMudou }: Props) {
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  const seletorDeArquivo = useRef<HTMLInputElement | null>(null);

  const valor = Number(order.supplier_price || 0) * Number(order.quantidade || 1);

  const formatar = (numero: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      Number(numero || 0)
    );

  // O destravamento olha para o banco, mas aceita o que acabou de acontecer
  // nesta tela: a cobrança nasce no clique e a lista só é relida depois. Sem
  // `copiado` aqui, o botão do comprovante continuaria travado até um F5.
  const cobrancaAberta = Boolean(order.repasse_id) || copiado;
  const temComprovante = Boolean(order.comprovante_path);
  const pago = Boolean(order.pago_ao_fornecedor_em);

  const copiarPix = async () => {
    setErro('');
    setOcupado(true);

    // O identificador nasce no banco e é reaproveitado: copiar duas vezes sem
    // pagar tem que dar o mesmo código, senão a mesma dívida ganha duas
    // cobranças e alguém paga duas vezes.
    const { data, error } = await supabase.rpc('abrir_repasse_do_pedido', {
      p_order_id: order.id,
    });

    setOcupado(false);

    const lote = (Array.isArray(data) ? data[0] : data) as
      | { txid?: string; valor?: number }
      | null;

    if (error || !lote?.txid) {
      setErro(error?.message ?? 'Não foi possível preparar o pagamento.');
      return;
    }

    const codigo = montarCodigoPix({
      chave: fornecedor?.chave_pix ?? '',
      nome: fornecedor?.nome ?? 'FORNECEDOR',
      cidade: fornecedor?.cidade ?? 'BRASIL',
      valor: Number(lote.valor ?? valor),
      identificador: lote.txid,
    });

    if (!codigo) {
      setErro('Não foi possível montar o código PIX.');
      return;
    }

    await navigator.clipboard.writeText(codigo);

    // Fica verde e assim continua. Voltar a "Copiar PIX" depois de dois
    // segundos apagaria a única marca de que este pedido já foi cobrado — e é
    // ela que diz ao vendedor onde ele parou numa lista de dez pedidos.
    //
    // Aqui não se recarrega a lista: recarregar remonta este bloco do zero e o
    // botão voltaria ao começo no instante seguinte ao clique.
    setCopiado(true);
  };

  const enviarComprovante = async (arquivo: File) => {
    setOcupado(true);
    setErro('');

    const extensao = arquivo.name.split('.').pop() || 'jpg';
    const caminho = `${order.id}/${Date.now()}.${extensao}`;

    // Bucket fechado: o arquivo não abre por endereço. Quem abre é a função
    // que confere de quem é o pedido.
    const { error: envioError } = await supabase.storage
      .from('comprovantes')
      .upload(caminho, arquivo, { cacheControl: '3600', upsert: false });

    if (envioError) {
      setOcupado(false);
      setErro(`Não foi possível enviar o comprovante: ${envioError.message}`);
      return;
    }

    // Guarda o caminho, nunca um endereço: endereço guardado continua valendo
    // depois de vazar.
    const { error } = await supabase
      .from('orders')
      .update({ comprovante_path: caminho })
      .eq('id', order.id);

    setOcupado(false);

    if (error) {
      setErro(`Não foi possível salvar o comprovante: ${error.message}`);
      return;
    }

    onMudou();
  };

  const abrirComprovante = async () => {
    setErro('');

    const { data, error } = await supabase.functions.invoke<{ url?: string }>(
      'comprovante-link',
      { body: { order_id: order.id } }
    );

    if (error || !data?.url) {
      setErro('Não foi possível abrir o comprovante.');
      return;
    }

    window.open(data.url, '_blank', 'noopener,noreferrer');
  };

  const alternarPago = async () => {
    setOcupado(true);
    setErro('');

    const { error } = await supabase
      .from('orders')
      .update({ pago_ao_fornecedor_em: pago ? null : new Date().toISOString() })
      .eq('id', order.id);

    setOcupado(false);

    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }

    onMudou();
  };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 dark:border-navy-600 p-4">
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

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-gray-500 dark:text-slate-400">Repasse ao fornecedor</p>

        <p className="text-sm font-semibold text-navy-900 dark:text-white tabular-nums">
          {formatar(valor)}

          {pago ? (
            <span className="ml-2 text-xs font-medium text-green-600 dark:text-green-400">
              pago em{' '}
              {new Date(order.pago_ao_fornecedor_em as string).toLocaleDateString('pt-BR')}
            </span>
          ) : (
            <span className="ml-2 text-xs font-medium text-amber-600 dark:text-amber-400">
              em aberto
            </span>
          )}
        </p>
      </div>

      {erro && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{erro}</p>}

      {!fornecedor?.chave_pix && (
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
          Este fornecedor ainda não cadastrou a chave PIX no Portal dele. Combine
          o pagamento direto com ele.
        </p>
      )}

      <div className="flex flex-col sm:flex-row flex-wrap gap-2 mt-3">
        {fornecedor?.chave_pix && (
          <button
            type="button"
            onClick={copiarPix}
            disabled={ocupado || pago}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors disabled:opacity-50 ${
              copiado ? 'bg-green-600 hover:bg-green-700' : 'bg-black hover:bg-gray-900'
            }`}
          >
            {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiado ? 'PIX copiado' : 'Copiar PIX'}
          </button>
        )}

        <button
          type="button"
          onClick={() => seletorDeArquivo.current?.click()}
          disabled={ocupado || !cobrancaAberta}
          title={
            cobrancaAberta ? undefined : 'Copie o PIX primeiro — é ele que gera a cobrança.'
          }
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-40"
        >
          {ocupado ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : temComprovante ? (
            <FileText className="w-4 h-4" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {temComprovante ? 'Trocar comprovante' : 'Enviar comprovante'}
        </button>

        <button
          type="button"
          onClick={alternarPago}
          disabled={ocupado || (!temComprovante && !pago)}
          title={
            temComprovante || pago
              ? undefined
              : 'Envie o comprovante primeiro — é a prova que o fornecedor precisa.'
          }
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-40"
        >
          {pago ? 'Desmarcar pagamento' : 'Marcar como pago'}
        </button>

        {temComprovante && (
          <button
            type="button"
            onClick={abrirComprovante}
            className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-gray-500 dark:text-slate-400 underline underline-offset-2 hover:text-navy-900 dark:hover:text-white transition-colors"
          >
            Ver comprovante
          </button>
        )}
      </div>
    </div>
  );
}
