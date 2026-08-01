import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * Pedido de recuperação de senha, para vendedor e fornecedor.
 *
 * Uma tela só para os dois: quem tem conta no Auth recebe o e-mail, e a tela
 * de redefinição descobre depois para onde mandar cada um.
 */
export default function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro('');

    const endereco = email.trim().toLowerCase();

    if (!endereco) {
      setErro('Digite seu e-mail.');
      return;
    }

    setEnviando(true);

    const { error } = await supabase.auth.resetPasswordForEmail(endereco, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });

    setEnviando(false);

    if (error) {
      console.error('Erro ao pedir recuperação de senha:', error);
      setErro(
        'Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.'
      );
      return;
    }

    // Sucesso mesmo com e-mail inexistente, de propósito: dizer "esse e-mail
    // não existe" entregaria a estranhos quais contas existem no sistema.
    setEnviado(true);
  };

  const campo =
    'w-full px-4 py-3.5 bg-white/[0.03] border border-white/10 rounded-xl text-white ' +
    'placeholder:text-slate-600 transition-colors hover:border-white/20 ' +
    'focus:outline-none focus:border-gold focus:bg-white/[0.05] ' +
    'focus-visible:ring-2 focus-visible:ring-gold/25 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="relative min-h-screen bg-navy-950 text-white flex items-center justify-center px-6 py-12 overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-40" aria-hidden="true" />

      <div className="relative w-full max-w-[400px]">
        <Link to="/" className="inline-flex items-center gap-2.5 mb-10">
          <div className="w-10 h-10 rounded-md overflow-hidden bg-navy-900 flex items-center justify-center">
            <img
              src="/fornexa-logo.jpeg"
              alt=""
              className="w-full h-full object-cover scale-[2.8]"
              draggable={false}
            />
          </div>

          <span className="text-white font-display font-semibold text-lg tracking-tight">
            FORNEXA
          </span>
        </Link>

        {enviado ? (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-4">
              <CheckCircle
                className="w-[18px] h-[18px] text-green-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />

              <div>
                <p className="text-sm font-semibold text-green-200">
                  E-mail enviado
                </p>

                <p className="text-sm text-green-200/80 mt-1.5 leading-relaxed">
                  Se existir uma conta com <strong>{email.trim().toLowerCase()}</strong>,
                  o link para criar uma senha nova chegou na caixa de entrada.
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-400 mt-6 leading-relaxed">
              Não chegou? Confira o spam. O link vale por uma hora — passando disso,
              peça outro.
            </p>

            <button
              onClick={() => setEnviado(false)}
              className="text-sm font-medium text-white underline decoration-gold decoration-2 underline-offset-4 mt-4 transition-colors hover:text-gold"
            >
              Enviar de novo
            </button>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
              Esqueceu a senha?
            </h1>

            <p className="text-slate-400 mt-3 leading-relaxed">
              Digite o e-mail da sua conta e enviamos um link para você criar uma
              nova.
            </p>

            <form onSubmit={enviar} noValidate className="mt-10 space-y-6">
              {erro && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3.5"
                >
                  <AlertCircle
                    className="w-[18px] h-[18px] text-red-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-red-200">{erro}</p>
                </div>
              )}

              <div>
                <label
                  htmlFor="email-recuperacao"
                  className="block font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2.5"
                >
                  E-mail
                </label>

                <input
                  id="email-recuperacao"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="seuemail@exemplo.com"
                  className={campo}
                  disabled={enviando}
                />
              </div>

              <button
                type="submit"
                disabled={enviando}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3.5 font-semibold text-navy-900 transition-colors hover:bg-gold-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {enviando ? (
                  <>
                    <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" />
                    Enviando
                  </>
                ) : (
                  'Enviar link de recuperação'
                )}
              </button>
            </form>
          </>
        )}

        <div className="lgn-rule mt-10" />

        <div className="flex flex-col gap-3 mt-6">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-300"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Voltar para o login do vendedor
          </Link>

          <Link
            to="/fornecedor/login"
            className="text-sm text-slate-500 transition-colors hover:text-slate-300"
          >
            Sou fornecedor
          </Link>
        </div>
      </div>
    </div>
  );
}
