import { Check, Shield, Star, Headphones } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Plans() {
  return (
    <section id="planos" className="bg-navy-900 py-24">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-white text-4xl font-bold mb-4">Escolha seu plano</h2>
          <p className="text-slate-400 text-lg">Acesso completo ao catálogo e ferramentas.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 items-stretch justify-items-center">
          {/* Basic plan */}
          <div className="bg-navy-700 rounded-2xl border border-navy-600 p-10 w-full max-w-sm h-full flex flex-col">
            <h3 className="text-white font-semibold text-xl mb-3">Plano Básico</h3>
            <div className="mb-8">
              <span className="text-white text-4xl font-bold">R$ 139,00</span>
              <span className="text-slate-400">/mês</span>
            </div>
            <ul className="space-y-4 mb-10">
              {['Acesso aos fornecedores', 'Mercado Livre', 'Suporte', 'Curso completo'].map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-slate-300 text-sm">
                  <Check className="w-4 h-4 text-gold flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-auto">
              <a href="#"
                className="block w-full py-3 rounded-lg border border-slate-600 text-white font-medium hover:bg-slate-800 transition-colors text-center"
              >
                Começar agora
              </a>
            </div>
          </div>

          {/* Premium plan */}
          <div className="relative w-full max-w-sm premium-card h-full">
            <div className="relative bg-navy-700 rounded-2xl border-2 border-gold p-10 h-full flex flex-col">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-black text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                🏆 MAIS ESCOLHIDO
              </div>
              <h3 className="text-white font-semibold text-xl mb-3">Plano Premium</h3>
              <div className="mb-8">
                <span className="text-slate-400 text-lg line-through block mb-1">
                  De R$ 497,00
                </span>
                <span className="text-white text-4xl font-bold">R$ 229,00</span>
                <span className="text-slate-400 block text-sm mt-1">Investimento único</span>
              </div>
              <ul className="space-y-4 mb-10">
                {[
                  'Catálogo completo dos fornecedores',
                  'Ferramentas premium inclusas',
                  'Suporte prioritário',
                  'Pagamento único sem mensalidades',
                  'Integrações futuras inclusas',
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-slate-300 text-sm">
                    <Check className="w-4 h-4 text-gold flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                <a href="#"
                  className="block w-full py-3 rounded-lg bg-white text-black font-semibold hover:bg-slate-100 transition-colors text-center"
                >
                  Quero o melhor custo-benefício
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Risk-free section */}
        <div className="mt-20 text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="w-6 h-6 text-white" />
            <h3 className="text-white text-2xl font-semibold">Risco zero</h3>
          </div>
          <p className="text-white text-lg font-medium">Sua compra está protegida</p>
        </div>

        {/* Premium benefit cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0 }}
            className="bg-gradient-to-br from-navy-600 to-navy-800 rounded-xl border border-navy-500 p-6 flex gap-5 items-start"
          >
            <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
              <Star className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-white font-semibold text-base mb-2">Satisfação garantida</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Milhares de vendedores já usam a FORNEXA para escalar suas operações.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="bg-gradient-to-br from-navy-600 to-navy-800 rounded-xl border border-navy-500 p-6 flex gap-5 items-start"
          >
            <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
              <Headphones className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-white font-semibold text-base mb-2">Suporte dedicado</h4>
              <p className="text-slate-400 text-sm leading-relaxed">
                Atendimento prioritário e direto para resolver qualquer dúvida.
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      <style>{`
        .premium-card::before {
          content: '';
          position: absolute;
          width: 450px;
          height: 450px;
          border-radius: 9999px;
          background: radial-gradient(
            circle,
            rgba(255, 255, 255, 0.10) 0%,
            rgba(255, 255, 255, 0.05) 35%,
            rgba(255, 255, 255, 0.02) 60%,
            transparent 100%
          );
          filter: blur(140px);
          z-index: -1;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation: glowAurora 14s ease-in-out infinite alternate;
          pointer-events: none;
        }

        @keyframes glowAurora {
          0% {
            transform: translate(calc(-50% - 30px), -50%);
          }
          100% {
            transform: translate(calc(-50% + 30px), -50%);
          }
        }
      `}</style>
    </section>
  );
}