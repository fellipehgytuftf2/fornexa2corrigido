import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package } from 'lucide-react';

/**
 * Moldura das telas de login e cadastro.
 *
 * A tela abre toda azul petróleo, com a marca. Sozinha, sem a pessoa apertar
 * nada, a folha clara sobe de baixo com a borda curva, a marca sobe junto
 * para o topo e o formulário aparece dentro da folha. No PC (>= 900px) a
 * faixa azul ganha a trilha do pedido, com o pacote andando entre as etapas.
 *
 * Quem troca entre login e cadastro pelo link de baixo chega com
 * `state: { semAnimacao: true }` e já encontra a folha aberta — a animação é
 * da chegada à página, não de cada troca de formulário.
 *
 * O formulário fica numa caixa branca dentro da folha. A cada erro a página
 * aumenta `tremer` e a caixa treme; com `sucesso`, a logo pulsa em amarelo
 * enquanto o "Tudo certo!" aparece (ver SucessoAcesso).
 *
 * Os estilos (folha, curva, tempos, trilha e animações do formulário) estão
 * em src/index.css, nas seções "Tela de acesso" e "Animações do formulário".
 */

const PREFERE_MENOS_MOVIMENTO =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Marca({ brilhando }: { brilhando: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <div
          className={`w-12 h-12 min-[900px]:w-[52px] min-[900px]:h-[52px] shrink-0 rounded-[10px] min-[900px]:rounded-xl overflow-hidden bg-navy-900 ${
            brilhando ? 'acesso-brilho' : ''
          }`}
        >
          <img
            src="/fornexa-logo.jpeg"
            alt=""
            className="w-full h-full object-cover scale-[2.8]"
            draggable={false}
          />
        </div>
        <span className="font-display font-semibold text-white text-[28px] min-[900px]:text-[34px] tracking-[0.08em]">
          FORNEXA
        </span>
      </div>
      <p className="mt-3.5 max-w-[320px] text-[15px] min-[900px]:text-base leading-relaxed text-[#9AA8B2]">
        Do catálogo ao anúncio publicado, em minutos.
      </p>
    </div>
  );
}

const ETAPAS = [
  { nome: 'Catálogo', classe: '', cor: '#FFFFFF' },
  { nome: 'Anúncio', classe: 'mx-2', cor: '#5E6E79' },
  { nome: 'Pedido', classe: 'mx-3', cor: '#5E6E79' },
  { nome: 'Enviado', classe: 'mx-4', cor: '#5E6E79' },
];

/** A trilha do pedido com o pacote andando. Some abaixo de 900px (CSS). */
function TrilhaDoPedido() {
  return (
    <div
      className="mx-trilha absolute top-16 w-[520px]"
      style={{ right: 'clamp(24px, 6vw, 80px)' }}
      aria-hidden="true"
    >
      <div className="relative h-10 mx-5">
        <div className="absolute inset-x-0 top-[19px] h-0.5 bg-white/[0.12]" />
        <div className="mx-fill absolute left-0 top-[19px] h-0.5 w-0 bg-gold" />

        {[0, 160, 320, 480].map((posicao, indice) => (
          <div
            key={posicao}
            className="absolute top-[15px] w-2.5 h-2.5 rounded-full"
            style={{
              left: posicao - 5,
              background: indice === 0 ? '#FFD300' : '#2A3A45',
            }}
          />
        ))}

        <div className="mx-pk absolute left-0 top-0 -ml-5 w-10 h-10 rounded-full bg-gold text-navy-900 flex items-center justify-center shadow-[0_0_0_6px_rgba(255,211,0,0.15)]">
          <Package className="mx-ico w-5 h-5" strokeWidth={2.2} />
        </div>
      </div>

      <div className="relative h-5 mt-3.5 mx-5 text-[13px] font-semibold whitespace-nowrap">
        {ETAPAS.map((etapa, indice) => (
          <span
            key={etapa.nome}
            className={`absolute -translate-x-1/2 ${etapa.classe}`}
            style={{ left: indice * 160, color: etapa.cor }}
          >
            {etapa.nome}
          </span>
        ))}
      </div>
    </div>
  );
}

interface TelaDeAcessoProps {
  children: ReactNode;
  /** Contador de erros: cada vez que aumenta, a caixa do formulário treme. */
  tremer?: number;
  /** Deu certo: a logo pulsa enquanto a página mostra o "Tudo certo!". */
  sucesso?: boolean;
}

export default function TelaDeAcesso({ children, tremer = 0, sucesso = false }: TelaDeAcessoProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const semAnimacao =
    (location.state as { semAnimacao?: boolean } | null)?.semAnimacao === true;

  const [aberto, setAberto] = useState(semAnimacao || PREFERE_MENOS_MOVIMENTO);

  useEffect(() => {
    // Tira o aviso do histórico: se a pessoa recarregar a página, a animação
    // de chegada volta a acontecer normalmente.
    if (semAnimacao) {
      navigate(location.pathname + location.search, { replace: true, state: null });
    }

    if (aberto) return;

    const temporizador = window.setTimeout(() => setAberto(true), 450);
    return () => window.clearTimeout(temporizador);
    // Só na chegada à página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`acesso-tela font-sans ${aberto ? 'is-aberto' : ''}`}>
      <div className="acesso-marca">
        <Link
          to="/"
          className="inline-block rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:ring-offset-4 focus-visible:ring-offset-navy-950"
          aria-label="FORNEXA — página inicial"
        >
          <Marca brilhando={sucesso} />
        </Link>
      </div>

      <TrilhaDoPedido />

      <div className="acesso-folha">
        <svg
          className="acesso-curva"
          viewBox="0 0 390 152"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,70 C80,115 150,140 235,128 C310,117 360,60 390,0 L390,152 L0,152 Z"
            fill="#F4F6F7"
          />
        </svg>

        <main className="acesso-conteudo px-5 pb-8 min-[900px]:px-6 min-[900px]:pb-10">
          <div className="mx-auto w-full max-w-[420px] flex flex-col gap-3">
            <Link
              to="/"
              aria-label="Voltar para o início"
              className="-ml-2.5 w-11 h-11 flex items-center justify-center rounded-full text-[#06151E] transition-colors hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#06151E]/40"
            >
              <ArrowLeft className="w-[22px] h-[22px]" aria-hidden="true" />
            </Link>

            <div
              className={`rounded-2xl border border-[#E1E6E9] bg-white p-6 min-[900px]:p-9 shadow-[0_1px_2px_rgba(6,21,30,0.04),0_12px_32px_-12px_rgba(6,21,30,0.12)] flex flex-col gap-[18px] ${
                tremer === 0 ? '' : tremer % 2 ? 'acesso-treme-a' : 'acesso-treme-b'
              }`}
            >
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
