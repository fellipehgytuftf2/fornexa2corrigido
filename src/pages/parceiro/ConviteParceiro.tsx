import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Loader2, Lock, ShieldCheck } from 'lucide-react';
import TelaDeAcesso from '../../components/auth/TelaDeAcesso';
import SucessoAcesso from '../../components/auth/SucessoAcesso';
import {
  avisoErroAcesso,
  botaoAcesso,
  campoAcesso,
  rotuloAcesso,
  tituloAcesso,
} from '../../components/auth/estiloAcesso';
import { FaixaDePrevia, PARCEIRO_DE_EXEMPLO } from './previa';

/**
 * O convite, do lado do parceiro: ele abre o link que recebeu e cria a senha.
 *
 * A trava é o próprio link. Ele só existe porque o dono ou o co-produtor
 * cadastrou essa pessoa, vale para um e-mail só, vence em 7 dias e funciona
 * uma vez. Quem não recebeu convite não tem como chegar aqui — e quem chega
 * entra já como parceiro, sem pagar plano e sem esperar aprovação.
 *
 * PRÉVIA: ainda não cria conta. O botão simula o caminho até a área do
 * parceiro.
 */
export default function ConviteParceiro() {
  const navigate = useNavigate();
  const [nome, setNome] = useState(PARCEIRO_DE_EXEMPLO.nome);
  const [senha, setSenha] = useState('');
  const [repetida, setRepetida] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [tremer, setTremer] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const temporizador = useRef<number>();

  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  const ativar = (evento: FormEvent) => {
    evento.preventDefault();

    const problema = !nome.trim()
      ? 'Digite seu nome.'
      : senha.length < 8
        ? 'A senha precisa ter pelo menos 8 caracteres.'
        : senha !== repetida
          ? 'As duas senhas não são iguais.'
          : '';

    setErro(problema);

    if (problema) {
      setTremer((vezes) => vezes + 1);
      return;
    }

    setCarregando(true);
    temporizador.current = window.setTimeout(() => {
      setCarregando(false);
      setPronto(true);
      temporizador.current = window.setTimeout(() => navigate('/parceiro'), 1200);
    }, 900);
  };

  return (
    <>
      <TelaDeAcesso tremer={tremer} sucesso={pronto} frase="Área do parceiro: divulgue o FORNEXA e acompanhe seus resultados.">
        {pronto ? (
          <SucessoAcesso texto="Abrindo sua área de parceiro…" duracaoMs={1200} />
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <span className="self-start inline-flex items-center gap-1.5 rounded-full bg-gold/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#06151E]">
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                Convite de parceiro
              </span>
              <h1 className={tituloAcesso}>Ative sua conta</h1>
              <p className="text-sm text-[#5B6770] leading-relaxed">
                Você foi convidado pelo {PARCEIRO_DE_EXEMPLO.convidadoPor} para divulgar a plataforma. Sua
                conta de parceiro é gratuita.
              </p>
            </div>

            <form onSubmit={ativar} noValidate className="flex flex-col gap-4">
              {erro && (
                <div role="alert" className={avisoErroAcesso}>
                  <AlertCircle className="w-[18px] h-[18px] text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-sm text-red-700">{erro}</p>
                </div>
              )}

              <div>
                <label htmlFor="convite-email" className={rotuloAcesso}>
                  E-mail do convite
                </label>
                <div className="relative">
                  <input
                    id="convite-email"
                    type="email"
                    value={PARCEIRO_DE_EXEMPLO.email}
                    readOnly
                    aria-describedby="convite-email-dica"
                    className={`${campoAcesso} pr-12 bg-[#EEF1F3] text-[#33424C] cursor-not-allowed`}
                  />
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5B6770]" aria-hidden="true" />
                </div>
                <p id="convite-email-dica" className="text-xs text-[#5B6770] mt-2">
                  O convite vale só para este e-mail.
                </p>
              </div>

              <div>
                <label htmlFor="convite-nome" className={rotuloAcesso}>
                  Seu nome
                </label>
                <input
                  id="convite-nome"
                  type="text"
                  autoComplete="name"
                  value={nome}
                  onChange={(evento) => setNome(evento.target.value)}
                  className={campoAcesso}
                  disabled={carregando}
                />
              </div>

              <div>
                <label htmlFor="convite-senha" className={rotuloAcesso}>
                  Crie uma senha
                </label>
                <div className="relative">
                  <input
                    id="convite-senha"
                    type={mostrarSenha ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={senha}
                    onChange={(evento) => setSenha(evento.target.value)}
                    placeholder="Mínimo 8 caracteres"
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

              <div>
                <label htmlFor="convite-repetida" className={rotuloAcesso}>
                  Repita a senha
                </label>
                <input
                  id="convite-repetida"
                  type={mostrarSenha ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={repetida}
                  onChange={(evento) => setRepetida(evento.target.value)}
                  aria-invalid={Boolean(erro)}
                  className={campoAcesso}
                  disabled={carregando}
                />
              </div>

              <button type="submit" disabled={carregando} className={botaoAcesso}>
                {carregando ? (
                  <>
                    <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" />
                    Ativando…
                  </>
                ) : (
                  'Ativar minha conta de parceiro'
                )}
              </button>
            </form>

            <p className="text-center text-xs text-[#5B6770] leading-relaxed">
              Seu link de divulgação vai ser <strong className="text-[#06151E]">fornexa.site/{PARCEIRO_DE_EXEMPLO.apelido}</strong>
            </p>
          </>
        )}
      </TelaDeAcesso>
      <FaixaDePrevia />
    </>
  );
}
