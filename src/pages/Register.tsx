import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setErrorMessage('');
    setSuccessMessage('');

    const formattedName = name.trim();
    const formattedEmail = email.trim().toLowerCase();

    if (!formattedName) {
      setErrorMessage('Digite seu nome.');
      return;
    }

    if (!formattedEmail) {
      setErrorMessage('Digite seu e-mail.');
      return;
    }

    // Mesmo mínimo da tela de redefinição. Exigir 6 aqui e 8 lá deixava a
    // pessoa criar uma senha que ela não conseguiria recadastrar depois.
    if (password.length < 8) {
      setErrorMessage('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: formattedEmail,
      password,
      options: {
        data: {
          name: formattedName,
        },
      },
    });

    setLoading(false);

    if (error) {
      console.error('Erro ao criar conta:', error);

      const jaExiste = /already registered|already exists|user_exists/i.test(
        error.message || ''
      );

      if (jaExiste) {
        setErrorMessage(
          'Já existe uma conta com este e-mail. Entre por "Já tem uma conta?" ou use "Esqueci minha senha".'
        );
        return;
      }

      // O Supabase às vezes devolve a falha sem texto legível — foi o que
      // aconteceu quando um gatilho do banco quebrou e a tela mostrou "{}".
      // Nesses casos a mensagem crua confunde mais do que ajuda.
      const legivel = (error.message || '').trim();
      const util = legivel.length > 2 && legivel !== '{}';

      setErrorMessage(
        util
          ? legivel
          : 'Não foi possível criar sua conta agora. Tente de novo em alguns instantes.'
      );
      return;
    }

    if (!data.user) {
      setErrorMessage('Não foi possível criar sua conta. Tente novamente.');
      return;
    }

    // Com confirmação de e-mail ligada, o Supabase devolve o usuário sem
    // `identities` quando o e-mail já pertence a alguém — de propósito, para
    // não revelar quais contas existem. Sem tratar isso, a pessoa acharia que
    // criou a conta e ficaria presa na tela de login.
    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setErrorMessage(
        'Já existe uma conta com este e-mail. Use "Esqueci minha senha" se não lembrar dela.'
      );
      return;
    }

    // Sem sessão, a confirmação por e-mail está ligada: não adianta mandar
    // para o painel, porque nenhuma tela interna vai abrir.
    if (!data.session) {
      setSuccessMessage(
        'Conta criada. Confirme o e-mail que enviamos para você e depois entre.'
      );

      setTimeout(() => {
        navigate('/login');
      }, 2500);

      return;
    }

    localStorage.setItem(
      'fornexa_auth_user',
      JSON.stringify({
        id: data.user.id,
        name: formattedName,
        email: formattedEmail,
        loggedAt: new Date().toISOString(),
      })
    );

    setSuccessMessage('Conta criada com sucesso.');

    // Para /planos, não /dashboard. Quem acabou de se cadastrar quase nunca
    // tem plano, e mandar para o painel só para ser rebatido produzia duas
    // trocas de tela e a promessa falsa de "entrando no painel". Quem já pagou
    // antes de criar a conta é reconhecido em /planos e segue direto.
    setTimeout(() => {
      navigate('/planos', { replace: true });
    }, 700);
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
              Criar conta
            </h1>

            <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
              Crie sua conta para acessar o painel do FORNEXA.
            </p>
          </div>

          <form onSubmit={handleRegister} className="p-6 space-y-5">
            {errorMessage && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />

                <p className="text-sm text-red-700 dark:text-red-400">
                  {errorMessage}
                </p>
              </div>
            )}

            {successMessage && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />

                <p className="text-sm text-green-700 dark:text-green-400">
                  {successMessage}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                Nome
              </label>

              <div className="relative">
                <User className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />

                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Seu nome"
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-xl text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  disabled={loading}
                />
              </div>
            </div>

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
                  placeholder="Mínimo 8 caracteres"
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

              <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                Use uma senha com pelo menos 8 caracteres.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black hover:bg-gray-900 text-white font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Criando conta...
                </>
              ) : (
                'Criar conta'
              )}
            </button>
          </form>

          <div className="px-6 pb-6">
            <p className="text-sm text-gray-500 dark:text-slate-400 text-center">
              Já tem uma conta?{' '}
              <Link
                to="/login"
                className="text-navy-900 dark:text-white font-semibold hover:underline"
              >
                Entrar
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}