import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import TelaDeAcesso from '../components/auth/TelaDeAcesso';
import {
  botaoAcesso,
  campoAcesso,
  linkTrocaAcesso,
  rotuloAcesso,
  tituloAcesso,
} from '../components/auth/estiloAcesso';

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
    <TelaDeAcesso>
      <h1 className={tituloAcesso}>Criar conta</h1>

      <form onSubmit={handleRegister} noValidate className="flex flex-col gap-4">
        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3.5"
          >
            <AlertCircle
              className="w-[18px] h-[18px] text-red-600 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="text-sm text-red-700">{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-[14px] border border-green-200 bg-green-50 px-4 py-3.5"
          >
            <CheckCircle
              className="w-[18px] h-[18px] text-green-700 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="text-sm text-green-800">{successMessage}</p>
          </div>
        )}

        <div>
          <label htmlFor="register-name" className={rotuloAcesso}>
            Nome
          </label>

          <input
            id="register-name"
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Seu nome"
            className={campoAcesso}
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="register-email" className={rotuloAcesso}>
            E-mail
          </label>

          <input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="seuemail@exemplo.com"
            className={campoAcesso}
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="register-password" className={rotuloAcesso}>
            Senha
          </label>

          <div className="relative">
            <input
              id="register-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo 8 caracteres"
              aria-describedby="register-password-dica"
              className={`${campoAcesso} pr-14`}
              disabled={loading}
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full text-[#5B6770] transition-colors hover:text-[#06151E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#06151E]/40"
              disabled={loading}
            >
              {showPassword ? (
                <EyeOff className="w-[18px] h-[18px]" aria-hidden="true" />
              ) : (
                <Eye className="w-[18px] h-[18px]" aria-hidden="true" />
              )}
            </button>
          </div>

          <p id="register-password-dica" className="text-xs text-[#5B6770] mt-2">
            Use uma senha com pelo menos 8 caracteres.
          </p>
        </div>

        <button type="submit" disabled={loading} className={botaoAcesso}>
          {loading ? (
            <>
              <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" />
              Criando conta...
            </>
          ) : (
            'Criar conta'
          )}
        </button>
      </form>

      <p className="text-center text-sm text-[#5B6770]">
        Já tem uma conta?{' '}
        <Link to="/login" state={{ semAnimacao: true }} className={linkTrocaAcesso}>
          Entrar
        </Link>
      </p>
    </TelaDeAcesso>
  );
}
