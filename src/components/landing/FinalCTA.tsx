import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export default function FinalCTA() {
  return (
    <section id="comecar" className="bg-navy-900 py-24 scroll-mt-28">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-white text-4xl md:text-5xl font-bold mb-4">
          Cada dia sem a FORNEXA é{' '}
          <span className="text-gold">dinheiro deixado na mesa</span>.
        </h2>
        <p className="text-slate-400 text-lg mb-10">
          Seus concorrentes já estão publicando mais rápido, com menos erro e mais margem.
          A diferença entre você e eles é essa ferramenta.
        </p>
        <Link
          to="/dashboard"
          className="btn-fnx btn-fnx-primario inline-flex items-center px-10 py-4 text-base font-semibold"
        >
          <span className="inline-flex items-center gap-3">
            Acessar agora
            <ArrowRight className="w-5 h-5" />
          </span>
        </Link>
      </div>
    </section>
  );
}