import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import EnderecoParaCopiar, { type PartesDoEndereco } from './EnderecoParaCopiar';

interface Props {
  supplierId: string;
  fornecedor: string;
  endereco: PartesDoEndereco;
  cepDoFornecedor: string | null;
  /** De onde os envios dele saíram, quando já houve venda provando o erro. */
  origemNoEnvio?: string | null;
  onCancelar: () => void;
  /** Chamado depois que a declaração foi aceita — a publicação segue daqui. */
  onDeclarado: () => void;
}

/**
 * O passo que falta antes da primeira publicação: configurar o remetente.
 *
 * A etiqueta sai com o endereço cadastrado na conta do vendedor no Mercado
 * Livre. Em dropshipping esse endereço precisa ser o do fornecedor — senão a
 * encomenda sai do galpão dele declarando a casa do vendedor, e a devolução
 * volta para quem não tem o que fazer com ela.
 *
 * POR QUE AQUI, E NÃO NA ETIQUETA
 *
 * Na etiqueta é tarde: o Mercado Livre congela o endereço do envio no momento
 * da venda, o pedido já está pago e o prazo de cancelamento correndo. Aqui o
 * vendedor está mexendo na loja, sem nada pendurado, com a conta do Mercado
 * Livre aberta — é o único momento em que arrumar isso é barato.
 *
 * ISTO NÃO É CONFERÊNCIA, E NÃO SE FINGE DE
 *
 * O CEP está na tela para copiar: dá para digitar sem sair do lugar. O que
 * este passo garante é que o vendedor SAIBA que essa configuração existe —
 * hoje a maioria não sabe — e que fique registrado quem declarou o quê.
 *
 * A conferência de verdade vem na primeira venda, quando o envio revela a
 * origem real. Ver `ml-endereco-de-envio` e `supplier-order-label`.
 */
export default function DeclararOrigem({
  supplierId,
  fornecedor,
  endereco,
  cepDoFornecedor,
  origemNoEnvio,
  onCancelar,
  onDeclarado,
}: Props) {
  const [cep, setCep] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const confirmar = async () => {
    setSalvando(true);
    setErro('');

    const { data, error } = await supabase.rpc('declarar_origem', {
      p_supplier_id: supplierId,
      p_cep: cep,
    });

    setSalvando(false);

    if (error) {
      setErro(error.message);
      return;
    }

    const resposta = data as { ok?: boolean; erro?: string } | null;

    if (!resposta?.ok) {
      setErro(resposta?.erro ?? 'Não foi possível salvar. Tente de novo.');
      return;
    }

    onDeclarado();
  };

  return createPortal(
    <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-navy-700 w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto shadow-xl">
        <div className="p-6">
          <p className="font-semibold text-navy-900 dark:text-white text-lg flex items-center gap-2">
            <MapPin className="w-5 h-5 text-amber-500" aria-hidden="true" />
            Antes de publicar, configure o remetente
          </p>

          {origemNoEnvio ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 mt-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />

              <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                Seu último envio saiu de <strong>{origemNoEnvio}</strong>. Enquanto
                for assim, o fornecedor não consegue baixar a etiqueta dos seus
                pedidos.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-slate-300 mt-2 leading-relaxed">
              Suas encomendas saem do galpão do fornecedor, não da sua casa. Se o
              Mercado Livre não souber disso, a etiqueta sai com o seu endereço —
              e as devoluções voltam para você.
            </p>
          )}

          <div className="rounded-xl border border-gray-200 dark:border-navy-600 p-4 mt-4">
            <p className="font-semibold text-navy-900 dark:text-white">{fornecedor}</p>

            <EnderecoParaCopiar partes={endereco} />
          </div>

          <ol className="mt-4 space-y-2 text-sm text-gray-600 dark:text-slate-300 leading-relaxed list-decimal list-inside">
            <li>
              No Mercado Livre, abra{' '}
              <strong className="text-navy-900 dark:text-white">
                Configurações → Meu perfil → Endereços
              </strong>
            </li>
            <li>Cadastre o endereço acima como origem dos seus envios</li>
            <li>Confirme abaixo o CEP que você cadastrou</li>
          </ol>

          <label
            htmlFor="cep-declarado"
            className="block text-xs font-semibold text-gray-500 dark:text-slate-400 mt-5 uppercase tracking-wide"
          >
            CEP cadastrado no Mercado Livre
          </label>

          <input
            id="cep-declarado"
            value={cep}
            onChange={(evento) => setCep(evento.target.value)}
            placeholder={cepDoFornecedor ?? '00000-000'}
            inputMode="numeric"
            className="w-full mt-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-900 text-navy-900 dark:text-white"
          />

          {erro && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 mt-3">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed">{erro}</p>
            </div>
          )}

          <div className="flex items-center gap-3 mt-6">
            <button
              type="button"
              onClick={confirmar}
              disabled={salvando || cep.trim().length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
              Já configurei, publicar
            </button>

            <button
              type="button"
              onClick={onCancelar}
              className="px-4 py-2.5 rounded-lg text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-700 text-sm font-semibold transition-colors"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
