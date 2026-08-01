import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchSupplierAccount } from '../lib/supplierAuth';

type Estado = 'verificando' | 'pronto' | 'linkInvalido' | 'salvo';

/**
 * Destino do link enviado por e-mail.
 *
 * O Supabase entrega uma sessão temporária junto do link, e é ela que autoriza
 * a troca. Por isso a tela espera a sessão aparecer antes de mostrar o
 * formulário: sem ela, `updateUser` seria recusado.
 */
export default function RedefinirSenha() {
  const navigate = useNavigate();

  const [estado, setEstado] = useState<Estado>('verificando');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [destino, setDestino] = useState('/login');

  useEffect(() => {
    let ativo = true;

    // O supabase-js lê o token do endereço e cria a sessão sozinho, mas isso
    // acontece de forma assíncrona — daí ouvir o evento em vez de só consultar.
    const { data: assinatura } = supabase.auth.onAuthStateChange((evento) => {
      if (!ativo) {
        return;
      }

      if (evento === 'PASSWORD_RECOVERY' || evento === 'SIGNED_IN') {
        setEstado('pronto');
      }
    });

    const conferir = async () => {
      const { data } = await supabase.auth.getSession();

      if (!ativo) {
        return;
      }

      setEstado(data.session ? 'pronto' : 'linkInvalido');
    };

    // Pequena espera: dá tempo de o supabase-js processar o token do endereço
    // antes de concluirmos que o link não presta.
    const tempo = setTimeout(conferir, 1200);

    return () => {
      ativo = false;
      clearTimeout(tempo);
      assinatura.subscription.unsubscribe();
    };
  }, []);

  const salvar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro('');

    if (novaSenha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }

    if (novaSenha !== confirmaSenha) {
      setErro('As duas senhas não são iguais.');
      return;
    }

    setSalvando(true);

    const { data, error } = await supabase.auth.updateUser({ password: novaSenha });

    if (error) {
      setSalvando(false);
      console.error('Erro ao redefinir senha:', error);
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }

    // Fornecedor e vendedor entram por telas diferentes; manda cada um para a
    // sua em vez de despejar todo mundo no login do vendedor.
    if (data.user) {
      const fornecedor = await fetchSupplierAccount(data.user.id);
      setDestino(fornecedor ? '/fornecedor' : '/dashboard');
    }

    setSalvando(false);
    setEstado('salvo');
  };

  const campo =
    'w-full px-4 py-3.5 bg-white/[0.03] border border-white/10 rounded-xl text-white ' +
    'placeholder:text-slate-600 transition-colors hover:border-white/20 ' +
    'focus:outline-none focus:border-gold focus:bg-white/[0.05] ' +
    'focus-visible:ring-2 focus-visible:ring-gold/25 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

  const rotulo =
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

          <span className="text-white font-display font-semibold text-lg tracking-tight">
            FORNEXA
          </span>
        </div>

        {estado === 'verificando' && (
          <div className="flex items-center gap-3 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            Verificando o link...
          </div>
        )}

        {estado === 'linkInvalido' && (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-4">
              <AlertCircle
                className="w-[18px] h-[18px] text-red-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />

              <div>
                <p className="text-sm font-semibold text-red-200">
                  Link expirado ou já usado
                </p>

                <p className="text-sm text-red-200/80 mt-1.5 leading-relaxed">
                  Os links de recuperação valem por uma hora e servem uma vez só.
                </p>
              </div>
            </div>

            <Link
              to="/esqueci-senha"
              className="inline-flex items-center justify-center w-full mt-6 rounded-xl bg-gold px-4 py-3.5 font-semibold text-navy-900 transition-colors hover:bg-gold-hover"
            >
              Pedir um link novo
            </Link>
          </>
        )}

        {estado === 'salvo' && (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-4">
              <CheckCircle
                className="w-[18px] h-[18px] text-green-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />

              <div>
                <p className="text-sm font-semibold text-green-200">Senha alterada</p>

                <p className="text-sm text-green-200/80 mt-1.5">
                  Você já está com a sessão aberta.
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate(destino, { replace: true })}
              className="inline-flex items-center justify-center w-full mt-6 rounded-xl bg-gold px-4 py-3.5 font-semibold text-navy-900 transition-colors hover:bg-gold-hover"
            >
              Continuar
            </button>
          </>
        )}

        {estado === 'pronto' && (
          <>
            <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
              Criar nova senha
            </h1>

            <p className="text-slate-400 mt-3 leading-relaxed">
              Escolha uma senha com pelo menos 8 caracteres.
            </p>

            <form onSubmit={salvar} noValidate className="mt-10 space-y-6">
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
                <label htmlFor="senha-nova" className={rotulo}>
                  Nova senha
                </label>

                <input
                  id="senha-nova"
                  type="password"
                  autoComplete="new-password"
                  value={novaSenha}
                  onChange={(event) => setNovaSenha(event.target.value)}
                  placeholder="Pelo menos 8 caracteres"
                  className={campo}
                  disabled={salvando}
                />
              </div>

              <div>
                <label htmlFor="senha-confirma" className={rotulo}>
                  Repita a nova senha
                </label>

                <input
                  id="senha-confirma"
                  type="password"
                  autoComplete="new-password"
                  value={confirmaSenha}
                  onChange={(event) => setConfirmaSenha(event.target.value)}
                  className={campo}
                  disabled={salvando}
                />
              </div>

              <button
                type="submit"
                disabled={salvando || !novaSenha || !confirmaSenha}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3.5 font-semibold text-navy-900 transition-colors hover:bg-gold-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {salvando ? (
                  <>
                    <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" />
                    Salvando
                  </>
                ) : (
                  'Salvar nova senha'
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
