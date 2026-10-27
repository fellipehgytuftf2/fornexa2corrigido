import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const PERGUNTAS = [
  {
    pergunta: 'O que é a FORNEXA, na prática?',
    resposta:
      'Uma plataforma com catálogo de produtos prontos, com foto, título e descrição. Você escolhe o produto, define sua margem e publica no Mercado Livre.',
  },
  {
    pergunta: 'Preciso comprar estoque antes de vender?',
    resposta:
      'Não. Você anuncia o produto do catálogo e não compra nem armazena mercadoria antes da venda.',
  },
  {
    pergunta: 'Preciso ter conta no Mercado Livre?',
    resposta:
      'Sim, uma conta de vendedor, e ela é sua. A venda cai na sua conta e o cliente é seu. As configurações necessárias estão na aba de Integração, dentro da plataforma.',
  },
  {
    pergunta: 'Posso editar as fotos e os títulos dos produtos?',
    resposta:
      'Sim. A descrição é fixa para proteger a sua conta contra as regras do Mercado Livre.',
  },
  {
    pergunta: 'Como recebo o acesso depois do pagamento?',
    resposta:
      'Crie sua conta na FORNEXA com o mesmo e-mail usado na compra. O sistema reconhece o pagamento e libera o acesso.',
  },
  {
    pergunta: 'Qual a diferença entre o plano mensal e o vitalício?',
    resposta:
      'Os benefícios são os mesmos. O mensal é cobrado todo mês e pode ser cancelado quando você quiser. O vitalício é pagamento único.',
  },
];

/**
 * O acordeão abre um item por vez, e começa com todos fechados.
 *
 * A resposta abre com `grid-template-rows` de 0fr para 1fr. É o único jeito de
 * animar da altura zero até "a altura que o texto pedir" sem medir nada em
 * JavaScript — e medir altura obriga o navegador a refazer o layout, que é o
 * que já engasgou esta página antes.
 */
export default function FAQ() {
  const [aberta, setAberta] = useState<string | null>(null);

  return (
    <section id="faq" className="bg-navy-900 py-24 scroll-mt-28">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-white text-4xl font-bold mb-4">Perguntas frequentes</h2>
        </div>

        <div className="space-y-4">
          {PERGUNTAS.map((item) => {
            const estaAberta = aberta === item.pergunta;

            return (
              <div
                key={item.pergunta}
                className="bg-navy-700 rounded-[20px] border border-navy-600 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setAberta(estaAberta ? null : item.pergunta)}
                  aria-expanded={estaAberta}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="text-white font-semibold text-base">{item.pergunta}</span>

                  <ChevronDown
                    className={`w-5 h-5 text-gold shrink-0 transition-transform duration-300 ${
                      estaAberta ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>

                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    estaAberta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-6 pb-5 text-slate-400 text-sm leading-relaxed">
                      {item.resposta}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
