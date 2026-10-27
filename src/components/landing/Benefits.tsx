import { ShieldCheck, Zap, Send } from 'lucide-react';

const benefits = [
  {
    icon: ShieldCheck,
    title: 'Fornecedor verificado',
    description: 'Produtos reais, estoque atualizado e fornecedores selecionados.',
  },
  {
    icon: Zap,
    title: 'Fácil acesso',
    description: 'Sem complicação, direto ao ponto.',
  },
  {
    icon: Send,
    title: 'Publicação simplificada',
    description: 'Defina margem, veja o preço final e publique em minutos.',
  },
];

/**
 * Os cartões nasciam invisíveis.
 *
 * Eram `motion.div` com `initial={{ opacity: 0 }}` e `whileInView`: o texto só
 * aparecia quando o framer-motion percebia que a seção entrou na tela e rodava
 * a animação. No computador isso acontece junto com a rolagem e ninguém nota.
 * No celular o JavaScript chega depois, e quem rola para baixo vê um bloco
 * vazio por um instante — "demora pra carregar, aí depois carrega".
 *
 * Agora é HTML comum. O conteúdo está na tela desde o primeiro quadro, antes
 * de qualquer script. Perde-se um fade de meio segundo; ganha-se uma página
 * que já está lá quando a pessoa chega.
 */
export default function Benefits() {
  return (
    <section id="beneficios" className="bg-navy-900 py-24 scroll-mt-28">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-6">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="bg-navy-700 rounded-xl border border-navy-600 p-8 hover:border-white/20 transition-colors"
            >
              <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center mb-5">
                <benefit.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-white font-semibold text-lg mb-3">{benefit.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
