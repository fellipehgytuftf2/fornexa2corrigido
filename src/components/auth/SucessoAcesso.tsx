/**
 * O "Tudo certo!" que aparece na caixa do formulário quando o login ou o
 * cadastro dá certo: um check que se desenha, o texto do que vem a seguir e
 * uma barrinha que enche no mesmo tempo que a página leva para trocar de tela.
 */
export default function SucessoAcesso({
  texto,
  duracaoMs,
}: {
  texto: string;
  duracaoMs: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-[18px] py-6 text-center"
    >
      <div className="acesso-pop w-16 h-16 rounded-full bg-gold text-navy-900 flex items-center justify-center">
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path className="acesso-check" d="M5 12l5 5 9-10" />
        </svg>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="font-display text-[22px] font-semibold text-[#06151E]">Tudo certo!</p>
        <p className="text-sm text-[#5B6770]">{texto}</p>
      </div>

      <div className="w-full h-1 rounded bg-[#E9EDF0] overflow-hidden">
        <div
          className="acesso-barra h-full rounded bg-gold"
          style={{ animationDuration: `${duracaoMs}ms` }}
        />
      </div>
    </div>
  );
}
