import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
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
 * Aqui ele fica: a pessoa abre quando puder, relê o que já fechou, e vê o que
 * ainda não abriu marcado.
 */
export default function Notificacoes() {
  const [avisos, setAvisos] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement | null>(null);

  const carregar = async () => {
    const { data, error } = await supabase.rpc('minhas_notificacoes');

    if (error) {
      // Sino que falha não pode atrapalhar quem veio trabalhar.
      console.error('Erro ao carregar avisos:', error);
      return;
    }

    setAvisos((data as Notificacao[]) || []);
  };

  useEffect(() => {
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

  const marcarLido = async (aviso: Notificacao) => {
    if (aviso.lida) return;

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
        <div className="absolute right-0 mt-2 w-[min(380px,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-2xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-800 shadow-xl z-50">
          <p className="px-4 py-3 border-b border-gray-200 dark:border-navy-700 font-semibold text-navy-900 dark:text-white">
            Avisos
          </p>

          {avisos.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-500 dark:text-slate-400 leading-relaxed">
              Nenhum aviso por enquanto.
            </p>
          )}

          <ul className="divide-y divide-gray-100 dark:divide-navy-700">
            {avisos.map((aviso) => (
              <li
                key={aviso.id}
                onMouseEnter={() => marcarLido(aviso)}
                className={
                  aviso.lida
                    ? 'px-4 py-3'
                    : 'px-4 py-3 bg-gold/5 border-l-2 border-gold'
                }
              >
                <p className="font-medium text-navy-900 dark:text-white text-sm">
                  {aviso.titulo}
                </p>

                <p className="text-sm text-gray-600 dark:text-slate-300 mt-1 leading-relaxed whitespace-pre-line">
                  {aviso.corpo}
                </p>

                <div className="flex items-center justify-between gap-3 mt-2">
                  {aviso.link_para ? (
                    <Link
                      to={aviso.link_para}
                      onClick={() => {
                        marcarLido(aviso);
                        setAberto(false);
                      }}
                      className="text-xs font-semibold text-navy-900 dark:text-gold underline underline-offset-2"
                    >
                      {aviso.link_rotulo || 'Ver agora'}
                    </Link>
                  ) : (
                    <span />
                  )}

                  <span className="text-[11px] text-gray-400 dark:text-slate-500 tabular-nums">
                    {new Date(aviso.criado_em).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
