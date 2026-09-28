import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ModalPortal from '../ui/modal-portal';
import Selo from './Selo';

interface Pendente {
  chave: string;
  nome: string;
  icone: string;
  criada_em: string;
}

/**
 * A comemoração da primeira venda.
 *
 * POR QUE ESPERA A PESSOA VOLTAR
 *
 * A venda cai quando ela está no trabalho, dirigindo, dormindo. Uma mensagem
 * que só existe no instante do fato não alcança quem ela foi escrita para
 * alcançar. Fica guardada no banco e aparece no próximo acesso.
 *
 * UMA VEZ SÓ
 *
 * Fechar marca como vista. O selo continua no perfil — a comemoração é do
 * momento, o selo é permanente.
 */
export default function ComemoracaoDeConquista() {
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [nome, setNome] = useState('');

  useEffect(() => {
    const carregar = async () => {
      const { data } = await supabase.rpc('minha_comemoracao_pendente');
      const linha = ((data as Pendente[]) || [])[0] ?? null;

      if (!linha) return;

      setPendente(linha);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: perfil } = await supabase
        .from('profiles')
        .select('name, apelido')
        .eq('id', user.id)
        .maybeSingle<{ name: string | null; apelido: string | null }>();

      const completo = perfil?.apelido || perfil?.name || '';

      setNome(completo.split(' ')[0] ?? '');
    };

    carregar();
  }, []);

  const fechar = async () => {
    if (!pendente) return;

    await supabase.rpc('marcar_comemoracao_vista', { p_chave: pendente.chave });
    setPendente(null);
  };

  if (!pendente) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 px-4 py-6">
        <div className="w-full max-w-md max-h-full overflow-y-auto rounded-2xl bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 shadow-2xl">
          <div className="flex justify-end p-3 pb-0">
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar"
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-7 pb-8 text-center">
            <div className="flex justify-center">
              <Selo icone={pendente.icone} tamanho="g" titulo={pendente.nome} />
            </div>

            <h2 className="text-xl font-bold text-navy-900 dark:text-white mt-5">
              Primeira venda confirmada!
            </h2>

            <p className="text-sm text-gray-600 dark:text-slate-300 mt-3 leading-relaxed">
              Parabéns{nome ? `, ${nome}` : ''}! Você acaba de desbloquear o selo
              "{pendente.nome}" no seu perfil.
            </p>

            <p className="text-sm text-gray-600 dark:text-slate-300 mt-3 leading-relaxed">
              Agora é manter o ritmo: publique mais produtos e veja sua barra de
              progresso avançar rumo à próxima meta.
            </p>

            <p className="text-sm font-semibold text-navy-900 dark:text-white mt-4">
              Equipe FORNEXA
            </p>

            <button
              type="button"
              onClick={fechar}
              className="w-full mt-6 px-4 py-3 rounded-xl bg-navy-900 dark:bg-gold text-white dark:text-navy-900 text-sm font-semibold hover:opacity-90"
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
