import { ShieldCheck, Zap, Send } from 'lucide-react';
import { motion } from 'framer-motion';

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

export default function Benefits() {
  return (
    <section className="bg-navy-900 py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-6">
          {benefits.map((benefit, index) => (
            <motion.div
              key={benefit.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              className="bg-navy-700 rounded-xl border border-navy-600 p-8 hover:border-white/20 transition-colors"
            >
              <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center mb-5">
                <benefit.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-white font-semibold text-lg mb-3">{benefit.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{benefit.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}