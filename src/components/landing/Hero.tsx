import { Users, Package, Link2, Star } from 'lucide-react';
import NumeroQueSobe from './NumeroQueSobe';
import { useFuncionalidade } from '../../lib/funcionalidades';

export default function Hero() {
  /**
   * A imagem nova do hero, em teste.
   *
   * A landing é pública e quem chega nela não está logado — então visitante
   * nenhum vê a troca. Quem enxerga é a conta admin, navegando logada, até o
   * lançamento.
   *
   * A resposta demora um instante para chegar, e por isso a imagem atual
   * aparece primeiro: segurar o hero inteiro esperando um interruptor de teste
   * atrasaria a página de quem não tem nada a ver com o teste.
   */
  const { liberada: vendoAImagemNova } = useFuncionalidade('landing-imagem-nova');

  /**
   * A imagem aparecendo no celular, em teste.
   *
   * Separada da marca acima de propósito: são duas perguntas diferentes —
   * qual imagem mostrar, e se ela aparece no celular. Uma pode ser lançada sem
   * a outra.
   */
  const { liberada: vendoAImagemNoMobile } = useFuncionalidade('landing-imagem-no-mobile');

  /** Qualquer uma das duas ligadas quer dizer: esta pessoa está testando. */
  const testandoALanding = vendoAImagemNova || vendoAImagemNoMobile;

  return (
    <section
      // O corte reto no fim do hero vinha daqui.
      //
      // Todas as seções da landing já são da mesma cor — não há mudança de
      // fundo entre elas. O que criava a linha era o `overflow-hidden`: ele
      // corta na borda da seção os dois brilhos desfocados que moram dentro
      // dela (o branco central e o azul atrás da imagem). Desfoque cortado
      // reto tem borda nítida, e a borda atravessava a tela.
      //
      // Com `overflow-x-clip`, os brilhos vazam para baixo e morrem aos poucos
      // sobre a seção seguinte, como brilho faz. O eixo horizontal continua
      // travado — sem isso um brilho largo criaria rolagem lateral no celular.
      className={`relative flex items-center justify-center pt-28 pb-24 lg:pt-32 lg:pb-28 lg:min-h-screen bg-navy-900 ${
        testandoALanding ? 'overflow-x-clip' : 'overflow-hidden'
      }`}
    >
      {/* Grid pattern */}
      <div className="absolute inset-0 grid-pattern opacity-50" />

      {/* Glow suave central (mantido do design original) */}
      <div className="brilho-do-hero absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/5 rounded-full blur-3xl" />

      {/* O corte no fim do hero.
          As duas camadas acima — a grade e o brilho — terminam junto com a
          seção, e o fundo da seção seguinte é a mesma cor sem elas. Dá uma
          faixa de tom diferente atravessando a tela, que parece emenda de
          página mal feita.
          Esta camada apaga as duas aos poucos nos últimos 160px, e a emenda
          deixa de existir. */}
      {/* A grade termina junto com a seção, e linha de grade também marca
          borda. Esta camada apaga só a grade nos últimos 160px — os brilhos
          passam por cima dela, porque agora não são mais cortados. */}
      {testandoALanding && (
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-navy-900 pointer-events-none z-[1]" />
      )}

      <div className="relative z-10 max-w-[1500px] mx-auto px-4 lg:px-6 w-full">
        <div className="flex justify-center">
          {/* Texto centralizado — sem a imagem ao lado */}
          <div className="text-center max-w-7xl">
            {/* O selo "a plataforma nº 1" saiu daqui, e com ele o espaço que
                ocupava: título alto é o que a primeira tela precisa, e
                superlativo sem prova atrás não convence ninguém. */}
            <h1 className="text-4xl md:text-5xl lg:text-[3.75rem] xl:text-[4.25rem] font-bold text-white leading-[1.1] tracking-tight mb-6 lg:mb-8 animate-slide-up">
              Venda sem ter estoque.{' '}
              <span className="text-gold drop-shadow-lg md:block">Fornecedores cuidam do resto.</span>
            </h1>
            <p
              className="text-base md:text-lg lg:text-xl text-slate-400 max-w-xl lg:max-w-2xl mx-auto mb-8 lg:mb-10 font-normal leading-relaxed animate-fade-in"
              style={{ animationDelay: '0.1s' }}
            >
              Escolha o produto e anuncie. O resto (estoque, preço e pedido) a FORNEXA
              resolve sozinha.
            </p>

            {/* Indicadores — acima do CTA */}
            <div
              className="flex flex-wrap gap-x-8 lg:gap-x-12 gap-y-4 justify-center mb-8 lg:mb-10 animate-fade-in"
              style={{ animationDelay: '0.15s' }}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 lg:w-6 lg:h-6 text-gold" />
                <div className="text-left">
                  <p className="text-white text-sm lg:text-base font-semibold leading-none">+<NumeroQueSobe valor={500} /></p>
                  <p className="text-slate-500 text-xs lg:text-sm mt-1">vendedores ativos</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Package className="w-5 h-5 lg:w-6 lg:h-6 text-gold" />
                <div className="text-left">
                  <p className="text-white text-sm lg:text-base font-semibold leading-none">+<NumeroQueSobe valor={750} /></p>
                  <p className="text-slate-500 text-xs lg:text-sm mt-1">produtos disponíveis</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Link2 className="w-5 h-5 lg:w-6 lg:h-6 text-gold" />
                <div className="text-left">
                  <p className="text-white text-sm lg:text-base font-semibold leading-none">Integrado</p>
                  <p className="text-slate-500 text-xs lg:text-sm mt-1">com Mercado Livre</p>
                </div>
              </div>
            </div>

            <div
              className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in"
              style={{ animationDelay: '0.2s' }}
            >
              {/* No celular os dois ocupam a linha inteira, empilhados: dedo
                  acerta botão largo, e lado a lado numa tela estreita cada um
                  ficaria pequeno demais para o texto que carrega. */}
              <a
                href="#planos"
                className="btn-fnx btn-fnx-primario w-full sm:w-auto flex items-center justify-center px-8 py-4 lg:px-9 lg:py-4 text-base lg:text-lg font-semibold"
              >
                <span className="inline-flex items-center gap-2">
                  Começar agora
                  <span>→</span>
                </span>
              </a>
              <a
                href="#beneficios"
                className="btn-fnx btn-fnx-secundario w-full sm:w-auto flex items-center justify-center px-8 py-4 lg:px-9 lg:py-4 text-base lg:text-lg font-medium"
              >
                <span>Como funciona</span>
              </a>
            </div>

            {/* Prova social — pequena e minimalista.
                No celular com a imagem ligada, ela desce para depois dela: a
                frase é o fecho do argumento, e separar o selo do produto que
                ele aprova enfraquece os dois. */}
            <div
              className="flex items-center gap-2 justify-center mt-6 animate-fade-in"
              style={{ animationDelay: '0.25s' }}
            >
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-gold fill-gold" />
                ))}
              </div>
              <span className="text-slate-500 text-sm lg:text-base">
                Aprovado por vendedores de todo o Brasil
              </span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}