import { Link } from 'react-router-dom';
import { Users, Package, Link2, Star } from 'lucide-react';
import { AnimatedGradientBorder } from '../ui/animated-gradient-border';

export default function Hero() {
  const handleScrollToPlans = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById('planos')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative flex items-center justify-center pt-28 pb-24 lg:pt-32 lg:pb-28 overflow-hidden bg-navy-900">
      {/* Grid pattern */}
      <div className="absolute inset-0 grid-pattern opacity-50" />

      {/* Glow suave central (mantido do design original) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/5 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-4 lg:px-6 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-10 lg:gap-8 items-center">
          {/* Coluna esquerda — badge, texto, indicadores, CTA e prova social */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-navy-800/70 border border-navy-600 rounded-full px-4 py-1.5 mb-6 animate-fade-in">
              <Star className="w-3.5 h-3.5 text-gold fill-gold" />
              <span className="text-slate-300 text-xs sm:text-sm font-medium">
                A plataforma nº 1 para dropshipping
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-[3.4rem] font-bold text-white leading-[1.1] tracking-tight mb-5 animate-slide-up">
              Conecte-se aos melhores fornecedores e escale suas vendas{' '}
              <span className="text-gold drop-shadow-lg">em poucos minutos.</span>
            </h1>
            <p
              className="text-base md:text-lg text-slate-400 max-w-xl mx-auto lg:mx-0 mb-8 font-normal leading-relaxed animate-fade-in"
              style={{ animationDelay: '0.1s' }}
            >
              Automatize sua integração com fornecedores, publique produtos direto no
              marketplace e deixe a FORNEXA cuidar do resto.
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
              <Link
                to="/dashboard"
                className="bg-gold text-navy-900 px-8 py-4 rounded-xl text-base font-semibold hover:bg-gold-hover transition-all btn-transition flex items-center gap-2 shadow-lg hover:shadow-xl"
              >
                Começar agora
                <span>→</span>
              </Link>
              <a
                href="#planos"
                onClick={handleScrollToPlans}
                className="text-white border border-slate-700 px-8 py-4 rounded-xl text-base font-medium hover:border-slate-500 hover:bg-slate-800/50 transition-all btn-transition"
              >
                Ver planos
              </a>
            </div>

            {/* Prova social — pequena e minimalista */}
            <div
              className="flex items-center gap-2 justify-center lg:justify-start mt-6 animate-fade-in"
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

          {/* Coluna direita — mockup do Dashboard (catálogo real do FORNEXA) com
              glow azul ambiente atrás. Rotação bem sutil (só 2D) para manter o
              texto da screenshot legível — inclinações 3D fortes borram texto
              pequeno, então preferimos "floating" via sombra + glow. */}
          <div className="relative hidden lg:block animate-fade-in" style={{ animationDelay: '0.15s' }}>
            <div className="relative animate-float">
              {/* Ambient Blue Glow — atrás do mockup, forte e bem difuso */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none animate-glow-pulse z-0"
                style={{
                  width: '85%',
                  height: '90%',
                  background:
                    'radial-gradient(circle, #3BA7FF 0%, #1D9BF0 45%, rgba(29,155,240,0) 75%)',
                  filter: 'blur(130px)',
                  opacity: 0.95,
                }}
              />
              {/* Bloom — reforço central, mais concentrado e brilhante */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none animate-glow-pulse z-0"
                style={{
                  width: '50%',
                  height: '52%',
                  background:
                    'radial-gradient(circle, rgba(220,240,255,0.85) 0%, rgba(59,167,255,0.35) 55%, transparent 78%)',
                  filter: 'blur(60px)',
                }}
              />

              <AnimatedGradientBorder
                animationMode="auto-rotate"
                animationSpeed={10}
                borderWidth={2}
                borderRadius={16}
                gradientColors={{
                  primary: '#0B4C7A',
                  secondary: '#1D9BF0',
                  accent: '#8FD1FF',
                }}
                backgroundColor="#06151E"
                className="relative z-10 shadow-mockup overflow-hidden rotate-[-1.2deg]"
              >
                <img
                  src="/fornexa-catalog-preview.png"
                  alt="Catálogo FORNEXA — produtos prontos para anunciar"
                  className="w-full h-auto block select-none rounded-2xl"
                  draggable={false}
                />
              </AnimatedGradientBorder>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-slate-700 rounded-full flex justify-center pt-2">
          <div className="w-1.5 h-1.5 bg-slate-500 rounded-full" />
        </div>
      </div>
    </section>
  );
}