import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label?: string;
}

/**
 * Navegação de páginas, extraída do Catálogo pra reusar em toda lista
 * grande do painel (Meus Produtos, Pedidos, Financeiro, Chamados...).
 *
 * Sempre mostra a primeira e a última página, a atual e as vizinhas, com
 * reticências no lugar do que foi omitido — evita uma fileira de botões
 * quando a lista crescer.
 */
export default function Pagination({ page, totalPages, onPageChange, label = 'Páginas' }: PaginationProps) {
  const paginasVisiveis = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const paginas = new Set([1, totalPages, page]);

    if (page - 1 > 1) paginas.add(page - 1);
    if (page + 1 < totalPages) paginas.add(page + 1);

    const ordenadas = [...paginas].sort((a, b) => a - b);
    const comLacunas: (number | 'lacuna')[] = [];

    ordenadas.forEach((pagina, indice) => {
      if (indice > 0 && pagina - ordenadas[indice - 1] > 1) {
        comLacunas.push('lacuna');
      }
      comLacunas.push(pagina);
    });

    return comLacunas;
  }, [totalPages, page]);

  if (totalPages <= 1) {
    return null;
  }

  // Troca de página some com o que estava na tela e desenha outra lista do
  // zero — sem voltar ao topo, quem clicou "Próxima" no fim de uma lista
  // comprida continua com a rolagem lá embaixo, agora sobre conteúdo que
  // não tem relação com o que estava vendo.
  const irPara = (novaPagina: number) => {
    onPageChange(novaPagina);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
      <button
        onClick={() => irPara(Math.max(1, page - 1))}
        disabled={page === 1}
        className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-gray-200 dark:border-navy-700 text-sm font-medium text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4" />
        Anterior
      </button>

      {paginasVisiveis.map((pagina, indice) =>
        pagina === 'lacuna' ? (
          <span
            key={`lacuna-${indice}`}
            className="w-9 h-9 flex items-center justify-center text-gray-400"
          >
            …
          </span>
        ) : (
          <button
            key={pagina}
            onClick={() => irPara(pagina)}
            aria-current={pagina === page ? 'page' : undefined}
            className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
              pagina === page
                ? 'bg-black text-white dark:bg-white dark:text-navy-900'
                : 'border border-gray-200 dark:border-navy-700 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700'
            }`}
          >
            {pagina}
          </button>
        )
      )}

      <button
        onClick={() => irPara(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-gray-200 dark:border-navy-700 text-sm font-medium text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Próxima
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
}
