import { useEffect, useState } from 'react';
import { Headset, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ConversaDeSuporte, { type MensagemDeSuporte } from './ConversaDeSuporte';

interface Conversa {
  id: string;
  user_id: string;
  nome: string | null;
  email: string | null;
  empresa: string | null;
  whatsapp: string | null;
  ultima_mensagem_em: string;
  aguardando: boolean;
  mensagens: number;
}

/**
 * As conversas de suporte, do lado de quem responde.
 *
 * A lista é ordenada pela última mensagem e marca quem está esperando — que é
 * a única coisa que se procura aqui. Conversa respondida vai para o fim
 * sozinha, sem ninguém precisar arquivar nada.
 */
export default function SuporteAdmin() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [aberta, setAberta] = useState<Conversa | null>(null);
  const [mensagens, setMensagens] = useState<MensagemDeSuporte[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [meuId, setMeuId] = useState('');

  const carregarConversas = async () => {
    const { data, error } = await supabase.rpc('suporte_conversas_abertas');

    setCarregando(false);

    if (error) {
      setErro(`Não foi possível carregar: ${error.message}`);
      return;
    }

    setConversas((data as Conversa[]) || []);
  };

  useEffect(() => {
    const inicio = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setMeuId(user?.id ?? '');
      await carregarConversas();
    };

    inicio();
  }, []);

  const abrir = async (conversa: Conversa) => {
    setAberta(conversa);
    setMensagens([]);
    setErro('');

    const { data, error } = await supabase.rpc('suporte_mensagens_da_conversa', {
      p_conversa: conversa.id,
    });

    if (error) {
      setErro(`Não foi possível abrir: ${error.message}`);
      return;
    }

    setMensagens((data as MensagemDeSuporte[]) || []);

    // A lista recarrega para o "aguardando" sumir de quem acabou de ser lido.
    carregarConversas();
  };

  const responder = async (corpo: string, imagemPath: string | null) => {
    if (!aberta) return;

    setEnviando(true);
    setErro('');

    const { data, error } = await supabase.rpc('suporte_responde', {
      p_conversa: aberta.id,
      p_corpo: corpo,
      p_imagem_path: imagemPath,
    });

    setEnviando(false);

    const resposta = data as { ok?: boolean; erro?: string } | null;

    if (error || !resposta?.ok) {
      setErro(error?.message ?? resposta?.erro ?? 'Não foi possível responder.');
      return;
    }

    await abrir(aberta);
  };

  const esperando = conversas.filter((conversa) => conversa.aguardando).length;

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-navy-900 dark:text-white flex items-center gap-2">
        <Headset className="w-5 h-5 text-gold" aria-hidden="true" />
        Suporte
        {esperando > 0 && (
          <span className="ml-1 inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-gold text-navy-900 text-xs font-bold tabular-nums">
            {esperando}
          </span>
        )}
      </h2>

      <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
        Conversas com vendedores e fornecedores. Quem está esperando aparece
        marcado.
      </p>

      {erro && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-3 leading-relaxed">{erro}</p>
      )}

      {carregando ? (
        <div className="py-10 text-center">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin mx-auto" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] mt-5">
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {conversas.length === 0 && (
              <li className="text-sm text-gray-500 dark:text-slate-400">
                Nenhuma conversa ainda.
              </li>
            )}

            {conversas.map((conversa) => (
              <li key={conversa.id}>
                <button
                  type="button"
                  onClick={() => abrir(conversa)}
                  className={
                    aberta?.id === conversa.id
                      ? 'w-full text-left rounded-xl border border-gold bg-gold/10 px-4 py-3'
                      : 'w-full text-left rounded-xl border border-gray-200 dark:border-navy-600 px-4 py-3 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors'
                  }
                >
                  <p className="font-medium text-navy-900 dark:text-white truncate">
                    {conversa.empresa || conversa.nome || conversa.email}
                    {conversa.aguardando && (
                      <span className="ml-2 inline-block w-2 h-2 rounded-full bg-gold align-middle" />
                    )}
                  </p>

                  <p className="text-xs text-gray-500 dark:text-slate-400 truncate mt-0.5">
                    {conversa.email}
                  </p>

                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    {new Date(conversa.ultima_mensagem_em).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                    {' · '}
                    {conversa.mensagens} mensagens
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <div className="rounded-xl border border-gray-200 dark:border-navy-600 p-4 h-[60vh] min-h-[380px] flex flex-col">
            {!aberta ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  Escolha uma conversa ao lado.
                </p>
              </div>
            ) : (
              <>
                <div className="pb-3 mb-1 border-b border-gray-200 dark:border-navy-700">
                  <p className="font-semibold text-navy-900 dark:text-white">
                    {aberta.empresa || aberta.nome || aberta.email}
                  </p>

                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {aberta.email}
                    {aberta.whatsapp ? ` · ${aberta.whatsapp}` : ''}
                  </p>
                </div>

                <ConversaDeSuporte
                  mensagens={mensagens}
                  euSou="suporte"
                  enviando={enviando}
                  pastaDeUpload={meuId}
                  onEnviar={responder}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
