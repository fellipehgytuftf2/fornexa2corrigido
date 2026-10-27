import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const PASSOS = [
  'Clique em Criar minha conta.',
  'Cadastre-se com o mesmo e-mail usado na compra.',
  'Faça login e comece a usar o catálogo.',
];

/**
 * A página que o Applyfy mostra depois do pagamento.
 *
 * O pagamento acontece fora daqui, e quem acabou de pagar não tem conta
 * nenhuma na FORNEXA ainda — por isso a página é pública e a única coisa que
 * ela faz é empurrar a pessoa para o cadastro, com o aviso que importa: tem
 * que ser o mesmo e-mail, senão o sistema não reconhece a compra.
 *
 * `noindex` entra aqui, e não no index.html, porque aquele arquivo vale para
 * o site inteiro. É página de depois-da-compra: não tem por que aparecer na
 * busca do Google, nem para quem ainda não pagou.
 */
export default function Obrigado() {
  useEffect(() => {
    const marca = document.createElement('meta');
    marca.name = 'robots';
    marca.content = 'noindex';
    document.head.appendChild(marca);

    return () => {
      document.head.removeChild(marca);
    };
  }, []);

  return (
    <div className="min-h-screen bg-navy-900 flex flex-col">
      <header className="px-6 py-6">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[10px] overflow-hidden bg-navy-900 flex items-center justify-center">
            <img
              src="/fornexa-logo.jpeg"
              alt="FORNEXA"
              className="w-full h-full object-cover scale-[2.8]"
            />
          </div>

          <span className="text-white font-semibold text-lg tracking-tight">FORNEXA</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl text-center">
          <h1 className="text-white text-3xl md:text-4xl font-bold leading-tight tracking-tight mb-4">
            Pagamento confirmado! Falta só criar o seu acesso.
          </h1>

          <p className="text-slate-400 text-base md:text-lg leading-relaxed mb-10">
            O pagamento foi feito pelo Applyfy. A plataforma fica aqui, na FORNEXA.
          </p>

          <ol className="text-left space-y-4 mb-10">
            {PASSOS.map((passo, indice) => (
              <li
                key={passo}
                className="bg-navy-700 rounded-[20px] border border-navy-600 p-5 flex items-start gap-4"
              >
                <span className="w-8 h-8 rounded-full bg-gold text-navy-900 font-semibold text-sm flex items-center justify-center shrink-0">
                  {indice + 1}
                </span>

                <span className="text-slate-300 text-sm leading-relaxed pt-1.5">{passo}</span>
              </li>
            ))}
          </ol>

          <Link
            to="/register"
            className="btn-fnx btn-fnx-primario inline-flex items-center justify-center w-full sm:w-auto px-10 py-4 text-base font-semibold"
          >
            <span>Criar minha conta</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
