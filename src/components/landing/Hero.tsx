import { Users, Package, Link2, Star } from 'lucide-react';
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
      className={`relative flex items-center justify-center pt-28 pb-24 lg:pt-32 lg:pb-28 bg-navy-900 ${
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
        <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.35fr] gap-10 lg:gap-8 items-center">
          {/* Coluna esquerda — badge, texto, indicadores, CTA e prova social */}
          <div className="text-center lg:text-left">
            {/* O selo "a plataforma nº 1" saiu daqui, e com ele o espaço que
                ocupava: título alto é o que a primeira tela precisa, e
                superlativo sem prova atrás não convence ninguém. */}
            <h1 className="text-4xl md:text-5xl lg:text-[3.4rem] font-bold text-white leading-[1.1] tracking-tight mb-5 animate-slide-up">
              Venda sem ter estoque.{' '}
              <span className="text-gold drop-shadow-lg">Fornecedores cuidam do resto.</span>
            </h1>
            <p
              className="text-base md:text-lg text-slate-400 max-w-xl mx-auto lg:mx-0 mb-8 font-normal leading-relaxed animate-fade-in"
              style={{ animationDelay: '0.1s' }}
            >
              Escolha o produto e anuncie. O resto — estoque, preço, pedido — a FORNEXA
              resolve sozinha.
            </p>

            {/* Indicadores — acima do CTA */}
            <div
              className="flex flex-wrap gap-x-8 gap-y-4 justify-center lg:justify-start mb-8 animate-fade-in"
              style={{ animationDelay: '0.15s' }}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-gold" />
                <div className="text-left">
                  <p className="text-white text-sm font-semibold leading-none">+500</p>
                  <p className="text-slate-500 text-xs mt-1">vendedores ativos</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Package className="w-5 h-5 text-gold" />
                <div className="text-left">
                  <p className="text-white text-sm font-semibold leading-none">+750</p>
                  <p className="text-slate-500 text-xs mt-1">produtos disponíveis</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Link2 className="w-5 h-5 text-gold" />
                <div className="text-left">
                  <p className="text-white text-sm font-semibold leading-none">Integrado</p>
                  <p className="text-slate-500 text-xs mt-1">com Mercado Livre</p>
                </div>
              </div>
            </div>

            <div
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center animate-fade-in"
              style={{ animationDelay: '0.2s' }}
            >
              {/* No celular os dois ocupam a linha inteira, empilhados: dedo
                  acerta botão largo, e lado a lado numa tela estreita cada um
                  ficaria pequeno demais para o texto que carrega. */}
              <a
                href="#planos"
                className="btn-fnx btn-fnx-primario w-full sm:w-auto flex items-center justify-center px-8 py-4 text-base font-semibold"
              >
                <span className="inline-flex items-center gap-2">
                  Começar agora
                  <span>→</span>
                </span>
              </a>
              <a
                href="#beneficios"
                className="btn-fnx btn-fnx-secundario w-full sm:w-auto flex items-center justify-center px-8 py-4 text-base font-medium"
              >
                <span>Como funciona</span>
              </a>
            </div>

            {/* Prova social — pequena e minimalista.
                No celular com a imagem ligada, ela desce para depois dela: a
                frase é o fecho do argumento, e separar o selo do produto que
                ele aprova enfraquece os dois. */}
            <div
              className={`items-center gap-2 justify-center lg:justify-start mt-6 animate-fade-in ${
                vendoAImagemNoMobile ? 'hidden lg:flex' : 'flex'
              }`}
              style={{ animationDelay: '0.25s' }}
            >
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-gold fill-gold" />
                ))}
              </div>
              <span className="text-slate-500 text-sm">
                Aprovado por vendedores de todo o Brasil
              </span>
            </div>
          </div>

          {/* Coluna direita — mockup do Dashboard.
              A imagem "projeto-remover-fundo.png" já tem fundo transparente
              (PNG com canal alpha real) e já vem com a inclinação/perspectiva
              pronta. Por isso aqui NÃO tem borda, NÃO tem rotate/transform,
              e NÃO tem retângulo de fundo — só a imagem flutuando de verdade
              sobre o glow, sem nenhuma caixa ao redor. */}
          {/* No celular a imagem some desde sempre, e é meio hero a menos:
              quem chega por anúncio vê só texto e botão, sem nunca ver o
              produto. Em teste, ela aparece — abaixo do texto, que é onde cabe
              numa coluna só. */}
          <div
            className={`relative ${
              vendoAImagemNoMobile ? 'block' : 'hidden'
            } lg:block animate-fade-in`}
            style={{ animationDelay: '0.15s' }}
          >
            <div className="relative animate-float">
              {/* Ambient Blue Glow — atrás da imagem, difuso, saindo pelas
                  laterais e por baixo */}
              {/* Marcado como brilho do hero: no celular ele some junto com o
                  outro. Desfoque de 130px animado é o que mais pesa na
                  página, e no telefone a conta não cabe. */}
              <div
                className="brilho-do-hero absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 pointer-events-none animate-glow-pulse z-0"
                style={{
                  width: '85%',
                  height: '80%',
                  background:
                    'radial-gradient(circle, #4CCBFF 0%, #2FA7FF 35%, #1E7BA8 55%, transparent 75%)',
                  filter: 'blur(130px)',
                  opacity: 0.65,
                }}
              />

              {/* A própria imagem, sem caixa/borda ao redor — o recorte
                  transparente é o que dá a forma ao mockup */}
              <img
                src={
                  vendoAImagemNova
                    ? '/hero-macbook-caixas.png'
                    : '/projeto-remover-fundo.png'
                }
                alt={
                  vendoAImagemNova
                    ? 'Catálogo FORNEXA no notebook, ao lado de caixas da Shopee e do Mercado Livre'
                    : 'Catálogo FORNEXA — produtos prontos para anunciar'
                }
                // O conjunto novo nasce menor dentro do próprio PNG: o notebook
                // divide o quadro com as duas caixas, e sobra ar em volta. A
                // escala cresce a partir do centro, que é o único jeito de
                // ganhar presença sem avançar sobre o texto à esquerda nem
                // sobre a borda da tela à direita.
                // A escala só entra do notebook para cima: no celular a coluna
                // já é a tela inteira, e crescer ali só empurraria a imagem
                // para fora pelas laterais.
                className={`relative z-10 w-full h-auto block select-none ${
                  vendoAImagemNova ? 'lg:scale-[1.12] xl:scale-[1.22]' : ''
                }`}
                style={{
                  filter: 'drop-shadow(0 40px 100px rgba(30,123,168,0.35))',
                }}
                // Decodificar fora da linha principal: um PNG grande decodificado
                // em primeiro plano trava a rolagem enquanto o navegador o abre.
                decoding="async"
                draggable={false}
              />
            </div>

            {/* A prova social, aqui, só no celular com a imagem ligada. No
                computador ela continua embaixo dos botões, do outro lado. */}
            {vendoAImagemNoMobile && (
              <div className="flex items-center justify-center gap-2 mt-2 lg:hidden">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-gold fill-gold" />
                  ))}
                </div>

                <span className="text-slate-500 text-sm">
                  Aprovado por vendedores de todo o Brasil
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}