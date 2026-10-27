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
 * No topo ela é larga e respira; rolando, vira uma pílula estreita que sai do
 * caminho do conteúdo sem sair da tela — é dela que sai o botão de assinar.
 *
 * A PRIMEIRA VERSÃO DESTA BARRA TRAVOU A LANDING, e esta nasceu dos três
 * motivos possíveis daquilo:
 *
 * 1. `IntersectionObserver` para acender o traço da seção. Saiu: a mesma
 *    resposta vem de uma conta simples na rolagem que já existe, sem um
 *    segundo mecanismo observando a página inteira.
 *
 * 2. O menu do celular abria DENTRO da pílula. Numa tela estreita isso muda a
 *    altura da barra enquanto ela anima a largura — duas animações brigando
 *    pelo mesmo elemento, a cada quadro. Agora o menu é um painel solto,
 *    abaixo da barra, e a barra não muda de tamanho ao abrir.
 *
 * 3. `transition-all`, que anima tudo que mudar de classe, inclusive sombra e
 *    cor de borda. Trocado por transições nomeadas: largura, espaçamento,
 *    desfoque.
 *
 * E depois de tudo isso ela ainda travava ao clicar nos links — que disparam
 * rolagem suave. O culpado era o `backdrop-blur`: a barra desfocava o que
 * passava atrás dela, e atrás dela passa o brilho do hero, que já é um
 * desfoque de 130px animado. A cada quadro da rolagem o navegador refazia os
 * dois, com a barra mudando de largura no meio.
 *
 * O fundo agora é quase opaco, sem desfoque. Perde-se o vidro; ganha-se uma
 * página que rola.
 */
export default function Header() {
  const [compacta, setCompacta] = useState(false);
  const [secaoVisivel, setSecaoVisivel] = useState<string | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    // `matchMedia` existe em tudo que interessa, mas `addEventListener` nele
    // só a partir do Safari 14 — e Safari velho é exatamente o aparelho onde
    // a landing já travou uma vez. Aqui ele é lido uma vez, sem ouvinte: quem
    // mudar a preferência no meio da visita recarrega a página de qualquer
    // forma.
    let prefereParado = false;

    try {
      prefereParado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      prefereParado = false;
    }

    if (prefereParado) {
      setCompacta(true);
      return;
    }

    let agendado = false;

    const medir = () => {
      agendado = false;

      const posicao = window.scrollY;

      setCompacta(posicao > ROLAGEM_PARA_ENCOLHER);

      // Qual seção está sendo lida: a última cujo topo já passou do meio da
      // tela. É a mesma resposta que um observador daria, numa conta que roda
      // junto com a que já estamos fazendo.
      const meio = posicao + window.innerHeight / 2;

      let atual: string | null = null;

      for (const secao of SECOES) {
        const elemento = document.getElementById(secao.id);

        if (elemento && elemento.offsetTop <= meio) {
          atual = secao.id;
        }
      }

      setSecaoVisivel(atual);
    };

    const aoRolar = () => {
      if (agendado) return;

      agendado = true;
      requestAnimationFrame(medir);
    };

    medir();
    window.addEventListener('scroll', aoRolar, { passive: true });

    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

  const irPara = (id: string) => (evento: { preventDefault: () => void }) => {
    evento.preventDefault();
    setMenuAberto(false);

    const destino = document.getElementById(id);

    if (!destino) return;

    destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 px-3 pointer-events-none">
      <header
        className={`pointer-events-auto mt-3 mx-auto w-[96%] rounded-2xl border bg-navy-900 shadow-lg shadow-black/20 [transition:max-width_350ms_ease-out,padding_350ms_ease-out] ${
          compacta
            ? 'max-w-[840px] border-white/20 px-4 py-2'
            : 'max-w-[1400px] border-white/10 px-5 py-3.5'
        }`}
      >
        <nav className="flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 group shrink-0">
            <div
              className={`rounded-md overflow-hidden bg-navy-900 flex items-center justify-center [transition:width_300ms_ease-out,height_300ms_ease-out] ${
                compacta ? 'w-8 h-8' : 'w-10 h-10'
              }`}
            >
              <img
                src="/fornexa-logo.jpeg"
                alt="FORNEXA"
                className="w-full h-full object-cover scale-[2.8]"
              />
            </div>

            {/* A linha cinza fica sob o logo, e não sob os links: é detalhe de
                identidade, não de navegação — por isso nunca se confunde com o
                traço amarelo da seção. */}
            <span className="text-white font-semibold text-lg tracking-tight border-b border-white/15 pb-0.5">
              FORNEXA
            </span>
          </Link>

          <div
            className={`hidden md:flex items-center [transition:gap_300ms_ease-out] ${
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
                    secaoVisivel === secao.id
                      ? 'opacity-100 shadow-[0_0_8px_rgba(255,200,0,0.7)]'
                      : 'opacity-0'
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
              className="inline-flex items-center gap-1.5 bg-gold text-navy-900 rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-gold-hover transition-colors shadow-[0_0_20px_rgba(255,200,0,0.25)]"
            >
              Assinar agora
              <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>

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
      </header>

      {/* O menu fica FORA da barra, de propósito.
          Dentro dela, abrir mudava a altura do mesmo elemento que anima a
          largura, e o celular travava. Aqui ele é um painel próprio: a barra
          não se mexe quando ele aparece. */}
      {menuAberto && (
        <div className="pointer-events-auto md:hidden mx-auto mt-2 w-[96%] max-w-[840px] rounded-2xl border border-white/15 bg-navy-900 p-2 shadow-lg shadow-black/30">
          {SECOES.map((secao) => (
            <a
              key={secao.id}
              href={`#${secao.id}`}
              onClick={irPara(secao.id)}
              className="block px-3 py-2.5 rounded-lg text-sm font-medium text-slate-200 hover:bg-white/5"
            >
              {secao.nome}
            </a>
          ))}

          <Link
            to="/dashboard"
            onClick={() => setMenuAberto(false)}
            className="block px-3 py-2.5 rounded-lg text-sm font-medium text-slate-200 hover:bg-white/5"
          >
            Login
          </Link>

          <Link
            to="/dashboard"
            onClick={() => setMenuAberto(false)}
            className="mt-1 flex items-center justify-center gap-1.5 bg-gold text-navy-900 rounded-lg px-4 py-2.5 text-sm font-semibold"
          >
            Assinar agora
            <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
