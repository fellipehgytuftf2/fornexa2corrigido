import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Avatar from './Avatar';

/** O Storage aceita mais que isso; o limite é para não guardar foto de 12 MB. */
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

/** Lado do quadrado final. Foto de perfil nunca aparece maior que isso. */
const LADO = 512;

interface Perfil {
  foto_path: string | null;
  apelido: string | null;
  ranking_visibilidade: 'nome' | 'apelido' | 'oculto';
  ranking_mostra_valor: boolean;
  name: string | null;
}

/**
 * Foto, apelido e como a pessoa aparece no ranking.
 *
 * POR QUE O RECORTE ACONTECE AQUI
 *
 * Foto de celular tem 4 MB e 4000 pixels de lado, e aparece na tela como um
 * círculo de 44. Mandar o arquivo inteiro para o servidor faria cada linha do
 * ranking baixar megabytes para mostrar um polegar. O navegador corta o
 * quadrado do meio e reduz para 512 antes de enviar — o que sobe já é o que
 * vai ser usado.
 *
 * POR QUE A PRIVACIDADE FICA NA MESMA TELA
 *
 * São a mesma decisão: "o que os outros veem de mim". Separar em duas telas
 * faria alguém trocar a foto sem descobrir que dá para não aparecer.
 */
export default function FotoEPrivacidade() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [salvo, setSalvo] = useState(false);
  const arquivo = useRef<HTMLInputElement | null>(null);

  const carregar = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('foto_path, apelido, ranking_visibilidade, ranking_mostra_valor, name')
      .eq('id', user.id)
      .maybeSingle<Perfil>();

    setPerfil(
      data ?? {
        foto_path: null,
        apelido: null,
        ranking_visibilidade: 'apelido',
        ranking_mostra_valor: true,
        name: null,
      }
    );
  };

  useEffect(() => {
    carregar();
  }, []);

  /** Corta o quadrado do meio e reduz, devolvendo o arquivo pronto. */
  const prepararImagem = (origem: File): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const leitor = new FileReader();

      leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'));

      leitor.onload = () => {
        const imagem = new Image();

        imagem.onerror = () => reject(new Error('Arquivo de imagem inválido.'));

        imagem.onload = () => {
          const lado = Math.min(imagem.width, imagem.height);
          const tela = document.createElement('canvas');

          tela.width = LADO;
          tela.height = LADO;

          const pincel = tela.getContext('2d');

          if (!pincel) {
            reject(new Error('Não foi possível preparar a imagem.'));
            return;
          }

          pincel.drawImage(
            imagem,
            (imagem.width - lado) / 2,
            (imagem.height - lado) / 2,
            lado,
            lado,
            0,
            0,
            LADO,
            LADO
          );

          tela.toBlob(
            (pronta) =>
              pronta ? resolve(pronta) : reject(new Error('Não foi possível preparar a imagem.')),
            'image/jpeg',
            0.85
          );
        };

        imagem.src = String(leitor.result);
      };

      leitor.readAsDataURL(origem);
    });

  const enviarFoto = async (evento: React.ChangeEvent<HTMLInputElement>) => {
    const escolhido = evento.target.files?.[0];

    if (!escolhido) return;

    setErro('');

    if (!TIPOS.includes(escolhido.type)) {
      setErro('A foto precisa ser JPG, PNG ou WebP.');
      return;
    }

    if (escolhido.size > TAMANHO_MAXIMO) {
      setErro('A foto precisa ter no máximo 5 MB.');
      return;
    }

    setEnviando(true);

    try {
      const pronta = await prepararImagem(escolhido);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Faça login novamente.');

      // A pasta é o id da pessoa: é o que a regra do Storage exige, e o que
      // impede alguém de escrever na foto de outro. O nome muda a cada troca
      // porque o navegador guarda a imagem pelo endereço — com nome fixo, a
      // foto antiga continuaria aparecendo até alguém limpar o cache.
      const caminho = `${user.id}/${Date.now()}.jpg`;

      const { error: erroDoUpload } = await supabase.storage
        .from('avatares')
        .upload(caminho, pronta, { contentType: 'image/jpeg' });

      if (erroDoUpload) throw erroDoUpload;

      const { error: erroDoPerfil } = await supabase
        .from('profiles')
        .update({ foto_path: caminho })
        .eq('id', user.id);

      if (erroDoPerfil) throw erroDoPerfil;

      // A anterior sai depois da nova entrar: falhar aqui deixa um arquivo
      // órfão, e isso é melhor que ficar sem foto nenhuma.
      if (perfil?.foto_path) {
        await supabase.storage.from('avatares').remove([perfil.foto_path]);
      }

      await carregar();
    } catch (falha) {
      setErro(`Não foi possível enviar a foto: ${(falha as Error).message}`);
    }

    setEnviando(false);

    if (arquivo.current) arquivo.current.value = '';
  };

  const removerFoto = async () => {
    setEnviando(true);
    setErro('');

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      if (perfil?.foto_path) {
        await supabase.storage.from('avatares').remove([perfil.foto_path]);
      }

      await supabase.from('profiles').update({ foto_path: null }).eq('id', user.id);
      await carregar();
    }

    setEnviando(false);
  };

  const salvar = async () => {
    if (!perfil) return;

    setSalvando(true);
    setErro('');

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSalvando(false);
      setErro('Faça login novamente.');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        apelido: perfil.apelido?.trim() || null,
        ranking_visibilidade: perfil.ranking_visibilidade,
        ranking_mostra_valor: perfil.ranking_mostra_valor,
      })
      .eq('id', user.id);

    setSalvando(false);

    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }

    setSalvo(true);
    window.setTimeout(() => setSalvo(false), 2400);
  };

  if (!perfil) return null;

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-navy-900 dark:text-white">
        Foto e ranking
      </h2>

      <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
        Como você aparece para os outros vendedores no Top Vendedores.
      </p>

      {erro && <p className="text-sm text-red-600 dark:text-red-400 mt-3">{erro}</p>}

      <div className="flex flex-wrap items-center gap-4 mt-5">
        <Avatar foto={perfil.foto_path} nome={perfil.apelido || perfil.name} tamanho="gg" />

        <div className="flex flex-wrap gap-2">
          <input
            ref={arquivo}
            id="foto-de-perfil"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={enviarFoto}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => arquivo.current?.click()}
            disabled={enviando}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-gold text-white dark:text-navy-900 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {enviando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
            {perfil.foto_path ? 'Trocar foto' : 'Enviar foto'}
          </button>

          {perfil.foto_path && (
            <button
              type="button"
              onClick={removerFoto}
              disabled={enviando}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm font-semibold hover:bg-gray-50 dark:hover:bg-navy-700 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Remover
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
        JPG, PNG ou WebP, até 5 MB. A imagem é cortada em círculo e reduzida
        antes de enviar.
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="apelido"
            className="block text-sm font-medium text-navy-900 dark:text-white mb-2"
          >
            Apelido no ranking
          </label>

          <input
            id="apelido"
            value={perfil.apelido ?? ''}
            onChange={(evento) => setPerfil({ ...perfil, apelido: evento.target.value })}
            placeholder={perfil.name?.split(' ')[0] ?? 'Como quer ser chamado'}
            className="w-full px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-sm text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-navy-900 dark:text-white mb-2">
            Como aparecer
          </legend>

          <div className="space-y-2">
            {[
              { id: 'apelido', rotulo: 'Pelo apelido', ajuda: 'Só o apelido, ou o primeiro nome.' },
              { id: 'nome', rotulo: 'Pelo nome', ajuda: 'O nome do cadastro.' },
              { id: 'oculto', rotulo: 'Oculto', ajuda: 'Aparece como "Vendedor anônimo".' },
            ].map((opcao) => (
              <label
                key={opcao.id}
                htmlFor={`visibilidade-${opcao.id}`}
                className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-navy-600 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-navy-700/50"
              >
                <input
                  id={`visibilidade-${opcao.id}`}
                  type="radio"
                  name="ranking-visibilidade"
                  checked={perfil.ranking_visibilidade === opcao.id}
                  onChange={() =>
                    setPerfil({
                      ...perfil,
                      ranking_visibilidade: opcao.id as Perfil['ranking_visibilidade'],
                    })
                  }
                  className="mt-1"
                />

                <span>
                  <span className="block text-sm font-medium text-navy-900 dark:text-white">
                    {opcao.rotulo}
                  </span>

                  <span className="block text-xs text-gray-500 dark:text-slate-400">
                    {opcao.ajuda}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label
          htmlFor="mostra-valor"
          className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-navy-600 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-navy-700/50"
        >
          <input
            id="mostra-valor"
            type="checkbox"
            checked={perfil.ranking_mostra_valor}
            onChange={(evento) =>
              setPerfil({ ...perfil, ranking_mostra_valor: evento.target.checked })
            }
            className="mt-1"
          />

          <span>
            <span className="block text-sm font-medium text-navy-900 dark:text-white">
              Mostrar meu faturamento
            </span>

            <span className="block text-xs text-gray-500 dark:text-slate-400">
              Desmarcado, os outros veem sua posição mas não o valor.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-gold text-white dark:text-navy-900 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>

          {salvo && (
            <span className="text-sm text-green-600 dark:text-green-400">Salvo.</span>
          )}
        </div>
      </div>
    </div>
  );
}
