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

/** Todas as novidades liberadas para esta conta, para quem precisa filtrar lista. */
export function useFuncionalidades() {
  const [liberadas, setLiberadas] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;

    respostaEmAndamento = respostaEmAndamento ?? carregar();

    respostaEmAndamento.then((chaves) => {
      if (vivo) setLiberadas(chaves);
    });

    return () => {
      vivo = false;
    };
  }, []);

  return { liberadas };
}

export function useFuncionalidade(chave: string) {
  const [liberada, setLiberada] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;

    respostaEmAndamento = respostaEmAndamento ?? carregar();

    respostaEmAndamento.then((chaves) => {
      if (!vivo) return;

      setLiberada(chaves.has(chave));
      setCarregando(false);
    });

    return () => {
      vivo = false;
    };
  }, [chave]);

  return { liberada, carregando };
}
