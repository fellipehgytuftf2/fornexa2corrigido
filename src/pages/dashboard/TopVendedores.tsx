import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Crown, Loader2 } from 'lucide-react';
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
  /** Zero para quem já está no pódio. */
  falta_para_o_podio: number;
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
        supabase.rpc('ranking_vendedores', { p_periodo: periodo }),
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

  // "este mês", "esta semana", "no geral": a frase da posição muda com a aba,
  // senão ela diz uma coisa e a aba diz outra.
  const quando =
    periodo === 'semana' ? 'esta semana' : periodo === 'geral' ? 'no geral' : 'este mês';


  /**
   * O selo com o nome da conquista ao lado.
   *
   * Só o desenho não diz o que a pessoa conquistou — e é o nome que faz quem
   * está em quinto querer o selo de quem está em primeiro.
   */
  const conquistaComNome = (chave: string | null) => {
    if (!chave) return null;

    const conquista = conquistas[chave];

    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1">
        <Selo icone={conquista?.icone ?? 'estrela'} tamanho="p" />

        <span className="text-[11px] font-semibold text-navy-900 dark:text-gold">
          {conquista?.nome ?? 'Conquista'}
        </span>
      </span>
    );
  };

  /** O pódio: primeiro no meio e maior, como na premiação. */
  const cardDoPodio = (linha: LinhaDoRanking | undefined, lugar: 1 | 2 | 3) => {
    if (!linha) return <div className="hidden sm:block" />;

    const cores = {
      1: {
        borda: 'border-amber-300 dark:border-amber-500/60',
        fundo: 'bg-gradient-to-b from-amber-50 to-white dark:from-amber-500/15 dark:to-navy-800',
        anel: 'ring-2 ring-amber-300 dark:ring-amber-500/70',
        circulo: 'bg-amber-400 text-navy-900',
      },
      2: {
        borda: 'border-gray-300 dark:border-slate-500/60',
        fundo: 'bg-gradient-to-b from-gray-50 to-white dark:from-slate-500/10 dark:to-navy-800',
        anel: 'ring-2 ring-gray-300 dark:ring-slate-400/60',
        circulo: 'bg-gray-300 text-navy-900 dark:bg-slate-400',
      },
      3: {
        borda: 'border-orange-300 dark:border-orange-500/50',
        fundo: 'bg-gradient-to-b from-orange-50 to-white dark:from-orange-500/10 dark:to-navy-800',
        anel: 'ring-2 ring-orange-300 dark:ring-orange-500/60',
        circulo: 'bg-orange-300 text-navy-900 dark:bg-orange-400',
      },
    }[lugar];

    return (
      <div
        className={`relative rounded-2xl border ${cores.borda} ${cores.fundo} shadow-sm px-5 ${
          lugar === 1 ? 'pt-6 pb-5 sm:-mt-4' : 'pt-5 pb-5'
        } ${linha.sou_eu ? 'ring-2 ring-gold' : ''}`}
      >
        {lugar === 1 && (
          <Crown
            className="w-6 h-6 text-amber-500 absolute -top-3 left-1/2 -translate-x-1/2"
            aria-hidden="true"
          />
        )}

        {/* Número e foto lado a lado: a posição é a primeira coisa que se
            procura, e o rosto é o que identifica. */}
        <div className="flex items-center gap-3">
          <span
            className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${cores.circulo}`}
          >
            {lugar}
          </span>

          <Avatar
            foto={linha.foto_path}
            nome={linha.nome}
            tamanho={lugar === 1 ? 'g' : 'm'}
            anel={cores.anel}
          />

          <div className="min-w-0">
            <p className="font-semibold text-navy-900 dark:text-white truncate">
              {linha.sou_eu ? 'Você' : linha.nome}
            </p>

            <div className="mt-1">{conquistaComNome(linha.conquista)}</div>
          </div>
        </div>

        <p
          className={`font-bold tabular-nums mt-4 ${
            lugar === 1 ? 'text-2xl' : 'text-xl'
          } text-navy-900 dark:text-white`}
        >
          {linha.mostra_valor ? dinheiro(linha.faturamento) : '—'}
        </p>

        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{legenda}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-gold" aria-hidden="true" />
          Top Vendedores
        </h1>

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

          {/* Uma linha, e nenhum nome além dos três do pódio. Faturamento de
              outro vendedor é dado de negócio dele. */}
          <div className="text-center">
            <p className="text-sm font-medium text-navy-900 dark:text-white">
              {minha
                ? minha.posicao <= 3
                  ? `Parabéns! Você está em ${minha.posicao}º lugar ${quando}`
                  : `Você está em ${minha.posicao}º lugar ${quando}`
                : 'Faça sua primeira venda para entrar no ranking'}
            </p>

            {minha && Number(minha.falta_para_o_podio) > 0 && (
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                Faltam {dinheiro(minha.falta_para_o_podio)} para entrar no top 3
              </p>
            )}
          </div>
        </>
      )}

      <p className="text-xs text-gray-500 dark:text-slate-400">
        Resultados individuais. Não há garantia de ganho.
      </p>
    </div>
  );
}
