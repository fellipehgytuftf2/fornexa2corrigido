import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PedidoTravado {
  pedido_id: string;
  criado_em: string;
  status: string;
  vendedor: string | null;
  email: string | null;
  fornecedor: string | null;
  origem_no_ml: string | null;
  cidade_do_fornecedor: string | null;
  liberado_em: string | null;
}

/**
 * Etiquetas barradas porque o envio sairia do endereço errado.
 *
 * POR QUE EXISTE
 *
 * A trava é certa: o remetente da etiqueta é para onde a devolução volta, e
 * sair com o endereço do vendedor faz a devolução bater na casa de quem não
 * tem o que fazer com ela. Mas às vezes a venda não pode esperar a correção, e
 * essa é uma decisão do dono — que antes dependia de alguém rodar um comando
 * no banco para cada pedido.
 *
 * Só aparece aqui pedido que a trava barrou de verdade: o sistema só descobre
 * a origem quando o fornecedor clica em Baixar etiqueta.
 */
export default function RemetenteTravado() {
  const [pedidos, setPedidos] = useState<PedidoTravado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mexendo, setMexendo] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  const carregar = async () => {
    setCarregando(true);
    setErro('');

    const { data, error } = await supabase.rpc('admin_pedidos_travados_no_remetente');

    setCarregando(false);

    if (error) {
      setErro(`Não foi possível carregar: ${error.message}`);
      return;
    }

    setPedidos((data as PedidoTravado[]) || []);
  };

  useEffect(() => {
    carregar();
  }, []);

  const alternar = async (pedido: PedidoTravado) => {
    setMexendo(pedido.pedido_id);
    setErro('');

    const { data, error } = await supabase.rpc('admin_liberar_remetente', {
      p_pedido_id: pedido.pedido_id,
      p_liberar: !pedido.liberado_em,
    });

    setMexendo(null);

    const resposta = data as { ok?: boolean; erro?: string } | null;

    if (error || resposta?.ok === false) {
      setErro(`Não foi possível: ${error?.message ?? resposta?.erro}`);
      return;
    }

    await carregar();
  };

  const quando = (valor: string) =>
    new Date(valor).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const travados = pedidos.filter((pedido) => !pedido.liberado_em);

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-navy-900 dark:text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-gold" aria-hidden="true" />
            Etiquetas travadas pelo endereço
          </h2>

          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            O envio sairia do endereço do vendedor, e não do galpão do
            fornecedor. Liberar faz a etiqueta sair assim mesmo.
          </p>
        </div>

        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {erro && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-3 leading-relaxed">{erro}</p>
      )}

      {carregando && pedidos.length === 0 ? (
        <div className="py-8 text-center">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin mx-auto" />
        </div>
      ) : pedidos.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-5">
          Nenhuma etiqueta travada pelo endereço.
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {pedidos.map((pedido) => {
            const liberado = Boolean(pedido.liberado_em);

            return (
              <li
                key={pedido.pedido_id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                  liberado
                    ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                    : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-navy-900 dark:text-white truncate">
                    {pedido.vendedor}
                  </p>

                  <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                    {pedido.email} · pedido de {quando(pedido.criado_em)}
                  </p>

                  {/* As duas cidades juntas: é o que decide a liberação. */}
                  <p className="text-xs text-gray-600 dark:text-slate-300 mt-1">
                    Sairia de <strong>{pedido.origem_no_ml || 'origem desconhecida'}</strong>
                    {' · '}
                    fornecedor em{' '}
                    <strong>{pedido.cidade_do_fornecedor || 'cidade não cadastrada'}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {liberado && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-300">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Liberado
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => alternar(pedido)}
                    disabled={mexendo === pedido.pedido_id}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                      liberado
                        ? 'border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700'
                        : 'bg-navy-900 dark:bg-gold text-white dark:text-navy-900 hover:opacity-90'
                    }`}
                  >
                    {mexendo === pedido.pedido_id
                      ? 'Salvando...'
                      : liberado
                        ? 'Voltar a travar'
                        : 'Liberar etiqueta'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* O preço da liberação, onde a decisão é tomada. */}
      {travados.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-4 leading-relaxed">
          Liberado, o pacote sai declarando o endereço do vendedor: devolução
          volta para a casa dele, não para o fornecedor. Depois de impressa, o
          Mercado Livre não deixa mais mudar. A correção definitiva é o vendedor
          trocar o endereço em Configurações → Meu perfil → Endereços.
        </p>
      )}
    </div>
  );
}
