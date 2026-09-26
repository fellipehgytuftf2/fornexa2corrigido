import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, Truck } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Parado {
  supplier_id: string;
  fornecedor: string | null;
  transportadora: string | null;
  contato: string | null;
  pedidos: number;
  confirmado: boolean;
}

/**
 * Pedido Flex parado porque falta cadastro na transportadora do fornecedor.
 *
 * POR QUE EXISTE
 *
 * Flex é entrega no mesmo dia, e quem despacha é a transportadora do
 * fornecedor — que só aceita quem tem cadastro prévio com ela. O vendedor liga
 * o Flex na conta do Mercado Livre sem saber disso, a venda chega, e o pacote
 * empaca na bancada do fornecedor.
 *
 * O aviso vem com o contato da transportadora porque avisar sem dizer para
 * quem ligar empurra o problema de volta para quem não sabe resolvê-lo.
 */
export default function FlexTransportadora() {
  const [parados, setParados] = useState<Parado[]>([]);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [erro, setErro] = useState('');

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

  const confirmar = async (parado: Parado) => {
    setConfirmando(parado.supplier_id);
    setErro('');

    const { error } = await supabase.rpc('vendedor_confirma_transportadora', {
      p_supplier_id: parado.supplier_id,
      p_confirmado: true,
    });

    setConfirmando(null);

    if (error) {
      setErro(`Não foi possível confirmar: ${error.message}`);
      return;
    }

    await carregar();
  };

  const pendentes = parados.filter((parado) => !parado.confirmado);

  if (pendentes.length === 0) return null;

  return (
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
                {parado.pedidos === 1
                  ? '1 pedido Flex parado'
                  : `${parado.pedidos} pedidos Flex parados`}
              </p>

              <p className="text-sm text-amber-800 dark:text-amber-200 mt-1 leading-relaxed">
                O envio Flex de {parado.fornecedor} é feito pela{' '}
                <strong>{parado.transportadora}</strong>, e ela só despacha para
                quem tem cadastro. Enquanto você não se cadastrar, a etiqueta
                destes pedidos não libera.
              </p>

              {parado.contato && (
                <p className="text-sm text-amber-800 dark:text-amber-200 mt-2">
                  Contato da transportadora:{' '}
                  <strong className="break-words">{parado.contato}</strong>
                </p>
              )}

              <button
                type="button"
                onClick={() => confirmar(parado)}
                disabled={confirmando === parado.supplier_id}
                className="inline-flex items-center gap-2 mt-4 px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-gold text-white dark:text-navy-900 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {confirmando === parado.supplier_id ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle className="w-4 h-4" aria-hidden="true" />
                )}
                Já estou cadastrado
              </button>

              {erro && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-3">{erro}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
