import { Link } from 'react-router-dom';

/**
 * O que aparece em fornexa.site/QUALQUER-COISA quando não é um afiliado ativo:
 * endereço inventado, afiliado removido, ou aceito mas ainda sem checkout.
 *
 * Antes caía na landing como se o link valesse — e o código ficava guardado
 * no navegador de quem abriu. Agora diz a verdade e aponta para a página
 * principal, onde a compra acontece normalmente.
 */
export default function LinkDeAfiliadoInativo() {
  return (
    <div className="relative min-h-screen bg-navy-950 text-white px-6 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-40" aria-hidden="true" />

      <div className="relative max-w-md text-center">
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-10 h-10 rounded-md overflow-hidden bg-navy-900 flex items-center justify-center">
            <img
              src="/fornexa-logo.jpeg"
              alt=""
              className="w-full h-full object-cover scale-[2.8]"
              draggable={false}
            />
          </div>

          <span className="font-display font-semibold text-lg tracking-tight">FORNEXA</span>
        </div>

        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
          Esse link não está ativo
        </h1>

        <p className="text-slate-400 mt-4 leading-relaxed">
          O link de indicação que você abriu não existe ou foi desativado. Você
          ainda pode conhecer o FORNEXA e assinar pela página principal.
        </p>

        <Link
          to="/"
          className="inline-block mt-8 px-6 py-3 rounded-lg bg-white text-black font-semibold hover:bg-slate-100 transition-colors"
        >
          Ir para o FORNEXA
        </Link>
      </div>
    </div>
  );
}
