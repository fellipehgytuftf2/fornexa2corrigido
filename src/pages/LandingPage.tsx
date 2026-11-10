import { Link, useLocation } from 'react-router-dom';
import Header from '../components/landing/Header';
import Hero from '../components/landing/Hero';
import FornexaMotion from '../components/landing/FornexaMotion';
import Benefits from '../components/landing/Benefits';
import ZoomMonitor from '../components/landing/ZoomMonitor';
import Plans from '../components/landing/Plans';
import FAQ from '../components/landing/FAQ';
import FinalCTA from '../components/landing/FinalCTA';

export default function LandingPage({ codigoDaRota }: { codigoDaRota?: string }) {
  /**
   * De quem é esta visita.
   *
   * `codigoDaRota` é o caminho normal hoje: a página mora no endereço do
   * afiliado, fornexa.site/paulo, e o código está à vista na barra. O
   * histórico da aba continua valendo para quem chegou antes desta mudança,
   * quando o endereço era limpo e a indicação viajava só ali.
   */
  const doHistorico = (useLocation().state as { afiliado?: string } | null)?.afiliado;
  const codigoAfiliado = codigoDaRota || doHistorico;

  return (
    <div className="min-h-screen bg-navy-900">
      <Header />
      <main>
        <Hero />
        <FornexaMotion />
        <Benefits />
        <ZoomMonitor />
        <Plans codigoAfiliado={codigoAfiliado} />
        <FAQ />
        <FinalCTA />
      </main>
      <footer className="bg-navy-900 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded flex items-center justify-center">
              <span className="text-black font-bold text-sm">F</span>
            </div>
            <span className="text-white font-semibold">FORNEXA</span>
          </div>
          <p className="text-slate-500 text-sm">2026 FORNEXA. Todos os direitos reservados.</p>
          <Link to="/dashboard" className="text-slate-400 text-sm hover:text-white transition-colors">
            Acessar Dashboard
          </Link>
        </div>
      </footer>
    </div>
  );
}