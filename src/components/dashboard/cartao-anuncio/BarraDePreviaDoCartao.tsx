import type { FormatoDoCartao } from './CartaoDoAnuncio';

/**
 * PRÉVIA — branch feat/cards-anuncios. A barra que troca o desenho dos cards
 * de Meus Anúncios. Escolhido o formato, ela sai.
 */

const FORMATOS: { id: FormatoDoCartao; nome: string }[] = [
  { id: 'vitrine', nome: 'Vitrine' },
  { id: 'raiox', nome: 'Raio-X' },
  { id: 'linha', nome: 'Linha' },
  { id: 'atual', nome: 'Atual' },
];

const CHAVE = 'fornexa_previa_formato_cartao';

export function formatoDoCartaoGuardado(): FormatoDoCartao {
  try {
    const salvo = localStorage.getItem(CHAVE) as FormatoDoCartao | null;
    if (salvo && FORMATOS.some((f) => f.id === salvo)) return salvo;
  } catch {
    // Sem armazenamento: começa pela vitrine.
  }
  return 'vitrine';
}

export default function BarraDePreviaDoCartao({
  formato,
  aoEscolher,
}: {
  formato: FormatoDoCartao;
  aoEscolher: (formato: FormatoDoCartao) => void;
}) {
  const escolher = (novo: FormatoDoCartao) => {
    aoEscolher(novo);
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      // Só não lembra na próxima vez.
    }
  };

  return (
    <div
      role="group"
      aria-label="Prévia: desenho dos cards"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[150] max-w-[calc(100vw-24px)] overflow-x-auto flex items-center gap-1 p-1.5 rounded-full bg-navy-950 text-white shadow-2xl border border-white/10"
    >
      <span className="hidden sm:inline px-3 text-xs font-semibold uppercase tracking-wider text-gold whitespace-nowrap">
        Prévia dos cards
      </span>
      {FORMATOS.map((opcao) => (
        <button
          key={opcao.id}
          type="button"
          aria-pressed={formato === opcao.id}
          onClick={() => escolher(opcao.id)}
          className={`min-h-[40px] px-4 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
            formato === opcao.id ? 'bg-gold text-navy-900' : 'text-slate-300 hover:bg-white/10'
          }`}
        >
          {opcao.nome}
        </button>
      ))}
    </div>
  );
}
