import { useEffect, useState } from 'react';
import { Headset, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import MinhaConversaDeSuporte from '../../components/dashboard/MinhaConversaDeSuporte';
import SuporteAdmin from '../../components/dashboard/SuporteAdmin';

/**
 * A página de suporte.
 *
 * Quase ninguém chega aqui: o caminho normal é o balão no canto da tela, que
 * fica onde a pessoa já está quando a dúvida aparece. Esta página existe para
 * quem abriu pela URL, e para quando o balão for pequeno demais — conversa
 * longa, print grande.
 *
 * Admin vê a lista de conversas; o resto vê a própria.
 */
export default function Suporte() {
  const [ehAdmin, setEhAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const conferir = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: perfil } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user?.id ?? '')
        .maybeSingle<{ role: string | null }>();

      setEhAdmin(perfil?.role === 'admin');
    };

    conferir();
  }, []);

  if (ehAdmin === null) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin mx-auto" />
      </div>
    );
  }

  if (ehAdmin) {
    return <SuporteAdmin />;
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-navy-900 dark:text-white flex items-center gap-2">
        <Headset className="w-6 h-6 text-gold" aria-hidden="true" />
        Suporte
      </h1>

      <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
        Fale direto com a equipe do FORNEXA. Dúvida sobre o sistema, problema
        numa conta, cobrança — aqui. Para problema com um pedido específico, use
        Chamados: ele avisa o fornecedor junto.
      </p>

      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm mt-5 h-[60vh] min-h-[420px] flex flex-col">
        <MinhaConversaDeSuporte />
      </div>
    </div>
  );
}
