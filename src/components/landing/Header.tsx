import { useEffect, useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * As seções que a barra alcança.
 *
 * Só entram âncoras que existem na página. Link para seção inventada é pior
 * que menu curto: quem clica cai no lugar errado e perde a confiança no resto.
 */
const SECOES = [
  { id: 'beneficios', nome: 'Como funciona' },
  { id: 'planos', nome: 'Planos' },
  { id: 'comecar', nome: 'Começar' },
];

/** Depois disto a barra encolhe. Abaixo, ela volta ao tamanho cheio. */
const ROLAGEM_PARA_ENCOLHER = 80;

/**
 * A barra que encolhe ao rolar.
 *
 * No topo ela é larga e respira: é a primeira coisa que a pessoa vê, e ali
 * cabe presença. Rolando, vira uma pílula estreita — some do caminho do
 * conteúdo sem sumir da tela, porque é dela que sai o botão de assinar.
 *
 * A transição anima só largura, espaçamento e desfoque. Nada muda de ordem
 * nem de lugar: os itens apenas se aproximam, e quem estava lendo não perde
 * a linha.
 */
export default function Header() {
  const [compacta, setCompacta] = useState(false);
  const [secaoVisivel, setSecaoVisivel] = useState<string | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [semAnimacao, setSemAnimacao] = useState(false);

  // Quem pediu menos movimento no sistema recebe a barra já compacta, parada.
  useEffect(() => {
    const preferencia = window.matchMedia('(prefers-reduced-motion: reduce)');

    const aplicar = () => {
      setSemAnimacao(preferencia.matches);
      if (preferencia.matches) setCompacta(true);
    };

    aplicar();
    preferencia.addEventListener('change', aplicar);

    return () => preferencia.removeEventListener('change', aplicar);
  }, []);

  useEffect(() => {
    if (semAnimacao) return;

    let agendado = false;

    // A rolagem dispara dezenas de vezes por segundo. Ler a posição dentro de
    // requestAnimationFrame deixa o navegador medir uma vez por quadro, em vez
    // de brigar com a própria animação.
    const aoRolar = () => {
      if (agendado) return;

      agendado = true;

      requestAnimationFrame(() => {
        setCompacta(window.scrollY > ROLAGEM_PARA_ENCOLHER);
        agendado = false;
      });
    };

    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });

    return () => window.removeEventListener('scroll', aoRolar);
  }, [semAnimacao]);

  // Qual seção está na tela, para o traço amarelo acompanhar a leitura.
  useEffect(() => {
    const alvos = SECOES.map((secao) => document.getElementById(secao.id)).filter(
      (elemento): elemento is HTMLElement => Boolean(elemento)
    );

    if (alvos.length === 0) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas
          .filter((entrada) => entrada.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visivel) setSecaoVisivel(visivel.target.id);
      },
      // A faixa do meio da tela decide: seção que acabou de entrar pelo rodapé
      // não rouba o traço de quem está sendo lida.
      { rootMargin: '-40% 0px -45% 0px', threshold: [0, 0.25, 0.5, 1] }
    );

    alvos.forEach((alvo) => observador.observe(alvo));

    return () => observador.disconnect();
  }, []);

  const irPara = (id: string) => (evento: React.MouseEvent) => {
    evento.preventDefault();
    setMenuAberto(false);

    document.getElementById(id)?.scrollIntoView({
      behavior: semAnimacao ? 'auto' : 'smooth',
    });
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pointer-events-none">
      <header
        className={`pointer-events-auto mt-3 w-full rounded-2xl border bg-navy-900/80 shadow-lg shadow-black/20 ${
          semAnimacao ? '' : 'transition-all duration-[350ms] ease-out'
        } ${
          compacta
            ? 'max-w-[840px] border-white/20 backdrop-blur-xl px-4 py-2'
            : 'max-w-[1400px] border-white/10 backdrop-blur-md px-5 py-3.5'
        }`}
        // 96% da tela no topo, como pedido; a pílula estreita vem do max-width.
        style={{ width: '96%' }}
      >
        <nav className="flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 group shrink-0">
            <div
              className={`rounded-md overflow-hidden bg-navy-900 flex items-center justify-center transition-all duration-300 group-hover:scale-105 ${
                compacta ? 'w-8 h-8' : 'w-10 h-10'
              }`}
            >
              <img
                src="/fornexa-logo.jpeg"
                alt="FORNEXA"
                className="w-full h-full object-cover scale-[2.8]"
              />
            </div>

            {/* A linha cinza fica sob o logo, e não sob os links: é marca de
                identidade, não de navegação — por isso nunca vira o traço
                amarelo da seção. */}
            <span
              className={`text-white font-semibold tracking-tight border-b border-white/15 pb-0.5 transition-all duration-300 ${
                compacta ? 'text-base' : 'text-lg'
              }`}
            >
              FORNEXA
            </span>
          </Link>

          <div
            className={`hidden md:flex items-center transition-all duration-300 ${
              compacta ? 'gap-5' : 'gap-7'
            }`}
          >
            {SECOES.map((secao) => (
              <a
                key={secao.id}
                href={`#${secao.id}`}
                onClick={irPara(secao.id)}
                className="relative text-sm font-medium text-slate-300 hover:text-white transition-colors py-1"
              >
                {secao.nome}

                <span
                  className={`absolute left-0 right-0 -bottom-0.5 h-0.5 rounded-full bg-gold transition-opacity duration-300 ${
                    secaoVisivel === secao.id ? 'opacity-100 shadow-[0_0_8px_rgba(255,200,0,0.7)]' : 'opacity-0'
                  }`}
                />
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4 shrink-0">
            <Link
              to="/dashboard"
              className="text-slate-300 text-sm font-medium hover:text-white transition-colors"
            >
              Login
            </Link>

            <Link
              to="/dashboard"
              className={`inline-flex items-center gap-1.5 bg-gold text-navy-900 rounded-lg font-semibold hover:bg-gold-hover transition-all duration-300 shadow-[0_0_20px_rgba(255,200,0,0.25)] ${
                compacta ? 'px-4 py-2 text-sm' : 'px-5 py-2.5 text-sm'
              }`}
            >
              Assinar agora
              <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>

          {/* No celular a barra não muda de largura — só de altura. Mudar a
              largura numa tela estreita faria a barra pular a cada rolagem. */}
          <button
            type="button"
            onClick={() => setMenuAberto((aberto) => !aberto)}
            aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuAberto}
            className="md:hidden text-white p-1.5"
          >
            {menuAberto ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </nav>

        {menuAberto && (
          <div className="md:hidden mt-3 pt-3 border-t border-white/10 flex flex-col gap-1">
            {SECOES.map((secao) => (
              <a
                key={secao.id}
                href={`#${secao.id}`}
                onClick={irPara(secao.id)}
                className="px-2 py-2.5 rounded-lg text-sm font-medium text-slate-200 hover:bg-white/5"
              >
                {secao.nome}
              </a>
            ))}

            <Link
              to="/dashboard"
              onClick={() => setMenuAberto(false)}
              className="px-2 py-2.5 rounded-lg text-sm font-medium text-slate-200 hover:bg-white/5"
            >
              Login
            </Link>

            <Link
              to="/dashboard"
              onClick={() => setMenuAberto(false)}
              className="mt-1 inline-flex items-center justify-center gap-1.5 bg-gold text-navy-900 rounded-lg px-4 py-2.5 text-sm font-semibold"
            >
              Assinar agora
              <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        )}
      </header>
    </div>
  );
}
