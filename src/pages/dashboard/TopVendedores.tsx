import { useCallback, useEffect, useMemo, useState } from 'react';
import { Crown, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Avatar from '../../components/conquistas/Avatar';
import Selo from '../../components/conquistas/Selo';

interface LinhaDoRanking {
  posicao: number;
  user_id: string;
  nome: string | null;
  foto_path: string | null;
  faturamento: number;
  mostra_valor: boolean;
  conquista: string | null;
  sou_eu: boolean;
}

interface MinhaPosicao {
  posicao: number;
  faturamento: number;
  total_de_vendedores: number;
}

interface Conquista {
  chave: string;
  nome: string;
  icone: string;
}

const PERIODOS = [
  { id: 'mes', rotulo: 'Este mês', legenda: 'Faturamento do mês' },
  { id: 'semana', rotulo: 'Semana', legenda: 'Faturamento da semana' },
  { id: 'geral', rotulo: 'Geral', legenda: 'Faturamento total' },
] as const;

/** De quanto em quanto tempo a lista se atualiza sozinha. */
const SEGUNDOS = 30;

const dinheiro = (valor: number) =>
  `R$ ${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

/**
 * O ranking de vendedores.
 *
 * POR QUE EXISTE
 *
 * O vendedor não tem com o que comparar o próprio resultado: R$ 4.000 no mês é
 * muito ou pouco? Sem referência, quem está indo bem acha que está parado, e
 * quem está parado não sabe o quanto dá para crescer.
 *
 * POR QUE NÃO É PLACAR GUARDADO
 *
 * A lista soma os pedidos a cada consulta. Estorno derruba a posição sozinho,
 * sem ninguém precisar recalcular nada.
 *
 * PRIVACIDADE
 *
 * Quem aparece, e como, é escolha de cada um no perfil. O banco já devolve o
 * apelido ou "Vendedor anônimo"; esta tela nunca vê e-mail nem telefone.
 */
export default function TopVendedores() {
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]['id']>('mes');
  const [linhas, setLinhas] = useState<LinhaDoRanking[]>([]);
  const [minha, setMinha] = useState<MinhaPosicao | null>(null);
  const [conquistas, setConquistas] = useState<Record<string, Conquista>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true);
      setErro('');

      const [ranking, posicao] = await Promise.all([
        supabase.rpc('ranking_vendedores', { p_periodo: periodo, p_limite: 20 }),
        supabase.rpc('minha_posicao_no_ranking', { p_periodo: periodo }),
      ]);

      setCarregando(false);

      if (ranking.error) {
        setErro(`Não foi possível carregar o ranking: ${ranking.error.message}`);
        return;
      }

      setLinhas((ranking.data as LinhaDoRanking[]) || []);
      setMinha(((posicao.data as MinhaPosicao[]) || [])[0] ?? null);
    },
    [periodo]
  );

  useEffect(() => {
    carregar();

    // Atualização sozinha, sem WebSocket: para uma lista que muda a cada venda,
    // meio minuto de atraso não muda decisão nenhuma e custa uma consulta.
    const relogio = window.setInterval(() => carregar(true), SEGUNDOS * 1000);

    const aoVoltar = () => {
      if (document.visibilityState === 'visible') carregar(true);
    };

    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      window.clearInterval(relogio);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [carregar]);

  useEffect(() => {
    const carregarConquistas = async () => {
      const { data } = await supabase.rpc('minhas_conquistas');

      const mapa: Record<string, Conquista> = {};

      ((data as Conquista[]) || []).forEach((conquista) => {
        mapa[conquista.chave] = conquista;
      });

      setConquistas(mapa);
    };

    carregarConquistas();
  }, []);

  const legenda = PERIODOS.find((p) => p.id === periodo)?.legenda ?? 'Faturamento';

  const podio = useMemo(() => linhas.slice(0, 3), [linhas]);
  const resto = useMemo(() => linhas.slice(3), [linhas]);

  // Quem está fora do top aparece no rodapé: era a única pergunta que a
  // pessoa tinha ao abrir esta tela.
  const estouNaLista = linhas.some((linha) => linha.sou_eu);

  const selo = (chave: string | null, tamanho: 'p' | 'm' | 'g') => {
    if (!chave) return null;

    const conquista = conquistas[chave];

    return (
      <Selo
        icone={conquista?.icone ?? 'estrela'}
        tamanho={tamanho}
        titulo={conquista?.nome ?? 'Conquista'}
      />
    );
  };

  /** O pódio: primeiro no meio e maior, como na premiação. */
  const cardDoPodio = (linha: LinhaDoRanking | undefined, lugar: 1 | 2 | 3) => {
    if (!linha) return <div className="hidden sm:block" />;

    const cores = {
      1: {
        borda: 'border-amber-300 dark:border-amber-500/60',
        fundo: 'bg-gradient-to-b from-amber-50 to-white dark:from-amber-500/15 dark:to-navy-800',
        anel: 'ring-4 ring-amber-300 dark:ring-amber-500/70',
        texto: 'text-amber-700 dark:text-amber-300',
      },
      2: {
        borda: 'border-gray-300 dark:border-slate-500/60',
        fundo: 'bg-gradient-to-b from-gray-50 to-white dark:from-slate-500/10 dark:to-navy-800',
        anel: 'ring-4 ring-gray-300 dark:ring-slate-400/60',
        texto: 'text-gray-600 dark:text-slate-300',
      },
      3: {
        borda: 'border-orange-300 dark:border-orange-500/50',
        fundo: 'bg-gradient-to-b from-orange-50 to-white dark:from-orange-500/10 dark:to-navy-800',
        anel: 'ring-4 ring-orange-300 dark:ring-orange-500/60',
        texto: 'text-orange-700 dark:text-orange-300',
      },
    }[lugar];

    return (
      <div
        className={`relative rounded-2xl border ${cores.borda} ${cores.fundo} shadow-sm px-5 text-center ${
          lugar === 1 ? 'pt-9 pb-7 sm:-mt-6' : 'pt-7 pb-6'
        } ${linha.sou_eu ? 'ring-2 ring-gold' : ''}`}
      >
        {lugar === 1 && (
          <Crown
            className="w-7 h-7 text-amber-500 mx-auto -mt-3 mb-1"
            aria-hidden="true"
          />
        )}

        <div className="flex justify-center">
          <Avatar
            foto={linha.foto_path}
            nome={linha.nome}
            tamanho={lugar === 1 ? 'gg' : 'g'}
            anel={cores.anel}
          />
        </div>

        <p className={`font-mono text-xs font-semibold mt-3 ${cores.texto}`}>
          {lugar}º lugar
        </p>

        <p className="font-semibold text-navy-900 dark:text-white mt-1 truncate">
          {linha.sou_eu ? 'Você' : linha.nome}
        </p>

        <div className="flex justify-center mt-2">{selo(linha.conquista, lugar === 1 ? 'm' : 'p')}</div>

        <p
          className={`font-bold tabular-nums mt-3 ${
            lugar === 1 ? 'text-2xl' : 'text-xl'
          } text-navy-900 dark:text-white`}
        >
          {linha.mostra_valor ? dinheiro(linha.faturamento) : '—'}
        </p>

        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{legenda}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-900 dark:text-white">Top Vendedores</h1>

        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
          Ranking atualizado em tempo real
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERIODOS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPeriodo(item.id)}
            aria-pressed={periodo === item.id}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              periodo === item.id
                ? 'bg-navy-900 dark:bg-gold text-white dark:text-navy-900'
                : 'border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700'
            }`}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

      {carregando && linhas.length === 0 ? (
        <div className="py-16 text-center">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin mx-auto" />
        </div>
      ) : linhas.length === 0 ? (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-10 text-center">
          <p className="text-gray-500 dark:text-slate-400">
            Ainda não há vendas confirmadas neste período. A primeira venda entra
            no ranking assim que o pagamento for aprovado.
          </p>
        </div>
      ) : (
        <>
          {/* 2º à esquerda, 1º no meio e maior, 3º à direita. No celular a
              ordem vira 1º, 2º, 3º: empilhado, o pódio perde o sentido. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:items-end">
            <div className="order-2 sm:order-1">{cardDoPodio(podio[1], 2)}</div>
            <div className="order-1 sm:order-2">{cardDoPodio(podio[0], 1)}</div>
            <div className="order-3">{cardDoPodio(podio[2], 3)}</div>
          </div>

          {resto.length > 0 && (
            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-navy-700">
                      <th className="px-5 py-3 w-14">#</th>
                      <th className="px-5 py-3">Vendedor</th>
                      <th className="px-5 py-3">Faturamento</th>
                      <th className="px-5 py-3">Conquista</th>
                    </tr>
                  </thead>

                  <tbody>
                    {resto.map((linha) => (
                      <tr
                        key={linha.user_id}
                        className={`border-b border-gray-100 dark:border-navy-700/60 last:border-0 ${
                          linha.sou_eu ? 'bg-gold/10' : ''
                        }`}
                      >
                        <td className="px-5 py-3 font-mono tabular-nums text-gray-500 dark:text-slate-400">
                          {linha.posicao}
                        </td>

                        <td className="px-5 py-3">
                          <span className="flex items-center gap-3 min-w-0">
                            <Avatar foto={linha.foto_path} nome={linha.nome} tamanho="p" />

                            <span className="font-medium text-navy-900 dark:text-white truncate">
                              {linha.sou_eu ? 'Você' : linha.nome}
                            </span>
                          </span>
                        </td>

                        <td className="px-5 py-3 font-semibold tabular-nums text-navy-900 dark:text-white">
                          {linha.mostra_valor ? dinheiro(linha.faturamento) : '—'}
                        </td>

                        <td className="px-5 py-3">{selo(linha.conquista, 'p')}</td>
                      </tr>
                    ))}

                    {/* Fora do top: a linha da pessoa no rodapé da lista. */}
                    {!estouNaLista && minha && (
                      <tr className="bg-gold/10 border-t-2 border-gold/40">
                        <td className="px-5 py-3 font-mono tabular-nums text-navy-900 dark:text-white">
                          {minha.posicao}
                        </td>

                        <td className="px-5 py-3 font-medium text-navy-900 dark:text-white">
                          Você
                        </td>

                        <td className="px-5 py-3 font-semibold tabular-nums text-navy-900 dark:text-white">
                          {dinheiro(minha.faturamento)}
                        </td>

                        <td className="px-5 py-3 text-xs text-gray-500 dark:text-slate-400">
                          de {minha.total_de_vendedores} vendedores
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-gray-500 dark:text-slate-400">
        Resultados individuais. Não há garantia de ganho.
      </p>
    </div>
  );
}
