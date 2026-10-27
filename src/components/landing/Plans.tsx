import { useEffect, useState } from 'react';
import { Check, Shield, Headphones } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  PLANOS,
  montarCheckout,
  pegarCodigoDoAfiliado,
  buscarLinksDeCheckout,
  planosComCheckout,
} from '../../lib/planos';

export default function Plans({ codigoAfiliado }: { codigoAfiliado?: string }) {
  const [planos, setPlanos] = useState(PLANOS);

  // Quem chegou por fornexa.site/CODIGO compra no checkout daquele afiliado.
  // Sem código na rota, vale o que ficou guardado de uma visita anterior.
  const codigo = codigoAfiliado || pegarCodigoDoAfiliado();

  useEffect(() => {
    buscarLinksDeCheckout(codigo).then((links) => setPlanos(planosComCheckout(links)));
  }, [codigo]);

  const [basico, premium] = planos;

  // Visitante da landing ainda não tem conta, então o checkout vai sem e-mail:
  // quem digita é ele, no formulário da Applyfy. Depois de pagar, a plataforma
  // devolve para /register e o cadastro reencontra a compra por esse e-mail.
  const linkBasico = montarCheckout(basico);
  const linkPremium = montarCheckout(premium);

  return (
    <section id="planos" className="bg-navy-900 py-24">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-white text-4xl font-bold mb-4">Escolha seu plano</h2>

          <p className="text-slate-400 text-lg">
            Os dois dão acesso completo ao sistema. Você escolhe só como prefere
            pagar.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 items-stretch justify-items-center">
          {/* Basic plan */}
          <div className="bg-navy-700 rounded-2xl border border-navy-600 p-10 w-full max-w-sm h-full flex flex-col">
            <h3 className="text-white font-semibold text-xl mb-3">{basico.nome}</h3>
            <div className="mb-8">
              <span className="text-white text-4xl font-bold">{basico.preco}</span>
              <span className="text-slate-400">{basico.periodo}</span>
            </div>
            <ul className="space-y-4 mb-10">
              {basico.beneficios.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-slate-300 text-sm">
                  <Check className="w-4 h-4 text-gold flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-auto">
              <a
                href={linkBasico || '/register'}
                className="block w-full py-3 rounded-lg border border-slate-600 text-white font-medium hover:bg-slate-800 transition-colors text-center"
              >
                {basico.chamada}
              </a>
            </div>
          </div>

          {/* Premium plan */}
          <div className="relative w-full max-w-sm premium-card h-full">
            <div className="relative bg-navy-700 rounded-2xl border-2 border-gold p-10 h-full flex flex-col">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-black text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                {premium.destaque}
              </div>
              <h3 className="text-white font-semibold text-xl mb-3">{premium.nome}</h3>
              <div className="mb-8">
                <span className="text-slate-400 text-lg line-through block mb-1">
                  {premium.precoAntigo}
                </span>
                <span className="text-white text-4xl font-bold">{premium.preco}</span>
                <span className="text-slate-400 block text-sm mt-1">{premium.periodo}</span>
              </div>
              <ul className="space-y-4 mb-10">
                {premium.beneficios.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-slate-300 text-sm">
                    <Check className="w-4 h-4 text-gold flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                <a
                  href={linkPremium || '/register'}
                  className="block w-full py-3 rounded-lg bg-white text-black font-semibold hover:bg-slate-100 transition-colors text-center"
                >
                  {premium.chamada}
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
        <div className="max-w-md mx-auto">
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