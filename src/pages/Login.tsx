import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Profile {
  name: string;
  email: string;
  plan: string;
  role: string;
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, email, plan, role')
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
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-navy-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para o início
        </Link>

        <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-navy-700">
            <h1 className="text-2xl font-bold text-navy-900 dark:text-white">
              Entrar no FORNEXA
            </h1>

            <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
              Acesse sua conta para gerenciar produtos, fornecedores e pedidos.
            </p>
          </div>

          <form onSubmit={handleLogin} className="p-6 space-y-5">
            {errorMessage && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />

                <p className="text-sm text-red-700 dark:text-red-400">
                  {errorMessage}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                E-mail
              </label>

              <div className="relative">
                <Mail className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />

                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="seuemail@exemplo.com"
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-xl text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                Senha
              </label>

              <div className="relative">
                <Lock className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />

                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full pl-10 pr-12 py-3 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-xl text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  disabled={loading}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black hover:bg-gray-900 text-white font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          <div className="px-6 pb-6">
            <p className="text-sm text-gray-500 dark:text-slate-400 text-center">
              Ainda não tem conta?{' '}
              <Link
                to="/register"
                className="text-navy-900 dark:text-white font-semibold hover:underline"
              >
                Criar conta
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}