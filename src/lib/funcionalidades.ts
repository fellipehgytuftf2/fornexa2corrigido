import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * As novidades que esta conta enxerga.
 *
 * POR QUE EXISTE
 *
 * Coisa nova precisa ser testada com dado de verdade, e dado de verdade só
 * existe em produção. Com isto, o código sobe desligado: quem está liberado
 * enxerga, o resto da base não sabe que existe. Lançar é um clique no Admin, e
 * voltar atrás também — sem deploy.
 *
 * COMO SE USA
 *
 *   const { liberada } = useFuncionalidade('etiqueta-nova');
 *   if (!liberada) return null;
 *
 * Enquanto carrega, `liberada` é falso: melhor a novidade aparecer meio
 * segundo depois do que piscar na tela de quem não devia vê-la.
 */

/**
 * A resposta é a mesma para a página inteira e não muda no meio da visita.
 * Sem esta memória, cada tela que perguntasse faria sua própria consulta.
 */
let respostaEmAndamento: Promise<Set<string>> | null = null;

async function carregar(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('minhas_funcionalidades');

  if (error) {
    // Falhar aqui significa "não libera nada": novidade escondida é um
    // aborrecimento, novidade vazando é um problema.
    console.error('Erro ao ler funcionalidades:', error);
    return new Set();
  }

  return new Set(((data as { chave: string }[]) || []).map((linha) => linha.chave));
}

/** Força a próxima leitura a consultar o banco de novo. */
export function esquecerFuncionalidades() {
  respostaEmAndamento = null;
}

/**
 * TROCA DE CONTA
 *
 * Sem tratar isso, entrar na conta de um cliente pelo Admin — ou sair e entrar
 * com outro login sem recarregar — deixava a resposta do admin valendo para
 * ele: a novidade em teste aparecia para quem não estava liberado.
 *
 * Cada gancho abaixo ouve a troca, esquece a resposta e pergunta de novo. O
 * ouvinte vive com o componente, e não solto no módulo, para sumir junto com
 * ele em vez de acumular a cada tela aberta.
 */

/** Todas as novidades liberadas para esta conta, para quem precisa filtrar lista. */
export function useFuncionalidades() {
  const [liberadas, setLiberadas] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;

    const ler = () => {
      respostaEmAndamento = respostaEmAndamento ?? carregar();

      respostaEmAndamento.then((chaves) => {
        if (vivo) setLiberadas(chaves);
      });
    };

    ler();

    // Trocou de conta, a resposta anterior não vale mais.
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      // Mesmo cuidado do outro ouvinte: aviso de carregamento e de renovação
      // de token não são troca de conta, e zerar a lista neles faz a tela
      // piscar a cada F5.
      if (evento === 'INITIAL_SESSION' || evento === 'TOKEN_REFRESHED') return;

      respostaEmAndamento = null;
      setLiberadas(new Set());
      ler();
    });

    return () => {
      vivo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { liberadas };
}

/**
 * A última resposta, lembrada no navegador.
 *
 * A pergunta "posso ver isto?" vai ao banco e demora alguns décimos. Até ela
 * voltar, a tela desenha a versão antiga — e na landing isso aparece como um
 * piscar: a imagem velha surge e a nova cobre logo depois.
 *
 * Guardar a resposta anterior resolve o piscar da segunda visita em diante: a
 * tela já nasce com o que valeu da última vez, e a pergunta real só confirma.
 *
 * É conveniência, não permissão. Quem manda continua sendo o banco, e trocar
 * de conta apaga tudo isto — senão a novidade de uma conta apareceria por um
 * instante na tela de outra, que foi um problema real em 30/09.
 */
const PREFIXO_LEMBRADO = 'fornexa_func_';

function lembrada(chave: string): boolean {
  try {
    return localStorage.getItem(PREFIXO_LEMBRADO + chave) === 'sim';
  } catch {
    // Janela anônima, ou armazenamento bloqueado: começa sem lembrança.
    return false;
  }
}

function lembrar(chave: string, liberada: boolean) {
  try {
    if (liberada) localStorage.setItem(PREFIXO_LEMBRADO + chave, 'sim');
    else localStorage.removeItem(PREFIXO_LEMBRADO + chave);
  } catch {
    // Sem armazenamento, segue sem lembrar. A tela funciona igual.
  }
}

function esquecerTudo() {
  try {
    Object.keys(localStorage)
      .filter((nome) => nome.startsWith(PREFIXO_LEMBRADO))
      .forEach((nome) => localStorage.removeItem(nome));
  } catch {
    // idem
  }
}

export function useFuncionalidade(chave: string) {
  const [liberada, setLiberada] = useState(() => lembrada(chave));
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;

    const ler = () => {
      respostaEmAndamento = respostaEmAndamento ?? carregar();

      respostaEmAndamento.then((chaves) => {
        if (!vivo) return;

        setLiberada(chaves.has(chave));
        setCarregando(false);
        lembrar(chave, chaves.has(chave));
      });
    };

    ler();

    const { data } = supabase.auth.onAuthStateChange((evento) => {
      // Nem todo aviso é troca de conta.
      //
      // O Supabase dispara `INITIAL_SESSION` em TODO carregamento da página, e
      // `TOKEN_REFRESHED` de tempos em tempos. Tratar esses como troca fazia a
      // lembrança ser apagada a cada F5 — a tela voltava para a versão antiga
      // e piscava de novo, que é exatamente o que o cache veio resolver.
      if (evento === 'INITIAL_SESSION' || evento === 'TOKEN_REFRESHED') return;

      respostaEmAndamento = null;
      esquecerTudo();
      setLiberada(false);
      ler();
    });

    return () => {
      vivo = false;
      data.subscription.unsubscribe();
    };
  }, [chave]);

  return { liberada, carregando };
}
