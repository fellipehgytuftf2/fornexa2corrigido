import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ImagePlus, Loader2, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export interface MensagemDeSuporte {
  id: string;
  autor: 'usuario' | 'suporte';
  corpo: string | null;
  imagem_path: string | null;
  created_at: string;
}

interface Props {
  mensagens: MensagemDeSuporte[];
  /** Quem está olhando. Muda de que lado a mensagem aparece. */
  euSou: 'usuario' | 'suporte';
  enviando: boolean;
  erro?: string;
  /** Pasta onde as imagens deste lado são gravadas. */
  pastaDeUpload: string;
  onEnviar: (corpo: string, imagemPath: string | null) => Promise<void>;
}

/**
 * O fio de conversa com o suporte, dos dois lados.
 *
 * Mesmo componente para quem pergunta e para quem responde: é a mesma
 * conversa, e escrever duas telas faria uma delas envelhecer sozinha.
 *
 * IMAGENS
 *
 * Print resolve o que descrição não resolve — "deu erro na tela" com a foto do
 * erro é meio caminho andado. Ficam num balde privado, e o endereço é assinado
 * na hora de mostrar: print de suporte carrega endereço de cliente, valor de
 * pedido e às vezes a tela do banco.
 */
export default function ConversaDeSuporte({
  mensagens,
  euSou,
  enviando,
  erro,
  pastaDeUpload,
  onEnviar,
}: Props) {
  const [texto, setTexto] = useState('');
  const [subindo, setSubindo] = useState(false);
  const [erroLocal, setErroLocal] = useState('');
  const [urls, setUrls] = useState<Record<string, string>>({});

  const seletor = useRef<HTMLInputElement | null>(null);
  const fim = useRef<HTMLDivElement | null>(null);

  // Rola para a última mensagem. Conversa que abre no começo obriga a rolar
  // até embaixo toda vez para ver o que chegou.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens]);

  // Os endereços das imagens valem poucos minutos e são pedidos só das que
  // aparecem — assinar tudo de uma vez gastaria chamadas com conversa antiga.
  useEffect(() => {
    const assinar = async () => {
      const faltando = mensagens
        .map((mensagem) => mensagem.imagem_path)
        .filter((caminho): caminho is string => Boolean(caminho) && !urls[caminho as string]);

      if (faltando.length === 0) return;

      const novas: Record<string, string> = {};

      for (const caminho of faltando) {
        const { data } = await supabase.storage
          .from('suporte')
          .createSignedUrl(caminho, 600);

        if (data?.signedUrl) novas[caminho] = data.signedUrl;
      }

      if (Object.keys(novas).length > 0) {
        setUrls((atuais) => ({ ...atuais, ...novas }));
      }
    };

    assinar();
  }, [mensagens, urls]);

  const enviarImagem = async (arquivo: File) => {
    setSubindo(true);
    setErroLocal('');

    const extensao = arquivo.name.split('.').pop()?.toLowerCase() || 'jpg';
    const caminho = `${pastaDeUpload}/${crypto.randomUUID()}.${extensao}`;

    const { error } = await supabase.storage.from('suporte').upload(caminho, arquivo, {
      contentType: arquivo.type || 'image/jpeg',
    });

    if (error) {
      setSubindo(false);
      setErroLocal(`Não foi possível enviar a imagem: ${error.message}`);
      return;
    }

    // A imagem já vai junto com o que estiver escrito, numa mensagem só: duas
    // mensagens seguidas — foto e depois texto — chegam desencontradas.
    await onEnviar(texto, caminho);

    setTexto('');
    setSubindo(false);
  };

  const enviarTexto = async () => {
    if (!texto.trim()) return;

    await onEnviar(texto, null);
    setTexto('');
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {mensagens.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed">
            Nenhuma mensagem ainda. Escreva sua dúvida — pode anexar print, se
            ajudar a explicar.
          </p>
        )}

        {mensagens.map((mensagem) => {
          const minha = mensagem.autor === euSou;

          return (
            <div
              key={mensagem.id}
              className={minha ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={
                  minha
                    ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-navy-900 dark:bg-gold px-4 py-2.5 text-white dark:text-navy-900'
                    : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-navy-700 px-4 py-2.5 text-navy-900 dark:text-white'
                }
              >
                {mensagem.imagem_path && (
                  <a
                    href={urls[mensagem.imagem_path]}
                    target="_blank"
                    rel="noreferrer"
                    className="block mb-2"
                  >
                    {urls[mensagem.imagem_path] ? (
                      <img
                        src={urls[mensagem.imagem_path]}
                        alt="Imagem enviada na conversa"
                        className="rounded-lg max-h-64 w-auto"
                      />
                    ) : (
                      <span className="text-xs opacity-70">Carregando imagem...</span>
                    )}
                  </a>
                )}

                {mensagem.corpo && (
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {mensagem.corpo}
                  </p>
                )}

                <p className="text-[11px] opacity-60 mt-1 tabular-nums">
                  {new Date(mensagem.created_at).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </p>
              </div>
            </div>
          );
        })}

        <div ref={fim} />
      </div>

      {(erro || erroLocal) && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 mt-3">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed">
            {erro || erroLocal}
          </p>
        </div>
      )}

      <div className="flex items-end gap-2 mt-3 border-t border-gray-200 dark:border-navy-700 pt-3">
        <input
          ref={seletor}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0];
            evento.target.value = '';
            if (arquivo) enviarImagem(arquivo);
          }}
        />

        <button
          type="button"
          onClick={() => seletor.current?.click()}
          disabled={subindo || enviando}
          title="Anexar imagem"
          className="shrink-0 p-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors disabled:opacity-50"
        >
          {subindo ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ImagePlus className="w-4 h-4" />
          )}
        </button>

        <textarea
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => {
            // Enter envia; Shift+Enter quebra linha. É o que a mão já espera
            // de qualquer conversa.
            if (evento.key === 'Enter' && !evento.shiftKey) {
              evento.preventDefault();
              enviarTexto();
            }
          }}
          rows={2}
          placeholder="Escreva sua mensagem"
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-900 text-navy-900 dark:text-white text-sm resize-none"
        />

        <button
          type="button"
          onClick={enviarTexto}
          disabled={enviando || subindo || !texto.trim()}
          className="shrink-0 p-2.5 rounded-lg bg-navy-900 dark:bg-gold text-white dark:text-navy-900 hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
