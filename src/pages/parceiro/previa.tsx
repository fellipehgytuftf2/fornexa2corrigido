import { Link, useLocation } from 'react-router-dom';
import { Eye } from 'lucide-react';

/**
 * PRÉVIA — branch feat/area-do-parceiro.
 *
 * As telas da área do parceiro (afiliado) ainda não falam com o banco: tudo o
 * que aparece aqui é exemplo, para decidir o desenho e o caminho antes de
 * construir a parte de verdade (convite, papel "afiliado", painel com os
 * números dele).
 */

export const PARCEIRO_DE_EXEMPLO = {
  nome: 'João Pereira',
  email: 'joao.pereira@gmail.com',
  apelido: 'joao',
  convidadoPor: 'FORNEXA',
};

/** Faixa que avisa que nada aqui é de verdade ainda. */
export function FaixaDePrevia() {
  const { pathname } = useLocation();

  return (
    <div className="fixed z-[300] top-2 left-1/2 -translate-x-1/2 min-[900px]:top-auto min-[900px]:bottom-4 min-[900px]:left-4 min-[900px]:translate-x-0 max-w-[calc(100vw-16px)] flex items-center gap-1 p-1.5 rounded-full bg-navy-950 text-white shadow-2xl border border-white/10 overflow-x-auto">
      <span className="inline-flex items-center gap-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-gold whitespace-nowrap">
        <Eye className="w-4 h-4" aria-hidden="true" />
        Prévia
      </span>
      {[
        ['/parceiro/previa/convidar', '1 · Convidar'],
        ['/parceiro/convite/exemplo', '2 · Convite'],
        ['/parceiro/entrar', '3 · Login'],
        ['/parceiro', '4 · Área'],
      ].map(([para, rotulo]) => (
        <Link
          key={para}
          to={para}
          className="min-h-[38px] inline-flex items-center px-3 rounded-full text-[13px] font-semibold whitespace-nowrap text-slate-300 hover:bg-white/10 aria-[current=page]:bg-gold aria-[current=page]:text-navy-900"
          aria-current={pathname === para ? 'page' : undefined}
        >
          {rotulo}
        </Link>
      ))}
    </div>
  );
}
