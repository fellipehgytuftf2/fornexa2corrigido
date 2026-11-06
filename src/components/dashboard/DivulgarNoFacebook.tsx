import { useState } from 'react';
import DivulgarAtual from './divulgar/DivulgarAtual';
import DivulgarBalao, { type Ancora } from './divulgar/DivulgarBalao';
import DivulgarEstudio from './divulgar/DivulgarEstudio';
import DivulgarFolha from './divulgar/DivulgarFolha';
import DivulgarGaveta from './divulgar/DivulgarGaveta';
import type { DadosDaDivulgacao } from './divulgar/useDivulgacao';

/**
 * PRÉVIA DE FORMATOS — branch feat/divulgar-formatos.
 *
 * Este arquivo existe para escolher o formato do "Divulgar" vendo cada um
 * dentro do FORNEXA, com anúncios de verdade. A barra no topo troca o formato
 * na hora. Escolhido o formato, fica só ele, e a barra e os outros saem.
 */

type Formato = 'gaveta' | 'folha' | 'estudio' | 'balao' | 'atual';

const FORMATOS: { id: Formato; nome: string }[] = [
  { id: 'gaveta', nome: 'Gaveta' },
  { id: 'folha', nome: 'Folha que sobe' },
  { id: 'estudio', nome: 'Estúdio' },
  { id: 'balao', nome: 'Balão' },
  { id: 'atual', nome: 'Atual' },
];

const CHAVE = 'fornexa_previa_formato_divulgar';

function formatoGuardado(): Formato {
  try {
    const salvo = localStorage.getItem(CHAVE) as Formato | null;
    if (salvo && FORMATOS.some((f) => f.id === salvo)) return salvo;
  } catch {
    // Navegador sem armazenamento: começa pelo primeiro.
  }
  return 'gaveta';
}

interface Props extends DadosDaDivulgacao {
  /** Onde está o botão que abriu — o formato "balão" nasce dali. */
  ancora?: Ancora | null;
  aoFechar: () => void;
}

export default function DivulgarNoFacebook({ ancora = null, aoFechar, ...dados }: Props) {
  const [formato, setFormato] = useState<Formato>(formatoGuardado);

  const escolher = (novo: Formato) => {
    setFormato(novo);
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      // Sem armazenamento, só não lembra na próxima vez.
    }
  };

  return (
    <>
      {formato === 'gaveta' && <DivulgarGaveta key="gaveta" {...dados} aoFechar={aoFechar} />}
      {formato === 'folha' && <DivulgarFolha key="folha" {...dados} aoFechar={aoFechar} />}
      {formato === 'estudio' && <DivulgarEstudio key="estudio" {...dados} aoFechar={aoFechar} />}
      {formato === 'balao' && (
        <DivulgarBalao key="balao" {...dados} ancora={ancora} aoFechar={aoFechar} />
      )}
      {formato === 'atual' && (
        <DivulgarAtual
          produtoId={dados.produtoId}
          titulo={dados.titulo}
          categoria={dados.categoria}
          linkDoAnuncio={dados.linkDoAnuncio}
          aoFechar={aoFechar}
        />
      )}

      <div
        role="group"
        aria-label="Prévia: formato do Divulgar"
        className="fixed top-3 left-1/2 -translate-x-1/2 z-[260] max-w-[calc(100vw-24px)] overflow-x-auto flex items-center gap-1 p-1.5 rounded-full bg-navy-950 text-white shadow-2xl border border-white/10"
      >
        <span className="hidden sm:inline px-3 text-xs font-semibold uppercase tracking-wider text-gold whitespace-nowrap">
          Prévia
        </span>
        {FORMATOS.map((opcao) => (
          <button
            key={opcao.id}
            type="button"
            aria-pressed={formato === opcao.id}
            onClick={() => escolher(opcao.id)}
            className={`min-h-[40px] px-3.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
              formato === opcao.id ? 'bg-gold text-navy-900' : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            {opcao.nome}
          </button>
        ))}
      </div>
    </>
  );
}
