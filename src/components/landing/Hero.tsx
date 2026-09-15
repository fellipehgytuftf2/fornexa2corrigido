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

      <div className="relative z-10 max-w-[1500px] mx-auto px-4 lg:px-6 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.35fr] gap-10 lg:gap-8 items-center">
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

          {/* Coluna direita — mockup do Dashboard.
              A imagem "projeto-remover-fundo.png" já tem fundo transparente
              (PNG com canal alpha real) e já vem com a inclinação/perspectiva
              pronta. Por isso aqui NÃO tem borda, NÃO tem rotate/transform,
              e NÃO tem retângulo de fundo — só a imagem flutuando de verdade
              sobre o glow, sem nenhuma caixa ao redor. */}
          <div className="relative hidden lg:block animate-fade-in" style={{ animationDelay: '0.15s' }}>
            <div className="relative animate-float">
              {/* Ambient Blue Glow — atrás da imagem, difuso, saindo pelas
                  laterais e por baixo */}
              <div
                className="absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 pointer-events-none animate-glow-pulse z-0"
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
                src="/projeto-remover-fundo.png"
                alt="Catálogo FORNEXA — produtos prontos para anunciar"
                className="relative z-10 w-full h-auto block select-none"
                style={{
                  filter: 'drop-shadow(0 40px 100px rgba(30,123,168,0.35))',
                }}
                draggable={false}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}