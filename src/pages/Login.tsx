import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchSupplierAccount } from '../lib/supplierAuth';
import { planoEmDia } from '../lib/planos';

interface Profile {
  name: string;
  email: string;
  plan: string;
  plan_status: string | null;
  plan_expira_em: string | null;
  role: string;
}

/**
 * Amostra do catálogo mostrada no painel da esquerda.
 * Preços de custo são os mesmos do catálogo real (src/data/mockData.ts);
 * o preço de venda é ilustrativo — por isso o bloco se chama "amostra".
 */
const catalogSample = [
  {
    sku: 'SKU-0001',
    name: 'Fone Bluetooth Premium TWS',
    cost: 'R$ 19,90',
    price: 'R$ 59,90',
    margin: '+201%',
  },
  {
    sku: 'SKU-0002',
    name: 'Smartwatch Pro Series X',
    cost: 'R$ 45,00',
    price: 'R$ 129,90',
    margin: '+189%',
  },
  {
    sku: 'SKU-0007',
    name: 'Suporte Celular Veicular',
    cost: 'R$ 12,50',
    price: 'R$ 39,90',
    margin: '+219%',
  },
];

/**
 * Marca oficial. Mesmo tratamento do Header da landing: o arquivo é um JPEG
 * com muita margem em volta do símbolo, então é cortado com object-cover +
 * scale para sobrar só o cubo.
 */
function Wordmark({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
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
    </div>
  );
}

export default function Login() {
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

    if (error) {
      setLoading(false);
      setErrorMessage('E-mail ou senha inválidos.');
      return;
    }

    if (!data.user) {
      setLoading(false);
      setErrorMessage('Não foi possível entrar. Tente novamente.');
      return;
    }

    // Fornecedor tem portal próprio. Entrar por aqui é comum (é o link que
    // ele conhece), então leva para o lugar certo em vez de barrar.
    const supplier = await fetchSupplierAccount(data.user.id);

    if (supplier) {
      localStorage.setItem(
        'fornexa_supplier',
        JSON.stringify({
          id: supplier.id,
          name: supplier.company_name || supplier.name,
          email: supplier.email || formattedEmail,
          loggedAt: new Date().toISOString(),
        })
      );

      setLoading(false);
      navigate('/fornecedor');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, email, plan, plan_status, plan_expira_em, role')
      .eq('id', data.user.id)
      .maybeSingle<Profile>();

    localStorage.setItem(
      'fornexa_auth_user',
      JSON.stringify({
        id: data.user.id,
        name:
          profile?.name ||
          data.user.user_metadata?.name ||
          data.user.email?.split('@')[0] ||
          'Usuário',
        email: profile?.email || data.user.email || formattedEmail,
        plan: profile?.plan || 'free',
        role: profile?.role || 'user',
        loggedAt: new Date().toISOString(),
      })
    );

    setLoading(false);

    // Manda direto para o lugar certo. Cair no painel e ser rebatido pelo
    // guarda funcionava, mas mostrava um pedaço do dashboard antes de trocar
    // de tela — parecia falha.
    navigate(planoEmDia(profile) ? '/dashboard' : '/planos');
  };

  const fieldClass =
    'w-full px-4 py-3.5 bg-white/[0.03] border border-white/10 rounded-xl text-white ' +
    'placeholder:text-slate-600 transition-colors ' +
    'hover:border-white/20 ' +
    'focus:outline-none focus:border-gold focus:bg-white/[0.05] ' +
    'focus-visible:ring-2 focus-visible:ring-gold/25 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

  const labelClass =
    'block font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2.5';

  return (
    <div className="min-h-screen bg-navy-950 text-white lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ------------------------------------------------------------------
          Painel esquerdo — a marca e o que espera do outro lado do login.
          Escondido no mobile: ali o formulário é a única coisa que importa.
         ------------------------------------------------------------------ */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-white/5 p-12 xl:p-16">
        <div className="absolute inset-0 grid-pattern opacity-60" aria-hidden="true" />

        {/* Brilho quente no canto inferior, puxando o dourado da marca */}
        <div
          className="absolute -bottom-40 -left-32 w-[560px] h-[560px] rounded-full blur-3xl pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, rgba(255,211,0,0.10) 0%, rgba(255,211,0,0.04) 45%, transparent 70%)',
          }}
          aria-hidden="true"
        />

        <Link
          to="/"
          className="relative z-10 lgn-rise w-fit rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:ring-offset-4 focus-visible:ring-offset-navy-950"
        >
          <Wordmark />
        </Link>

        <div className="relative z-10 max-w-lg">
          <h2
            className="lgn-rise font-display text-[2.6rem] xl:text-[3rem] leading-[1.05] tracking-[-0.03em] font-semibold"
            style={{ '--rise-delay': '0.08s' } as React.CSSProperties}
          >
            Do catálogo ao anúncio
            <span className="block font-medium text-gold">
              publicado, em minutos.
            </span>
          </h2>

          {/* Assinatura da página: o catálogo como extrato.
              Filetes, monoespaçada e números tabulares — a mesma leitura
              de uma planilha de margem, que é onde o vendedor decide. */}
          <div
            className="lgn-rise mt-12"
            style={{ '--rise-delay': '0.16s' } as React.CSSProperties}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-500 mb-5">
              Amostra do catálogo
            </p>

            <div className="lgn-rule" />

            <ul>
              {catalogSample.map((item, index) => (
                <li
                  key={item.sku}
                  className="lgn-rise"
                  style={
                    { '--rise-delay': `${0.24 + index * 0.09}s` } as React.CSSProperties
                  }
                >
                  <div className="flex items-baseline justify-between gap-8 py-4">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] tracking-[0.1em] text-slate-600">
                        {item.sku}
                      </p>

                      <p className="text-slate-200 mt-1.5 truncate">{item.name}</p>

                      <p className="font-mono text-xs text-slate-500 mt-2 tabular-nums">
                        custo {item.cost}
                        <span className="text-slate-700 mx-2">·</span>
                        venda {item.price}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-mono text-xl text-gold tabular-nums leading-none">
                        {item.margin}
                      </p>

                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-600 mt-2">
                        margem
                      </p>
                    </div>
                  </div>

                  <div className="lgn-rule" />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p
          className="relative z-10 lgn-rise font-mono text-[11px] text-slate-600"
          style={{ '--rise-delay': '0.5s' } as React.CSSProperties}
        >
          +750 produtos disponíveis
        </p>
      </aside>

      {/* ------------------------------------------------------------------
          Painel direito — o formulário.
         ------------------------------------------------------------------ */}
      <main className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[400px]">
          {/* No mobile o painel da esquerda não existe, então a marca vem aqui */}
          <Link to="/" className="lg:hidden inline-block mb-10">
            <Wordmark />
          </Link>

          <header
            className="lgn-rise"
            style={{ '--rise-delay': '0.1s' } as React.CSSProperties}
          >
            <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
              Entrar
            </h1>

            <p className="text-slate-400 mt-3 leading-relaxed">
              Gerencie seus produtos, fornecedores e pedidos.
            </p>
          </header>

          <form
            onSubmit={handleLogin}
            noValidate
            className="lgn-rise mt-10 space-y-6"
            style={{ '--rise-delay': '0.18s' } as React.CSSProperties}
          >
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
              <label htmlFor="login-email" className={labelClass}>
                E-mail
              </label>

              <input
                id="login-email"
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
              <label htmlFor="login-password" className={labelClass}>
                Senha
              </label>

              <div className="relative">
                <input
                  id="login-password"
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

          <footer
            className="lgn-rise mt-10 space-y-6"
            style={{ '--rise-delay': '0.26s' } as React.CSSProperties}
          >
            <div className="lgn-rule" />

            <p className="text-sm text-slate-400">
              Ainda não tem conta?{' '}
              <Link
                to="/register"
                className="font-medium text-white underline decoration-gold decoration-2 underline-offset-4 transition-colors hover:text-gold"
              >
                Criar conta
              </Link>
            </p>

            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-300"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Voltar para o início
            </Link>
          </footer>
        </div>
      </main>
    </div>
  );
}
