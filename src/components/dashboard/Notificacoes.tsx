import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Notificacao {
  id: string;
  titulo: string;
  corpo: string;
  link_rotulo: string | null;
  link_para: string | null;
  criado_em: string;
  lida: boolean;
}

/**
 * O sino de avisos, ao lado do tema.
 *
 * POR QUE EXISTE, SE JÁ HÁ A JANELA
 *
 * A janela aparece uma vez e some. Quem a fecha sem prestar atenção — e é o
 * que se faz com janela que aparece na frente do trabalho — não tem como
 * voltar a ela. Um aviso que só existe por três segundos é um aviso que metade
 * da base nunca leu.
 *
 * SÓ OS TÍTULOS
 *
 * Com o texto inteiro aberto, dois avisos já enchiam a tela e viravam um bloco
 * que ninguém lê. Cada um aparece fechado e abre no clique: a lista responde
 * "o que chegou" numa olhada, e o texto fica para quem quer aquele.
 *
 * ABRIR O AVISO É QUE MARCA COMO LIDO
 *
 * Abrir o sino não marca. Antes marcava, e quem passasse o olho para ver se
 * tinha algo perdia a indicação de qual era novo — inclusive sem ter lido
 * nada. Lido é o que a pessoa abriu.
 */
export default function Notificacoes() {
  const [avisos, setAvisos] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const carregar = async () => {
      const { data, error } = await supabase.rpc('minhas_notificacoes');

      if (error) {
        // Sino que falha não pode atrapalhar quem veio trabalhar.
        console.error('Erro ao carregar avisos:', error);
        return;
      }

      setAvisos((data as Notificacao[]) || []);
    };

    carregar();
  }, []);

  // Clique fora fecha. Sem isto o painel fica aberto por cima da tela e a
  // pessoa procura um X que não existe.
  useEffect(() => {
    if (!aberto) return;

    const aoClicar = (evento: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(evento.target as Node)) {
        setAberto(false);
      }
    };

    document.addEventListener('mousedown', aoClicar);
    return () => document.removeEventListener('mousedown', aoClicar);
  }, [aberto]);

  const naoLidos = avisos.filter((aviso) => !aviso.lida).length;

  const abrirAviso = async (aviso: Notificacao) => {
    const fechando = expandido === aviso.id;
    setExpandido(fechando ? null : aviso.id);

    if (fechando || aviso.lida) return;

    await supabase.rpc('marcar_aviso_lido', { p_aviso_id: aviso.id });

    setAvisos((atuais) =>
      atuais.map((item) => (item.id === aviso.id ? { ...item, lida: true } : item))
    );
  };

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((estava) => !estava)}
        aria-label={naoLidos > 0 ? `${naoLidos} avisos não lidos` : 'Avisos'}
        className="relative p-2 rounded-xl border border-gray-200 dark:border-navy-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-navy-800 transition-colors"
      >
        <Bell className="w-5 h-5" />

        {naoLidos > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center tabular-nums">
            {naoLidos}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-[min(400px,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-2xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-800 shadow-xl z-50">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-navy-700 flex items-center justify-between gap-3">
            <p className="font-semibold text-navy-900 dark:text-white">Avisos</p>

            {naoLidos > 0 && (
              <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">
                {naoLidos} por ler
              </span>
            )}
          </div>

          {avisos.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-500 dark:text-slate-400 leading-relaxed">
              Nenhum aviso por enquanto.
            </p>
          )}

          <ul className="divide-y divide-gray-100 dark:divide-navy-700">
            {avisos.map((aviso) => {
              const aberta = expandido === aviso.id;

              return (
                <li key={aviso.id} className={aviso.lida ? '' : 'bg-gold/[0.07]'}>
                  <button
                    type="button"
                    onClick={() => abrirAviso(aviso)}
                    aria-expanded={aberta}
                    className="w-full text-left px-4 py-3 flex items-start gap-2 hover:bg-gray-50 dark:hover:bg-navy-700/50 transition-colors"
                  >
                    {aberta ? (
                      <ChevronDown className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {!aviso.lida && (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-gold" />
                        )}

                        <span
                          className={
                            aviso.lida
                              ? 'text-sm text-gray-600 dark:text-slate-300'
                              : 'text-sm font-semibold text-navy-900 dark:text-white'
                          }
                        >
                          {aviso.titulo}
                        </span>
                      </span>

                      <span className="block text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 tabular-nums">
                        {new Date(aviso.criado_em).toLocaleDateString('pt-BR')}
                      </span>
                    </span>
                  </button>

                  {aberta && (
                    <div className="px-4 pb-4 pl-10">
                      <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                        {aviso.corpo}
                      </p>

                      {aviso.link_para && (
                        <Link
                          to={aviso.link_para}
                          onClick={() => setAberto(false)}
                          className="inline-block mt-3 px-3 py-1.5 rounded-lg bg-navy-900 dark:bg-gold text-white dark:text-navy-900 text-xs font-semibold hover:opacity-90"
                        >
                          {aviso.link_rotulo || 'Ver agora'}
                        </Link>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
