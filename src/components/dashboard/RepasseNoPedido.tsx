import { useRef, useState } from 'react';
import { Check, Copy, FileText, Loader2, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { montarCodigoPix } from '../../lib/pix';

interface Props {
  order: {
    id: string;
    supplier_price: number;
    quantidade: number | null;
    taxa_embalagem: number | null;
    pago_ao_fornecedor_em: string | null;
    recebimento_confirmado_em: string | null;
    comprovante_path: string | null;
    repasse_id: string | null;
  };
  fornecedor?: {
    nome: string;
    cidade: string | null;
    chave_pix: string | null;
  } | null;
  /**
   * O pedido é de quem está olhando.
   *
   * O admin enxerga os pedidos de todo mundo, mas o repasse é o pagamento do
   * VENDEDOR: as funções só encontram pedido de quem chamou, e os botões
   * respondiam "pedido não encontrado" — que soa defeito e é regra.
   */
  souODono: boolean;
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
export default function RepasseNoPedido({ order, fornecedor, souODono, onMudou }: Props) {
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  const seletorDeArquivo = useRef<HTMLInputElement | null>(null);

  // O mesmo que `abrir_repasse_do_pedido` calcula no banco: produto vezes a
  // quantidade, mais UMA embalagem — três peças no mesmo pacote levam uma só.
  //
  // Repetir a conta aqui incomoda, e a alternativa incomoda mais: o valor
  // precisa aparecer antes de o vendedor clicar em nada, e o PIX só nasce no
  // clique. Se as duas contas divergirem, é esta que está errada.
  const embalagem = Number(order.taxa_embalagem || 0);
  const produto = Number(order.supplier_price || 0) * Number(order.quantidade || 1);
  const valor = produto + embalagem;

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

  /**
   * O fornecedor conferiu e confirmou. Daqui não se mexe mais.
   *
   * Enquanto dava para trocar o comprovante depois disso, o vendedor podia
   * conferir um arquivo e guardar outro — e a tela seguiria dizendo
   * "confirmado" sobre um comprovante que ninguém viu.
   */
  const fechado = Boolean(order.recebimento_confirmado_em) || !souODono;

  /**
   * Qual dos três é o passo de agora.
   *
   * Só ele fica em destaque. Com os três iguais, "Marcar como pago" tinha o
   * mesmo peso visual de "Trocar comprovante" — e é o único deles que avisa o
   * fornecedor e não deveria ser clicado por engano.
   */
  const proximoPasso: 'copiar' | 'comprovante' | 'pagar' | null = pago
    ? null
    : !cobrancaAberta
      ? 'copiar'
      : !temComprovante
        ? 'comprovante'
        : 'pagar';

  const destaque =
    'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors disabled:opacity-50';

  const neutro =
    'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-40';

  // Desfazer é a única ação de um pedido já pago, então precisa ser achável.
  // Em âmbar e não em preto: preto na tela toda quer dizer "faça isto agora", e
  // desmarcar um pagamento não é o que se espera de quem abriu o pedido.
  const desfazer =
    'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-sm font-semibold transition-colors disabled:opacity-40';

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

    // Marcar é uma escrita só. Desfazer são três, e precisam acontecer juntas:
    // a data do pagamento, a confirmação do fornecedor e o status do lote.
    // Enquanto isto era um update direto, desmarcar deixava o pedido liberado
    // para despacho por um pagamento que o vendedor acabara de retirar.
    const { error } = pago
      ? (await supabase.rpc('desfazer_pagamento_do_pedido', { p_order_id: order.id }))
      : (await supabase
          .from('orders')
          .update({ pago_ao_fornecedor_em: new Date().toISOString() })
          .eq('id', order.id));

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

          {/* Sem isto o vendedor vê um total que não bate com o preço do
              produto e não descobre sozinho de onde vieram os centavos a
              mais. */}
          {embalagem > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-500 dark:text-slate-400">
              ({formatar(produto)} + {formatar(embalagem)} de embalagem)
            </span>
          )}

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
            disabled={ocupado || pago || fechado}
            className={
              copiado
                ? 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-50'
                : proximoPasso === 'copiar'
                  ? destaque
                  : neutro
            }
          >
            {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiado ? 'PIX copiado' : 'Copiar PIX'}
          </button>
        )}

        {!fechado && (
        <button
          type="button"
          onClick={() => seletorDeArquivo.current?.click()}
          disabled={ocupado || !cobrancaAberta}
          title={
            cobrancaAberta ? undefined : 'Copie o PIX primeiro — é ele que gera a cobrança.'
          }
          className={proximoPasso === 'comprovante' ? destaque : neutro}
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
        )}

        {!fechado && (
        <button
          type="button"
          onClick={alternarPago}
          disabled={ocupado || (!temComprovante && !pago)}
          title={
            temComprovante || pago
              ? 'Avisa o fornecedor. Só a partir daqui ele vê o comprovante e confirma.'
              : 'Envie o comprovante primeiro — é a prova que o fornecedor precisa.'
          }
          className={pago ? desfazer : proximoPasso === 'pagar' ? destaque : neutro}
        >
          {pago ? 'Desmarcar pagamento' : 'Marcar como pago'}
        </button>
        )}

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

      {/* Diz onde termina a preparação e começa o compromisso. Sem isto, o
          vendedor não tem como saber que copiar e anexar são passos privados. */}
      {/* Quem não é dono vê o valor e o comprovante, e nada mais: pagar é ato
          do vendedor, e o admin clicando aqui levaria "pedido não encontrado"
          — que soa defeito e é regra. */}
      {!souODono && (
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-3 leading-relaxed">
          Este repasse é do vendedor. Você vê como está, mas quem copia o PIX,
          anexa o comprovante e marca como pago é ele.
        </p>
      )}

      {/* Botão que some sem explicação parece defeito. Aqui sumiram três, e o
          motivo é o oposto de defeito: o acerto fechou. */}
      {souODono && fechado && (
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-3 leading-relaxed">
          O fornecedor confirmou que recebeu em{' '}
          {new Date(order.recebimento_confirmado_em as string).toLocaleDateString('pt-BR')}
          . O pagamento está fechado — o comprovante continua aqui, mas não dá
          mais para trocá-lo nem desmarcar. Se houve engano, fale com o
          fornecedor.
        </p>
      )}

      {!pago && (
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-3 leading-relaxed">
          {temComprovante
            ? 'Falta avisar o fornecedor: "Marcar como pago" é o que mostra o comprovante a ele e libera a confirmação do outro lado.'
            : 'Copiar o PIX e anexar o comprovante ficam só com você. O fornecedor só é avisado quando você marcar como pago.'}
        </p>
      )}
    </div>
  );
}
