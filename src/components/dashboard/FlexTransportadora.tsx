import { useEffect, useState } from 'react';
import { CheckCircle, Clock, Loader2, MessageCircle, Truck, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ModalPortal from '../ui/modal-portal';

interface Parado {
  supplier_id: string;
  fornecedor: string | null;
  transportadora: string | null;
  contato: string | null;
  pedidos: number;
  /** O fornecedor conferiu com a transportadora e aprovou. */
  confirmado: boolean;
  /** Declarado pelo vendedor, esperando o fornecedor conferir. */
  declarado: boolean;
  /** O fornecedor consultou e não achou o cadastro. */
  recusado: boolean;
  observacao: string | null;
}

/**
 * O contato da transportadora, clicável quando dá.
 *
 * Telefone vira conversa no WhatsApp; endereço de site vira link. O resto sai
 * como texto — inventar um link a partir de um e-mail ou de uma instrução
 * escrita levaria a lugar nenhum, e um link que não leva a nada é pior que
 * texto que a pessoa copia.
 */
function linkDoContato(contato: string, mensagem: string): string | null {
  const limpo = contato.trim();

  if (/^https?:\/\//i.test(limpo)) {
    return limpo;
  }

  const digitos = limpo.replace(/\D/g, '');

  // 10 ou 11 dígitos é número brasileiro sem o país; 12 ou 13 já vem com ele.
  if (digitos.length >= 10 && digitos.length <= 13) {
    const numero = digitos.length <= 11 ? `55${digitos}` : digitos;

    // A conversa já abre escrita: quem não sabe o que pedir acaba não pedindo,
    // e o pedido segue parado enquanto a janela some da cabeça.
    return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
  }

  return null;
}

/**
 * Pedido Flex parado porque falta cadastro na transportadora do fornecedor.
 *
 * POR QUE O BOTÃO NÃO LIBERA SOZINHO
 *
 * Marcar "estou cadastrado" sem estar é fácil, e quem paga é o fornecedor: o
 * pacote sai da bancada e volta recusado. O FORNEXA não tem como conferir —
 * a transportadora não abre consulta de cadastro para terceiros.
 *
 * Quem consegue conferir é o fornecedor, dono da relação com ela. Então a
 * declaração do vendedor pede liberação, e não libera.
 */
export default function FlexTransportadora() {
  const [parados, setParados] = useState<Parado[]>([]);
  const [codigos, setCodigos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [janelaFechada, setJanelaFechada] = useState(false);

  const carregar = async () => {
    const { data, error } = await supabase.rpc('meus_pedidos_flex_parados');

    if (error) {
      // Falhar aqui não pode esconder os pedidos: o aviso é complemento.
      console.error('Erro ao carregar pedidos Flex:', error);
      return;
    }

    setParados((data as Parado[]) || []);
  };

  useEffect(() => {
    carregar();
  }, []);

  const declarar = async (parado: Parado) => {
    setEnviando(parado.supplier_id);
    setErro('');

    const { error } = await supabase.rpc('vendedor_confirma_transportadora', {
      p_supplier_id: parado.supplier_id,
      p_confirmado: true,
      p_codigo: codigos[parado.supplier_id] || null,
    });

    setEnviando(null);

    if (error) {
      setErro(`Não foi possível enviar: ${error.message}`);
      return;
    }

    await carregar();
  };

  const pendentes = parados.filter((parado) => !parado.confirmado);

  if (pendentes.length === 0) return null;

  // Esperando o fornecedor não pede ação nenhuma do vendedor: a janela só
  // aparece para quem ainda tem o que fazer.
  const pedemAcao = pendentes.filter((parado) => !parado.declarado);
  const total = pendentes.reduce((soma, parado) => soma + Number(parado.pedidos || 0), 0);

  const contato = (parado: Parado) => {
    if (!parado.contato) return null;

    const mensagem =
      `Olá! Vendo pelo Mercado Livre com o fornecedor ${parado.fornecedor} e ` +
      'preciso me cadastrar para despachar pedidos com o Mercado Envios Flex. ' +
      'O que precisa para fazer o cadastro?';

    const link = linkDoContato(parado.contato, mensagem);

    if (!link) {
      return (
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Contato da transportadora:{' '}
          <strong className="break-words">{parado.contato}</strong>
        </p>
      );
    }

    // Verde do WhatsApp, e não a cor do sistema: aqui a cor é informação —
    // diz para onde o clique leva antes de a pessoa ler o rótulo.
    return (
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-xl bg-[#25D366] px-4 py-3 text-white font-semibold hover:brightness-95 transition-[filter] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/60"
      >
        <MessageCircle className="w-5 h-5 shrink-0" aria-hidden="true" />

        <span className="min-w-0">
          <span className="block text-sm leading-tight">
            Falar com a {parado.transportadora} no WhatsApp
          </span>

          <span className="block text-xs font-normal text-white/85 tabular-nums break-words">
            {parado.contato} · mensagem já escrita
          </span>
        </span>
      </a>
    );
  };

  /** O bloco de ação, igual na janela e na faixa. */
  const acao = (parado: Parado) => {
    if (parado.declarado) {
      return (
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
          <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
          Esperando {parado.fornecedor} confirmar com a transportadora
        </p>
      );
    }

    return (
      <div className="space-y-3">
        {parado.recusado && (
          <p className="text-sm text-red-600 dark:text-red-400 leading-relaxed">
            {parado.fornecedor} consultou a transportadora e não encontrou seu
            cadastro.
            {parado.observacao ? ` Observação: ${parado.observacao}` : ''} Depois
            de se cadastrar, envie de novo.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id={`protocolo-${parado.supplier_id}`}
            value={codigos[parado.supplier_id] ?? ''}
            onChange={(evento) =>
              setCodigos((atuais) => ({
                ...atuais,
                [parado.supplier_id]: evento.target.value,
              }))
            }
            placeholder="Protocolo ou CNPJ do cadastro (opcional)"
            className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-600 text-sm text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
          />

          <button
            type="button"
            onClick={() => declarar(parado)}
            disabled={enviando === parado.supplier_id}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-gold text-white dark:text-navy-900 text-sm font-semibold hover:opacity-90 disabled:opacity-50 shrink-0"
          >
            {enviando === parado.supplier_id ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle className="w-4 h-4" aria-hidden="true" />
            )}
            Já estou cadastrado
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
          {parado.fornecedor} confere com a transportadora antes de liberar. O
          protocolo agiliza essa conferência.
        </p>
      </div>
    );
  };

  const texto = (parado: Parado) => (
    <>
      O envio Flex de {parado.fornecedor} é feito pela{' '}
      <strong>{parado.transportadora}</strong>, e ela só despacha para quem tem
      cadastro. Enquanto o cadastro não for confirmado, a etiqueta destes
      pedidos não libera.
    </>
  );

  return (
    <>
      {/* A janela aparece uma vez por visita e sai no primeiro fechar: quem já
          sabe não quer ser parado de novo a cada pedido que vem conferir. */}
      {!janelaFechada && pedemAcao.length > 0 && (
        <ModalPortal>
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 py-6">
            <div className="w-full max-w-lg max-h-full overflow-y-auto rounded-2xl bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 shadow-2xl">
              <div className="flex items-start justify-between gap-4 p-6 pb-0">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <Truck
                      className="w-5 h-5 text-amber-600 dark:text-amber-400"
                      aria-hidden="true"
                    />
                  </span>

                  <h2 className="text-lg font-bold text-navy-900 dark:text-white">
                    {total === 1
                      ? 'Você tem 1 pedido Flex parado'
                      : `Você tem ${total} pedidos Flex parados`}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setJanelaFechada(true)}
                  aria-label="Fechar"
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 pt-4 space-y-5">
                {pedemAcao.map((parado) => (
                  <div key={parado.supplier_id} className="space-y-3">
                    <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">
                      {texto(parado)}
                    </p>

                    {contato(parado)}

                    {acao(parado)}
                  </div>
                ))}

                {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      <div className="space-y-3">
        {pendentes.map((parado) => (
          <div
            key={parado.supplier_id}
            className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-5"
          >
            <div className="flex items-start gap-3">
              <Truck
                className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />

              <div className="min-w-0 flex-1">
                <p className="font-semibold text-navy-900 dark:text-white">
                  {Number(parado.pedidos) === 1
                    ? '1 pedido Flex parado'
                    : `${parado.pedidos} pedidos Flex parados`}
                </p>

                <p className="text-sm text-amber-800 dark:text-amber-200 mt-1 leading-relaxed">
                  {texto(parado)}
                </p>

                <div className="mt-3">{contato(parado)}</div>

                <div className="mt-4">{acao(parado)}</div>

                {erro && (
                  <p className="text-sm text-red-600 dark:text-red-400 mt-3">{erro}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
