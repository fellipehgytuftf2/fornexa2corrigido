import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Selo from './Selo';

interface Progresso {
  faturamento: number;
  meta: number;
  falta: number;
  conquista: string | null;
}

interface Conquista {
  chave: string;
  nome: string;
  icone: string;
}

/** Mesma cadência do ranking. */
const SEGUNDOS = 30;

const dinheiro = (valor: number) =>
  `R$ ${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

/**
 * Selo, faturamento e a próxima meta, no topo do painel.
 *
 * POR QUE A META ANDA
 *
 * Mostrar sempre R$ 100.000 para quem vendeu R$ 300 não é ambição, é uma barra
 * que nunca sai do lugar. A meta é a próxima faixa ainda não alcançada, então
 * a barra enche de verdade — e a faixa seguinte aparece no mesmo instante em
 * que a atual é batida.
 */
export default function BarraDeFaturamento() {
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [conquista, setConquista] = useState<Conquista | null>(null);

  useEffect(() => {
    let vivo = true;

    const carregar = async () => {
      const { data } = await supabase.rpc('meu_faturamento_e_meta');
      const linha = ((data as Progresso[]) || [])[0] ?? null;

      if (!vivo) return;

      setProgresso(linha);

      if (linha?.conquista) {
        const { data: lista } = await supabase.rpc('minhas_conquistas');

        const achada = ((lista as Conquista[]) || []).find(
          (item) => item.chave === linha.conquista
        );

        if (vivo) setConquista(achada ?? null);
      }
    };

    carregar();

    const relogio = window.setInterval(carregar, SEGUNDOS * 1000);

    return () => {
      vivo = false;
      window.clearInterval(relogio);
    };
  }, []);

  // Sem venda nenhuma a barra não tem o que dizer, e ocupar o topo do painel
  // com uma barra vazia é pior que não ter barra.
  if (!progresso || Number(progresso.faturamento) <= 0) return null;

  const porcentagem = Math.min(
    100,
    Math.round((Number(progresso.faturamento) / Number(progresso.meta || 1)) * 100)
  );

  // Quanto falta era uma linha embaixo, e valia uma faixa inteira de altura
  // para uma conta que se faz de cabeça. Virou o texto de quem passa o mouse.
  const falta =
    Number(progresso.falta) > 0
      ? `Faltam ${dinheiro(progresso.falta)} para a próxima conquista`
      : 'Você passou da maior meta cadastrada. Parabéns.';

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-800 px-4 py-2">
      <Selo
        icone={conquista?.icone ?? 'raio'}
        tamanho="p"
        bloqueado={!progresso.conquista}
        titulo={conquista?.nome ?? 'Sem conquista ainda'}
      />

      <p className="text-sm font-semibold text-navy-900 dark:text-white tabular-nums shrink-0">
        {dinheiro(progresso.faturamento)}
      </p>

      <div
        className="h-1.5 flex-1 min-w-0 max-w-[320px] rounded-full bg-gray-100 dark:bg-navy-700 overflow-hidden"
        role="progressbar"
        aria-valuenow={porcentagem}
        aria-valuemin={0}
        aria-valuemax={100}
        title={falta}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-navy-900 to-gold dark:from-gold/70 dark:to-gold transition-[width] duration-500"
          style={{ width: `${porcentagem}%` }}
        />
      </div>

      {/* No celular a meta encurta: "R$ 1 mil" cabe onde o valor cheio não. */}
      <p className="text-xs text-gray-500 dark:text-slate-400 tabular-nums shrink-0">
        <span className="hidden sm:inline">Meta: {dinheiro(progresso.meta)}</span>
        <span className="sm:hidden">
          R$ {Math.round(Number(progresso.meta) / 1000)} mil
        </span>
      </p>
    </div>
  );
}
