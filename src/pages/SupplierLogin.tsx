import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchSupplierAccount } from '../lib/supplierAuth';

/**
 * Entrada do Portal do Fornecedor.
 *
 * Separada da tela do vendedor de propósito: são públicos diferentes, e o
 * fornecedor precisa saber de cara que está no lugar certo. Quem entrar aqui
 * com uma conta de vendedor é recusado e a sessão é encerrada.
 */
export default function SupplierLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setErrorMessage('');

    const formattedEmail = email.trim().toLowerCase();

    if (!formattedEmail) {
      setErrorMessage('Digite seu e-mail.');
      return;
    }

    if (!password) {
      setErrorMessage('Digite sua senha.');
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: formattedEmail,
      password,
    });

    if (error || !data.user) {
      setLoading(false);
      setErrorMessage('E-mail ou senha inválidos.');
      return;
    }

    const supplier = await fetchSupplierAccount(data.user.id);

    if (!supplier) {
      // Conta válida, mas não é de fornecedor. Encerra a sessão para não
      // deixar o usuário logado numa área que não é dele.
      await supabase.auth.signOut();

      setLoading(false);
      setErrorMessage(
        'Esta conta não é de fornecedor. Se você vende pelo FORNEXA, use a tela de login do vendedor.'
      );
      return;
    }

    localStorage.setItem(
      'fornexa_supplier',
      JSON.stringify({
        id: supplier.id,
        name: supplier.company_name || supplier.name,
        // O e-mail com que ele acabou de entrar. Antes vinha do cadastro
        // em `suppliers`, coluna que saiu do alcance na migração 20260922040000
        // — e este aqui é mais certo de qualquer forma: é a conta usada agora.
        email: formattedEmail,
        loggedAt: new Date().toISOString(),
      })
    );

    setLoading(false);
    navigate('/fornecedor');
  };

  const fieldClass =
    'w-full px-4 py-3.5 bg-white/[0.03] border border-white/10 rounded-xl text-white ' +
    'placeholder:text-slate-600 transition-colors hover:border-white/20 ' +
    'focus:outline-none focus:border-gold focus:bg-white/[0.05] ' +
    'focus-visible:ring-2 focus-visible:ring-gold/25 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

  const labelClass =
    'block font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2.5';

  return (
    <div className="relative min-h-screen bg-navy-950 text-white flex items-center justify-center px-6 py-12 overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-40" aria-hidden="true" />

      <div className="relative w-full max-w-[400px]">
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-10 h-10 rounded-md overflow-hidden bg-navy-900 flex items-center justify-center">
            <img
              src="/fornexa-logo.jpeg"
              alt=""
              className="w-full h-full object-cover scale-[2.8]"
              draggable={false}
            />
          </div>

          <div>
            <p className="text-white font-display font-semibold text-lg leading-none tracking-tight">
              FORNEXA
            </p>

            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold mt-1.5">
              Portal do Fornecedor
            </p>
          </div>
        </div>

        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
          Entrar
        </h1>

        <p className="text-slate-400 mt-3 leading-relaxed">
          Veja os pedidos que chegaram para você, baixe a etiqueta e marque o envio.
        </p>

        <form onSubmit={handleLogin} noValidate className="mt-10 space-y-6">
          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3.5"
            >
              <AlertCircle
                className="w-[18px] h-[18px] text-red-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p className="text-sm text-red-200">{errorMessage}</p>
            </div>
          )}

          <div>
            <label htmlFor="supplier-email" className={labelClass}>
              E-mail
            </label>

            <input
              id="supplier-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seuemail@exemplo.com"
              aria-invalid={Boolean(errorMessage)}
              className={fieldClass}
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="supplier-password" className={labelClass}>
              Senha
            </label>

            <div className="relative">
              <input
                id="supplier-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite sua senha"
                aria-invalid={Boolean(errorMessage)}
                className={`${fieldClass} pr-12`}
                disabled={loading}
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-slate-500 transition-colors hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                disabled={loading}
              >
                {showPassword ? (
                  <EyeOff className="w-[18px] h-[18px]" aria-hidden="true" />
                ) : (
                  <Eye className="w-[18px] h-[18px]" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="-mt-2">
            <Link
              to="/esqueci-senha"
              className="text-sm text-slate-400 transition-colors hover:text-white"
            >
              Esqueci minha senha
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3.5 font-semibold text-navy-900 transition-colors hover:bg-gold-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" />
                Entrando
              </>
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        <div className="lgn-rule mt-10" />

        <p className="text-sm text-slate-500 mt-6">
          O acesso é criado pela equipe do FORNEXA. Não recebeu sua senha? Fale com
          quem cuida do seu cadastro.
        </p>

        <Link
          to="/login"
          className="inline-block mt-4 text-sm text-slate-500 transition-colors hover:text-slate-300"
        >
          Sou vendedor, quero entrar no meu painel
        </Link>
      </div>
    </div>
  );
}
