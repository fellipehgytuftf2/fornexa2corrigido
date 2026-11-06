import { Check, Link2, MessageCircle, User, Users } from 'lucide-react';
import { CANAIS, TONS, type Canal, type Tom } from './useDivulgacao';

/** Peças que os formatos de "Divulgar" repetem. */

export function IconeDoCanal({ canal, className }: { canal: Canal; className?: string }) {
  const Icone = { grupos: Users, perfil: User, whatsapp: MessageCircle, link: Link2 }[canal];
  return <Icone className={className} aria-hidden="true" />;
}

export function EscolhaDeTom({
  tom,
  aoEscolher,
  escuro = false,
}: {
  tom: Tom;
  aoEscolher: (tom: Tom) => void;
  escuro?: boolean;
}) {
  return (
    <div role="group" aria-label="Tom da mensagem" className="flex flex-wrap gap-2">
      {TONS.map((opcao) => {
        const ativo = opcao.id === tom;
        return (
          <button
            key={opcao.id}
            type="button"
            aria-pressed={ativo}
            onClick={() => aoEscolher(opcao.id)}
            className={`min-h-[40px] px-3.5 rounded-full text-sm font-semibold border transition-colors ${
              ativo
                ? 'bg-navy-900 text-white border-navy-900 dark:bg-white dark:text-navy-900 dark:border-white'
                : escuro
                  ? 'border-white/15 text-slate-300 hover:border-white/40'
                  : 'border-gray-200 text-navy-900 hover:border-navy-900 dark:border-navy-700 dark:text-slate-200 dark:hover:border-slate-400'
            }`}
          >
            {opcao.nome}
          </button>
        );
      })}
    </div>
  );
}

export function CampoDaMensagem({
  id,
  valor,
  aoMudar,
  linhas = 5,
}: {
  id: string;
  valor: string;
  aoMudar: (texto: string) => void;
  linhas?: number;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2"
      >
        Mensagem
      </label>
      <textarea
        id={id}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        rows={linhas}
        className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-navy-900 border border-gray-200 dark:border-navy-700 text-[15px] text-navy-900 dark:text-white leading-relaxed resize-y focus:outline-none focus:border-navy-900 dark:focus:border-gold focus:ring-2 focus:ring-navy-900/10 dark:focus:ring-gold/20"
      />
    </div>
  );
}

/** Uma linha por canal: ícone, o que faz e o resultado do clique. */
export function ListaDeCanais({
  feito,
  aoUsar,
  escuro = false,
}: {
  feito: Canal | null;
  aoUsar: (canal: Canal) => void;
  escuro?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {CANAIS.map((canal) => {
        const pronto = feito === canal.id;
        return (
          <button
            key={canal.id}
            type="button"
            onClick={() => aoUsar(canal.id)}
            className={`group w-full min-h-[64px] flex items-center gap-3.5 px-3.5 py-3 rounded-2xl border text-left transition-all ${
              pronto
                ? 'border-gold bg-gold/15'
                : escuro
                  ? 'border-white/10 hover:border-white/30 hover:bg-white/5'
                  : 'border-gray-200 dark:border-navy-700 hover:border-navy-900 dark:hover:border-slate-400 hover:-translate-y-0.5'
            }`}
          >
            <span
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                pronto ? 'bg-gold text-navy-900' : 'bg-navy-900 text-gold dark:bg-navy-950'
              }`}
            >
              {pronto ? (
                <Check className="w-5 h-5" strokeWidth={2.6} aria-hidden="true" />
              ) : (
                <IconeDoCanal canal={canal.id} className="w-5 h-5" />
              )}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-[15px] font-semibold ${
                  escuro ? 'text-white' : 'text-navy-900 dark:text-white'
                }`}
              >
                {pronto ? 'Feito!' : canal.nome}
              </span>
              <span
                className={`block text-xs mt-0.5 ${
                  escuro ? 'text-slate-400' : 'text-gray-500 dark:text-slate-400'
                }`}
              >
                {canal.detalhe}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function AvisoDeQuemPublica({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-gray-500 dark:text-slate-400 ${className}`}>
      Você publica em cada lugar. A FORNEXA deixa o texto pronto e abre o caminho — o
      Facebook não aceita publicação automática.
    </p>
  );
}
