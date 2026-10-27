import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchSupplierAccount } from '../lib/supplierAuth';
import { planoEmDia } from '../lib/planos';
import TelaDeAcesso from '../components/auth/TelaDeAcesso';
import SucessoAcesso from '../components/auth/SucessoAcesso';
import {
  avisoErroAcesso,
  botaoAcesso,
  campoAcesso,
  linkTrocaAcesso,
  rotuloAcesso,
  tituloAcesso,
} from '../components/auth/estiloAcesso';

interface Profile {
  name: string;
  email: string;
  plan: string;
  plan_status: string | null;
  plan_expira_em: string | null;
  role: string;
}

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // Animações da caixa: cada erro faz a caixa tremer; no sucesso aparece o
  // "Tudo certo!" por um instante antes de trocar de tela.
  const [tentativa, setTentativa] = useState(0);
  const [tremer, setTremer] = useState(0);
  const [sucesso, setSucesso] = useState('');
  const temporizadorSucesso = useRef<number>();

  // Depende também da tentativa: repetir o mesmo erro (mesmo texto) treme de novo.
  useEffect(() => {
    if (errorMessage) setTremer((vezes) => vezes + 1);
  }, [errorMessage, tentativa]);

  useEffect(() => () => window.clearTimeout(temporizadorSucesso.current), []);

  const TEMPO_DO_SUCESSO_MS = 900;

  const concluir = (texto: string, irPara: () => void) => {
    setSucesso(texto);
    temporizadorSucesso.current = window.setTimeout(irPara, TEMPO_DO_SUCESSO_MS);
  };

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
          // O e-mail com que ele acabou de entrar. Antes vinha do cadastro
          // em `suppliers`, coluna que saiu do alcance na migração 20260922040000
          // — e este aqui é mais certo de qualquer forma: é a conta usada agora.
          email: formattedEmail,
          loggedAt: new Date().toISOString(),
        })
      );

      setLoading(false);
      concluir('Abrindo o portal do fornecedor…', () => navigate('/fornecedor'));
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
    const destino = planoEmDia(profile) ? '/dashboard' : '/planos';
    concluir(
      destino === '/dashboard' ? 'Abrindo seu painel…' : 'Abrindo os planos…',
      () => navigate(destino)
    );
  };

  return (
    <TelaDeAcesso tremer={tremer} sucesso={Boolean(sucesso)}>
      {sucesso ? (
        <SucessoAcesso texto={sucesso} duracaoMs={TEMPO_DO_SUCESSO_MS} />
      ) : (
        <>
          <h1 className={tituloAcesso}>Entrar</h1>

          <form
            onSubmit={(event) => {
              setTentativa((vezes) => vezes + 1);
              handleLogin(event);
            }}
            noValidate
            className="flex flex-col gap-4"
          >
            {errorMessage && (
              <div role="alert" className={avisoErroAcesso}>
                <AlertCircle
                  className="w-[18px] h-[18px] text-red-600 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <p className="text-sm text-red-700">{errorMessage}</p>
              </div>
            )}

            <div>
              <label htmlFor="login-email" className={rotuloAcesso}>
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
                className={campoAcesso}
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="login-password" className={rotuloAcesso}>
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
            </div>

            <Link
              to="/esqueci-senha"
              className="self-end inline-flex items-center min-h-[44px] -my-2 text-sm font-medium text-[#06151E] hover:underline underline-offset-4"
            >
              Esqueci minha senha
            </Link>

            <button type="submit" disabled={loading} className={botaoAcesso}>
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

          <p className="text-center text-sm text-[#5B6770]">
            Ainda não tem conta?{' '}
            <Link to="/register" state={{ semAnimacao: true }} className={linkTrocaAcesso}>
              Criar conta
            </Link>
          </p>
        </>
      )}
    </TelaDeAcesso>
  );
}
