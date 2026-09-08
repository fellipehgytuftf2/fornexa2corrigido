import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ConversaDeSuporte, { type MensagemDeSuporte } from './ConversaDeSuporte';

/**
 * A conversa da própria pessoa com o suporte.
 *
 * Separado da página porque vive em dois lugares: no balão flutuante, que é
 * por onde quase todo mundo escreve, e na página inteira, para quem chegou
 * pela URL. A lógica é uma só — duplicá-la faria uma das duas envelhecer.
 */
export default function MinhaConversaDeSuporte() {
  const [mensagens, setMensagens] = useState<MensagemDeSuporte[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [meuId, setMeuId] = useState('');

  const carregar = async () => {
    const { data, error } = await supabase.rpc('minhas_mensagens_de_suporte');

    setCarregando(false);

    if (error) {
      setErro(`Não foi possível carregar a conversa: ${error.message}`);
      return;
    }

    setMensagens((data as MensagemDeSuporte[]) || []);
  };

  useEffect(() => {
    const abrir = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setMeuId(user?.id ?? '');

      // Cria a conversa se ainda não existir, e marca como lida. Ao abrir, e
      // não ao enviar: é o que faz o aviso de resposta nova sumir quando a
      // pessoa de fato leu.
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

  if (carregando) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <ConversaDeSuporte
      mensagens={mensagens}
      euSou="usuario"
      enviando={enviando}
      erro={erro}
      pastaDeUpload={meuId}
      onEnviar={enviar}
    />
  );
}
