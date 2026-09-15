import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Loader2, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface RepasseEmAberto {
  order_id: string;
  criado_em: string;
  produto: string | null;
  valor: number;
  dias_em_aberto: number;
  vendedor_nome: string | null;
  vendedor_email: string | null;
  fornecedor_nome: string | null;
  declarado_pago_em: string | null;
  recebimento_confirmado_em: string | null;
  divergente: boolean;
}

interface FornecedorPolitica {
  id: string;
  name: string;
  company_name: string | null;
  exige_pagamento_antecipado: boolean;
}

/**
 * Repasses em aberto e política de pagamento de cada fornecedor.
 *
 * Nenhum código impede um vendedor de receber do marketplace e não repassar —
 * o dinheiro nunca passa pela FORNEXA. O que esta tela dá é a única coisa que
 * a plataforma realmente tem: enxergar quem está devendo, e poder cortar o
 * acesso de quem age de má-fé.
 */
export default function RepassesAdmin() {
  const [repasses, setRepasses] = useState<RepasseEmAberto[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorPolitica[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const carregar = async () => {
    setCarregando(true);
    setErro('');

    const [lista, politicas] = await Promise.all([
      supabase.rpc('admin_repasses_em_aberto'),
      supabase
        .from('suppliers')
        .select('id, name, company_name, exige_pagamento_antecipado')
        .order('company_name'),
    ]);

    if (lista.error) {
      setErro(`Não foi possível carregar os repasses: ${lista.error.message}`);
    } else {
      setRepasses((lista.data as RepasseEmAberto[]) || []);
    }

    if (!politicas.error) {
      setFornecedores((politicas.data as FornecedorPolitica[]) || []);
    }

    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const alternarPolitica = async (fornecedor: FornecedorPolitica) => {
    setSalvandoId(fornecedor.id);
    setErro('');

    const exigir = !fornecedor.exige_pagamento_antecipado;

    const { error } = await supabase.rpc('admin_define_pagamento_antecipado', {
      p_supplier_id: fornecedor.id,
      p_exige: exigir,
    });

    setSalvandoId(null);

    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }

    setFornecedores((atuais) =>
      atuais.map((atual) =>
        atual.id === fornecedor.id
          ? { ...atual, exige_pagamento_antecipado: exigir }
          : atual
      )
    );
  };

  const formatarValor = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      Number(valor || 0)
    );

  const totalEmAberto = repasses.reduce((soma, r) => soma + Number(r.valor || 0), 0);
  const divergentes = repasses.filter((r) => r.divergente);

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-1">
        <Wallet className="w-5 h-5 text-gray-600 dark:text-slate-400" />

        <h2 className="text-lg font-semibold text-navy-900 dark:text-white">
          Repasses aos fornecedores
        </h2>
      </div>

      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
        O dinheiro da venda nunca passa pela FORNEXA — quem paga o fornecedor é o
        vendedor, por fora. Esta lista é o que a plataforma consegue ver.
      </p>

      {erro && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 mb-5">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{erro}</p>
        </div>
      )}

      {/* Política de cada fornecedor.
          Fica em cima porque decide o comportamento de tudo abaixo. */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-navy-900 dark:text-white mb-1">
          Exigir pagamento antes do despacho
        </h3>

        <p className="text-xs text-gray-500 dark:text-slate-400 mb-3 leading-relaxed">
          Ligado, o fornecedor só vê endereço e etiqueta depois de confirmar que
          recebeu — o produto não sai antes do dinheiro entrar. Em troca, o
          vendedor precisa pagar do próprio bolso, porque o marketplace só libera
          dias depois da entrega.
        </p>

        <div className="space-y-2">
          {fornecedores.map((fornecedor) => (
            <div
              key={fornecedor.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 dark:border-navy-600 px-4 py-3"
            >
              <p className="text-sm text-navy-900 dark:text-white">
                {fornecedor.company_name || fornecedor.name}
              </p>

              <button
                onClick={() => alternarPolitica(fornecedor)}
                disabled={salvandoId === fornecedor.id}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                  fornecedor.exige_pagamento_antecipado
                    ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-navy-600 dark:text-slate-300'
                }`}
              >
                {fornecedor.exige_pagamento_antecipado ? 'Exigindo' : 'Dando crédito'}
              </button>
            </div>
          ))}

          {fornecedores.length === 0 && !carregando && (
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Nenhum fornecedor cadastrado.
            </p>
          )}
        </div>
      </div>

      {/* Divergências primeiro: é a única lista onde uma mentira apareceria. */}
      {divergentes.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3.5 mb-5">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />

          <p className="text-sm text-amber-800 dark:text-amber-200">
            {divergentes.length === 1
              ? '1 pedido está declarado como pago pelo vendedor mas não foi confirmado pelo fornecedor.'
              : `${divergentes.length} pedidos estão declarados como pagos pelos vendedores mas não foram confirmados pelos fornecedores.`}{' '}
            Não prova má-fé — pode ser o fornecedor sem olhar o portal — mas é o
            lugar onde uma mentira apareceria.
          </p>
        </div>
      )}

      {carregando ? (
        <div className="flex items-center gap-3 text-gray-500 dark:text-slate-400 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Carregando...
        </div>
      ) : repasses.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400 py-8 text-center">
          Nenhum repasse em aberto.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
            {repasses.length} em aberto, somando{' '}
            <strong className="text-navy-900 dark:text-white">
              {formatarValor(totalEmAberto)}
            </strong>
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-navy-600">
                  <th className="pb-3 pr-4 font-medium">Vendedor</th>
                  <th className="pb-3 pr-4 font-medium">Fornecedor</th>
                  <th className="pb-3 pr-4 font-medium">Produto</th>
                  <th className="pb-3 pr-4 font-medium">Valor</th>
                  <th className="pb-3 pr-4 font-medium">Dias</th>
                  <th className="pb-3 font-medium">Situação</th>
                </tr>
              </thead>

              <tbody>
                {repasses.map((repasse) => (
                  <tr
                    key={repasse.order_id}
                    className="border-b border-gray-100 dark:border-navy-700 last:border-0"
                  >
                    <td className="py-3 pr-4">
                      <p className="text-navy-900 dark:text-white">
                        {repasse.vendedor_nome || '—'}
                      </p>

                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        {repasse.vendedor_email}
                      </p>
                    </td>

                    <td className="py-3 pr-4 text-gray-600 dark:text-slate-300">
                      {repasse.fornecedor_nome || '—'}
                    </td>

                    <td className="py-3 pr-4 text-gray-600 dark:text-slate-300">
                      {repasse.produto || '—'}
                    </td>

                    <td className="py-3 pr-4 text-navy-900 dark:text-white font-medium whitespace-nowrap">
                      {formatarValor(repasse.valor)}
                    </td>

                    <td
                      className={`py-3 pr-4 font-medium ${
                        repasse.dias_em_aberto > 15
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-600 dark:text-slate-300'
                      }`}
                    >
                      {repasse.dias_em_aberto}
                    </td>

                    <td className="py-3">
                      {repasse.divergente ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 whitespace-nowrap">
                          declarado, não confirmado
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-navy-600 dark:text-slate-300 whitespace-nowrap">
                          em aberto
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
