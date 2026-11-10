import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import TelaDeAcesso from '../../components/auth/TelaDeAcesso';
import SucessoAcesso from '../../components/auth/SucessoAcesso';
import {
  avisoErroAcesso,
  botaoAcesso,
  campoAcesso,
  linkTrocaAcesso,
  rotuloAcesso,
  tituloAcesso,
} from '../../components/auth/estiloAcesso';
import { FaixaDePrevia, PARCEIRO_DE_EXEMPLO } from './previa';

/**
 * A entrada do parceiro: fornexa.site/parceiro/entrar.
 *
 * Mesmo desenho do login do vendedor, de propósito — é o mesmo FORNEXA. A
 * diferença é a porta: aqui só passa quem é parceiro. Vendedor que cair aqui
 * é mandado para o login dele, sem susto.
 *
 * PRÉVIA: não confere senha. Para ver a trava funcionando, use um e-mail
 * com "vendedor" no meio (ex.: vendedor@gmail.com).
 */
export default function EntrarParceiro() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(PARCEIRO_DE_EXEMPLO.email);
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<'' | 'vazio' | 'nao-parceiro'>('');
  const [tremer, setTremer] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const temporizador = useRef<number>();

  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  const entrar = (evento: FormEvent) => {
    evento.preventDefault();

    if (!email.trim() || !senha) {
      setErro('vazio');
      setTremer((vezes) => vezes + 1);
      return;
    }

    setErro('');
    setCarregando(true);

    temporizador.current = window.setTimeout(() => {
      setCarregando(false);

      if (email.toLowerCase().includes('vendedor')) {
        setErro('nao-parceiro');
        setTremer((vezes) => vezes + 1);
        return;
      }

      setPronto(true);
      temporizador.current = window.setTimeout(() => navigate('/parceiro'), 900);
    }, 800);
  };

  return (
    <>
      <TelaDeAcesso tremer={tremer} sucesso={pronto} frase="Área do parceiro: divulgue o FORNEXA e acompanhe seus resultados.">
        {pronto ? (
          <SucessoAcesso texto="Abrindo sua área de parceiro…" duracaoMs={900} />
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <span className="self-start inline-flex items-center gap-1.5 rounded-full bg-gold/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#06151E]">
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                Parceiros
              </span>
              <h1 className={tituloAcesso}>Entrar como parceiro</h1>
            </div>

            <form onSubmit={entrar} noValidate className="flex flex-col gap-4">
              {erro === 'vazio' && (
                <div role="alert" className={avisoErroAcesso}>
                  <AlertCircle className="w-[18px] h-[18px] text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm text-red-700">Digite seu e-mail e sua senha.</p>
                </div>
              )}

              {erro === 'nao-parceiro' && (
                <div role="alert" className={avisoErroAcesso}>
                  <AlertCircle className="w-[18px] h-[18px] text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-sm text-red-700">
                    <p className="font-semibold">Esta entrada é só para parceiros convidados.</p>
                    <p className="mt-1">
                      Se você é vendedor,{' '}
                      <Link to="/login" className="underline underline-offset-2 font-semibold">
                        entre por aqui
                      </Link>
                      . Se recebeu um convite, abra o link do convite.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="parceiro-email" className={rotuloAcesso}>
                  E-mail
                </label>
                <input
                  id="parceiro-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(evento) => setEmail(evento.target.value)}
                  placeholder="seuemail@exemplo.com"
                  aria-invalid={Boolean(erro)}
                  className={campoAcesso}
                  disabled={carregando}
                />
              </div>

              <div>
                <label htmlFor="parceiro-senha" className={rotuloAcesso}>
                  Senha
                </label>
                <div className="relative">
                  <input
                    id="parceiro-senha"
                    type={mostrarSenha ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={senha}
                    onChange={(evento) => setSenha(evento.target.value)}
                    placeholder="Digite sua senha"
                    aria-invalid={Boolean(erro)}
                    className={`${campoAcesso} pr-14`}
                    disabled={carregando}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha(!mostrarSenha)}
                    aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full text-[#5B6770] hover:text-[#06151E]"
                  >
                    {mostrarSenha ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </div>
              </div>

              <Link
                to="/esqueci-senha"
                className="self-end inline-flex items-center min-h-[44px] -my-2 text-sm font-medium text-[#06151E] hover:underline underline-offset-4"
              >
                Esqueci minha senha
              </Link>

              <button type="submit" disabled={carregando} className={botaoAcesso}>
                {carregando ? (
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
              É vendedor?{' '}
              <Link to="/login" className={linkTrocaAcesso}>
                Entrar na área do vendedor
              </Link>
            </p>
          </>
        )}
      </TelaDeAcesso>
      <FaixaDePrevia />
    </>
  );
}
