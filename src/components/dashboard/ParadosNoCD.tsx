import { useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, Loader2, Warehouse } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ProdutoParado {
  id: string;
  produto: string;
  imagem: string | null;
  valor: number;
  motivo: string;
  status: 'recebida' | 'avariada';
  codigo_devolucao: string | null;
  parado_desde: string;
  dias_parado: number;
}

const MOTIVOS: Record<string, string> = {
  arrependimento: 'Arrependimento do comprador',
  nao_entregue: 'Não entregue / devolvido pelos Correios',
  defeito: 'Defeito de fabricação',
  produto_errado: 'Produto errado',
};

/** A partir daqui o produto está parado tempo demais para ser esquecido. */
const MUITO_TEMPO = 45;

/**
 * Os produtos que voltaram e estão guardados no CD do fornecedor.
 *
 * Devolução por arrependimento não devolve dinheiro: o produto fica lá,
 * disponível para uma etiqueta nova. É crédito em produto, já pago — e some da
 * vista, porque no Financeiro a venda aparece como não vingada e o produto sai
 * dos números.
 *
 * O total no topo é o ponto da tela: dinheiro que o vendedor já gastou e não
 * está vendo em lugar nenhum.
 */
export default function ParadosNoCD() {
  const [itens, setItens] = useState<ProdutoParado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);
  const [marcandoId, setMarcandoId] = useState<string | null>(null);

  const carregar = async () => {
    setCarregando(true);

    const { data, error } = await supabase.rpc('meus_produtos_parados');

    setCarregando(false);

    if (error) {
      setErro(`Não foi possível carregar os produtos parados: ${error.message}`);
      return;
    }

    setItens((data as ProdutoParado[]) || []);
  };

  useEffect(() => {
    carregar();
  }, []);

  const marcarRevendido = async (item: ProdutoParado) => {
    setMarcandoId(item.id);
    setErro('');

    const { error } = await supabase.rpc('marcar_devolucao_revendida', {
      p_devolucao: item.id,
    });

    setMarcandoId(null);

    if (error) {
      setErro(`Não foi possível marcar: ${error.message}`);
      return;
    }

    setItens((atuais) => atuais.filter((atual) => atual.id !== item.id));
  };

  const formatarValor = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      Number(valor || 0)
    );

  // Nada parado é o normal. Não vale ocupar espaço na tela por isso.
  if (carregando || itens.length === 0) {
    return null;
  }

  const total = itens.reduce((soma, item) => soma + Number(item.valor || 0), 0);

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        aria-expanded={aberto}
        className="w-full flex items-center gap-3 p-5 text-left hover:bg-gray-50 dark:hover:bg-navy-700/50 transition-colors"
      >
        <Warehouse
          className="w-5 h-5 text-gray-600 dark:text-slate-400 shrink-0"
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-navy-900 dark:text-white">
            Parados no CD do fornecedor
          </p>

          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            {itens.length} produto{itens.length > 1 ? 's' : ''} guardado
            {itens.length > 1 ? 's' : ''} · {formatarValor(total)} já pagos e ainda
            não vendidos
          </p>
        </div>

        <ChevronDown
          className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${
            aberto ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {aberto && (
        <div className="border-t border-gray-200 dark:border-navy-700 p-5 space-y-3">
          {erro && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{erro}</p>
            </div>
          )}

          <ul className="space-y-3">
            {itens.map((item) => {
              const demorado = item.dias_parado >= MUITO_TEMPO;

              return (
                <li
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-gray-200 dark:border-navy-600 p-4"
                >
                  {item.imagem ? (
                    <img
                      src={item.imagem}
                      alt=""
                      className="w-12 h-12 rounded-xl object-cover bg-gray-100 dark:bg-navy-700 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-navy-700 shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-navy-900 dark:text-white font-medium truncate">
                      {item.produto}
                    </p>

                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
                      {formatarValor(item.valor)} ·{' '}
                      {MOTIVOS[item.motivo] ?? item.motivo} · parado há{' '}
                      {item.dias_parado} dia{item.dias_parado === 1 ? '' : 's'}
                    </p>

                    {item.status === 'avariada' && (
                      <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                        Voltou com a embalagem danificada. Confirme com o
                        fornecedor se ainda dá para vender.
                      </p>
                    )}

                    {demorado && item.status !== 'avariada' && (
                      <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                        Parado há bastante tempo. Confirme com o fornecedor se
                        ele ainda está guardando.
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => marcarRevendido(item)}
                    disabled={marcandoId === item.id}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-50 shrink-0"
                  >
                    {marcandoId === item.id && (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    )}
                    Vendi de novo
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
            Para vender de novo, mande uma etiqueta nova ao fornecedor citando o
            produto. Depois marque aqui — o sistema não tem como saber sozinho
            qual etiqueta é de qual produto guardado.
          </p>
        </div>
      )}
    </div>
  );
}
