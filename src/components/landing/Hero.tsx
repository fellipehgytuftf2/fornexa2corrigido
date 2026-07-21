import { Link } from 'react-router-dom';

export default function Hero() {
  const handleScrollToPlans = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById('planos')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20 pb-32 overflow-hidden bg-navy-900">
      {/* Grid pattern */}
      <div className="absolute inset-0 grid-pattern opacity-50" />

      {/* Glow effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/5 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-tight tracking-tight mb-6 animate-slide-up">
          Produtos prontos para vender nos{' '}
          <span className="text-gold drop-shadow-lg">maiores marketplaces</span> do Brasil.
        </h1>

        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 font-normal leading-relaxed animate-fade-in" style={{ animationDelay: '0.1s' }}>
          Escolha um produto, defina sua margem e publique{' '}
          <span className="text-gold">em poucos minutos</span>.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <Link
            to="/dashboard"
            className="bg-white text-black px-8 py-4 rounded-lg text-base font-semibold hover:bg-slate-100 transition-all btn-transition flex items-center gap-2 shadow-lg hover:shadow-xl"
          >
            Começar agora
            <span>→</span>
          </Link>
          <a href="#planos"
            onClick={handleScrollToPlans}
            className="text-white border border-slate-700 px-8 py-4 rounded-lg text-base font-medium hover:border-slate-500 hover:bg-slate-800/50 transition-all btn-transition"
          >
            Ver planos
          </a>
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