import { Link } from 'react-router-dom';
import { Users, Package, Link2, Star } from 'lucide-react';

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

      <div className="relative z-10 max-w-7xl mx-auto px-6 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-10 items-center">
          {/* Coluna esquerda — texto, CTA, prova social e indicadores */}
          <div className="text-center lg:text-left">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-5 animate-slide-up">
              Conecte-se aos melhores fornecedores e escale{' '}
              <span className="text-gold drop-shadow-lg">suas vendas</span>{' '}
              em poucos minutos.
            </h1>

            <p
              className="text-base md:text-lg text-slate-400 max-w-xl mx-auto lg:mx-0 mb-8 font-normal leading-relaxed animate-fade-in"
              style={{ animationDelay: '0.1s' }}
            >
              Automatize sua integração com fornecedores, publique produtos direto no
              marketplace e deixe a FORNEXA cuidar do resto.
            </p>

            <div
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center animate-fade-in"
              style={{ animationDelay: '0.2s' }}
            >
              <Link
                to="/dashboard"
                className="bg-white text-black px-8 py-4 rounded-xl text-base font-semibold hover:bg-slate-100 transition-all btn-transition flex items-center gap-2 shadow-lg hover:shadow-xl"
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

            {/* Indicadores */}
            <div
              className="flex flex-wrap gap-x-8 gap-y-4 justify-center lg:justify-start mt-10 pt-8 border-t border-navy-600 animate-fade-in"
              style={{ animationDelay: '0.3s' }}
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
                  <p className="text-white text-sm font-semibold leading-none">+20 mil</p>
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
          </div>

          {/* Coluna direita — mockup do Dashboard (catálogo real do FORNEXA),
              estilo "monitor flutuando": leve rotação, glow e sombra suave */}
          <div
            className="relative hidden lg:block animate-fade-in"
            style={{ animationDelay: '0.15s' }}
          >
            {/* Glow azulado atrás do mockup, respirando lentamente */}
            <div
              className="absolute -inset-8 rounded-[2rem] blur-2xl animate-glow-pulse"
              style={{
                background:
                  'radial-gradient(circle, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 55%, transparent 75%)',
              }}
            />

            <div
              className="relative animate-float"
              style={{ perspective: '1200px' }}
            >
              <div
                className="rounded-2xl border border-navy-600 shadow-mockup overflow-hidden"
                style={{ transform: 'rotate(-2.5deg)' }}
              >
                <img
                  src="/fornexa-catalog-preview.png"
                  alt="Catálogo FORNEXA — produtos prontos para anunciar"
                  className="w-full h-auto block"
                />
              </div>
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