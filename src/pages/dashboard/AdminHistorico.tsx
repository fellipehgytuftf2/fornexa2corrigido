import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, ScrollText, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * O que os vendedores andaram fazendo com os anúncios.
 *
 * Quem escreve aqui é um gatilho na tabela `user_products`, e não a tela: o
 * que passou pelo banco entrou no registro, tenha vindo do painel, de uma
 * função de borda ou do job da madrugada. Tela que se registra sozinha mente
 * por omissão justamente nos casos em que o histórico importa.
 *
 * Só o admin abre. A política da tabela recusa qualquer outro papel, então
 * isto aqui não é a trava — é só a leitura dela.
 */

interface Linha {
  id: string;
  criado_em: string;
  user_id: string | null;
  nome: string | null;
  email: string | null;
  plano: string | null;
  plan_status: string | null;
  acao: string;
  titulo: string | null;
  detalhes: Record<string, unknown> | null;
}

/** O nome da ação em português, e a cor que diz se ela é boa notícia. */
const ACOES: Record<string, { rotulo: string; cor: string }> = {
  anuncio_salvo: { rotulo: 'Salvou o produto', cor: 'bg-gray-100 text-gray-700 dark:bg-navy-700 dark:text-slate-300' },
  anuncio_publicado: { rotulo: 'Publicou no Mercado Livre', cor: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  titulo_alterado: { rotulo: 'Mudou o título', cor: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  preco_alterado: { rotulo: 'Mudou o preço', cor: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  anuncio_pausado: { rotulo: 'Pausou', cor: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
  anuncio_reativado: { rotulo: 'Reativou', cor: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  pausado_sem_estoque: { rotulo: 'Pausado por falta de estoque', cor: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
  anuncio_excluido: { rotulo: 'Excluiu', cor: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
};

const POR_PAGINA = 100;

const dinheiro = (valor: unknown) =>
  typeof valor === 'number'
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
    : String(valor ?? '—');

const quando = (iso: string) => {
  const data = new Date(iso);
  const minutos = Math.floor((Date.now() - data.getTime()) / 60000);

  if (minutos < 1) return 'agora';
  if (minutos < 60) return `${minutos} min atrás`;
  if (minutos < 1440) return `${Math.floor(minutos / 60)} h atrás`;

  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

/** O "de X para Y" de cada tipo de mudança, quando há. */
function Detalhe({ linha }: { linha: Linha }) {
  const d = linha.detalhes;

  if (!d) return null;

  if (linha.acao === 'preco_alterado') {
    return (
      <span className="text-gray-500 dark:text-slate-400">
        {dinheiro(d.de)} <span aria-hidden="true">·</span> {dinheiro(d.para)}
      </span>
    );
  }

  if (linha.acao === 'titulo_alterado') {
    return (
      <span className="text-gray-500 dark:text-slate-400 line-clamp-1">
        antes: {String(d.de ?? '—')}
      </span>
    );
  }

  if (linha.acao === 'anuncio_publicado' && d.ml_item_id) {
    return (
      <span className="font-mono text-gray-500 dark:text-slate-400">{String(d.ml_item_id)}</span>
    );
  }

  return null;
}

export default function AdminHistorico() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [acabou, setAcabou] = useState(false);
  const [erro, setErro] = useState('');
  const [acao, setAcao] = useState('');
  const [busca, setBusca] = useState('');

  const buscar = useCallback(
    async (antesDe: string | null) => {
      const { data, error } = await supabase.rpc('admin_historico', {
        p_limite: POR_PAGINA,
        p_antes_de: antesDe,
        p_user: null,
        p_acao: acao || null,
      });

      if (error) throw new Error(error.message);

      return (data as Linha[]) || [];
    },
    [acao]
  );

  useEffect(() => {
    let vivo = true;

    const primeira = async () => {
      setCarregando(true);
      setErro('');
      setAcabou(false);

      try {
        const dados = await buscar(null);

        if (!vivo) return;

        setLinhas(dados);
        setAcabou(dados.length < POR_PAGINA);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível carregar.');
      } finally {
        if (vivo) setCarregando(false);
      }
    };

    primeira();

    return () => {
      vivo = false;
    };
  }, [buscar]);

  /**
   * Paginação pela data da última linha, e não por OFFSET.
   *
   * O registro recebe linha nova o tempo todo: com OFFSET, uma gravação entre
   * duas páginas empurraria tudo e a pessoa veria a mesma linha duas vezes.
   */
  const carregarMais = async () => {
    const ultima = linhas[linhas.length - 1];

    if (!ultima) return;

    setCarregandoMais(true);

    try {
      const dados = await buscar(ultima.criado_em);

      setLinhas((atual) => [...atual, ...dados]);
      setAcabou(dados.length < POR_PAGINA);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar mais.');
    } finally {
      setCarregandoMais(false);
    }
  };

  // A busca peneira o que já está na tela. Não vai ao banco de propósito:
  // filtrar por nome lá exigiria varrer o histórico inteiro a cada tecla.
  const termo = busca.trim().toLowerCase();

  const visiveis = termo
    ? linhas.filter((l) =>
        [l.nome, l.email, l.titulo].some((campo) => campo?.toLowerCase().includes(termo))
      )
    : linhas;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-[14px] bg-gold/15 flex items-center justify-center shrink-0">
          <ScrollText className="w-5 h-5 text-gold" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-navy-900 dark:text-white">Histórico</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            O que cada vendedor fez com os anúncios dele, do mais recente para o mais antigo.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAcao('')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            acao === ''
              ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900'
              : 'border border-gray-200 dark:border-navy-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-navy-700'
          }`}
        >
          Tudo
        </button>

        {Object.entries(ACOES).map(([chave, { rotulo }]) => (
          <button
            key={chave}
            type="button"
            onClick={() => setAcao(chave)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              acao === chave
                ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900'
                : 'border border-gray-200 dark:border-navy-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-navy-700'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar o que está na tela por nome, e-mail ou anúncio..."
          className="w-full pl-10 pr-4 py-2.5 rounded-full bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 text-navy-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold"
        />
      </div>

      {erro && (
        <p className="flex items-start gap-2 rounded-[14px] border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {erro}
        </p>
      )}

      {carregando ? (
        <div className="flex items-center justify-center py-12 text-gray-500 dark:text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-gray-300 dark:border-navy-600 py-12 text-center">
          <p className="font-semibold text-navy-900 dark:text-white">Nada por aqui ainda</p>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            O registro começa a partir de agora: ele guarda o que acontecer daqui para frente, não
            o que já passou.
          </p>
        </div>
      ) : (
        <div className="rounded-[20px] border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-800 overflow-hidden">
          {visiveis.map((linha) => {
            const tipo = ACOES[linha.acao] ?? {
              rotulo: linha.acao,
              cor: 'bg-gray-100 text-gray-700 dark:bg-navy-700 dark:text-slate-300',
            };

            return (
              <div
                key={linha.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 border-b border-gray-100 dark:border-navy-700 last:border-0"
              >
                <span
                  className={`shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${tipo.cor}`}
                >
                  {tipo.rotulo}
                </span>

                <span className="text-sm text-navy-900 dark:text-white font-medium min-w-0 truncate">
                  {linha.titulo || '(sem título)'}
                </span>

                <span className="text-xs">
                  <Detalhe linha={linha} />
                </span>

                <span className="ml-auto flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
                  <span className="truncate max-w-[220px]">
                    {linha.nome}
                    {linha.plano && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide">
                        {linha.plano}
                      </span>
                    )}
                  </span>

                  <span className="tabular-nums whitespace-nowrap">{quando(linha.criado_em)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!carregando && !acabou && (
        <button
          type="button"
          onClick={carregarMais}
          disabled={carregandoMais}
          className="w-full py-2.5 rounded-full border border-gray-200 dark:border-navy-600 text-sm font-semibold text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {carregandoMais && <Loader2 className="w-4 h-4 animate-spin" />}
          Carregar mais
        </button>
      )}
    </div>
  );
}
