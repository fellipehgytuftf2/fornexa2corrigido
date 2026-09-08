import { useEffect, useState } from 'react';
import { Headset, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ConversaDeSuporte, {
  type MensagemDeSuporte,
} from '../../components/dashboard/ConversaDeSuporte';

/**
 * A conversa da pessoa com o suporte do FORNEXA.
 *
 * Existe porque a alternativa era o WhatsApp, onde nada fica registrado e a
 * resposta se perde entre conversas pessoais — ou os Chamados, que são
 * vendedor↔fornecedor sobre um pedido e levavam a pergunta para o Portal de
 * quem não tinha nada com ela.
 *
 * Uma conversa só, contínua. Não é lista de chamados para abrir e fechar: é o
 * fio com o suporte, e quem volta encontra o histórico de onde parou.
 */
export default function Suporte() {
  const [mensagens, setMensagens] = useState<MensagemDeSuporte[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [meuId, setMeuId] = useState('');

  const carregar = async () => {
    const { data, error } = await supabase.rpc('minhas_mensagens_de_suporte');

    if (error) {
      setErro(`Não foi possível carregar a conversa: ${error.message}`);
      setCarregando(false);
      return;
    }

    setMensagens((data as MensagemDeSuporte[]) || []);
    setCarregando(false);
  };

  useEffect(() => {
    const abrir = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setMeuId(user?.id ?? '');

      // Cria a conversa se ainda não existir, e marca como lida. Chamar isto
      // ao abrir, e não ao enviar, é o que faz o contador do menu zerar quando
      // a pessoa leu de fato.
      await supabase.rpc('minha_conversa_de_suporte');

      await carregar();
    };

    abrir();
  }, []);

  const enviar = async (corpo: string, imagemPath: string | null) => {
    setEnviando(true);
    setErro('');

    const { data, error } = await supabase.rpc('enviar_mensagem_de_suporte', {
      p_corpo: corpo,
      p_imagem_path: imagemPath,
    });

    setEnviando(false);

    const resposta = data as { ok?: boolean; erro?: string } | null;

    if (error || !resposta?.ok) {
      setErro(error?.message ?? resposta?.erro ?? 'Não foi possível enviar.');
      return;
    }

    await carregar();
  };

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
        {carregando ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : (
          <ConversaDeSuporte
            mensagens={mensagens}
            euSou="usuario"
            enviando={enviando}
            erro={erro}
            pastaDeUpload={meuId}
            onEnviar={enviar}
          />
        )}
      </div>
    </div>
  );
}
