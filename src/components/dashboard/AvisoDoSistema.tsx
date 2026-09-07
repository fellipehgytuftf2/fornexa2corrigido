import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Aviso {
  id: string;
  titulo: string;
  corpo: string;
  link_rotulo: string | null;
  link_para: string | null;
}

/**
 * O aviso do FORNEXA, uma vez por vendedor.
 *
 * Existe porque algumas mudanças exigem que o vendedor FAÇA alguma coisa, e
 * ninguém abre a tela onde a coisa está. O primeiro caso foi o endereço de
 * remetente: quem já usava o sistema configurou a loja quando o FORNEXA ainda
 * não falava disso, e segue despachando errado sem saber.
 *
 * Aparece uma vez. Fechar registra a leitura, e ele não volta — inclusive em
 * outro computador, porque quem guarda é o banco e não o navegador.
 *
 * Um de cada vez, na ordem em que foram escritos: dois avisos empilhados na
 * cara de quem abriu o painel para trabalhar são dois avisos ignorados.
 */
export default function AvisoDoSistema() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [fechando, setFechando] = useState(false);

  useEffect(() => {
    const carregar = async () => {
      const { data, error } = await supabase.rpc('meus_avisos');

      if (error) {
        // Aviso que falha ao carregar não pode atrapalhar quem veio trabalhar.
        console.error('Erro ao carregar avisos:', error);
        return;
      }

      setAvisos((data as Aviso[]) || []);
    };

    carregar();
  }, []);

  const aviso = avisos[0];

  if (!aviso) return null;

  const fechar = async () => {
    setFechando(true);
    await supabase.rpc('marcar_aviso_lido', { p_aviso_id: aviso.id });
    setFechando(false);
    setAvisos((restantes) => restantes.slice(1));
  };

  return createPortal(
    <div className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-navy-700 w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto shadow-xl">
        <div className="p-6">
          <p className="font-semibold text-navy-900 dark:text-white text-lg flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-gold" aria-hidden="true" />
            {aviso.titulo}
          </p>

          {/* `whitespace-pre-line` para o admin poder separar parágrafos com
              Enter, sem precisar saber o que é HTML. */}
          <p className="text-sm text-gray-600 dark:text-slate-300 mt-3 leading-relaxed whitespace-pre-line">
            {aviso.corpo}
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            {aviso.link_para && (
              <Link
                to={aviso.link_para}
                onClick={fechar}
                className="px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-gold text-white dark:text-navy-900 text-sm font-semibold hover:opacity-90"
              >
                {aviso.link_rotulo || 'Ver agora'}
              </Link>
            )}

            <button
              type="button"
              onClick={fechar}
              disabled={fechando}
              className="px-4 py-2.5 rounded-lg text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              Entendi
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
