import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Check, CreditCard, Lock, Mail, ShieldCheck, Ticket, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  PLANOS,
  buscarLinksDeCheckout,
  montarCheckout,
  pegarCodigoDoAfiliado,
  planosComCheckout,
  type Plano,
} from '../lib/planos';
import { PRECO_CHEIO_DA_OFERTA, conferirCupom, type Influenciador } from '../lib/cupons';

/**
 * O checkout da FORNEXA (fornexa.site/checkout?plano=basico|premium).
 *
 * Fica entre a landing e a Applyfy. Aqui a pessoa confere o plano, vê o
 * cupom e escreve os dados com calma. Depois ela segue para a
 * Applyfy, que já abre com nome e e-mail preenchidos: lá só falta pagar.
 *
 * PRÉVIA — branch feat/checkout-proprio. Os dados ficam só no navegador.
 */

const CHAVE_DOS_DADOS = 'fornexa_checkout_dados';

const reais = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "R$ 169,00" -> 169 */
const valorDoTexto = (texto: string) => Number(texto.replace(/[^\d,]/g, '').replace(',', '.')) || 0;

const soDigitos = (texto: string) => texto.replace(/\D/g, '');

function mascaraDeTelefone(texto: string) {
  const d = soDigitos(texto).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const emailValido = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

type Campo = 'nome' | 'email' | 'whatsapp';

export default function Checkout() {
  const [parametros, setParametros] = useSearchParams();
  const idDoPlano: Plano['id'] = parametros.get('plano') === 'basico' ? 'basico' : 'premium';

  const [cupom, setCupom] = useState<Influenciador | null>(null);
  const [planos, setPlanos] = useState(PLANOS);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [tocados, setTocados] = useState<Partial<Record<Campo, boolean>>>({});
  const [tremer, setTremer] = useState(0);
  const [indo, setIndo] = useState(false);
  const [semCheckout, setSemCheckout] = useState(false);

  useEffect(() => {
    // O cupom vem no endereço, posto pelo botão da landing de oferta. Não se
    // lê do navegador: um cupom esquecido de outra visita não pode mudar uma
    // compra feita pela landing normal ou pelo link de um afiliado.
    const doLink = new URLSearchParams(window.location.search).get('cupom');

    // Com cupom, a compra vai pelos checkouts da casa (é o que a landing de
    // oferta promete). Sem cupom, vale a regra de sempre: afiliado compra no dele.
    if (doLink) {
      conferirCupom(doLink).then((resultado) => setCupom(resultado.ok ? resultado.influenciador : null));
    } else {
      buscarLinksDeCheckout(pegarCodigoDoAfiliado()).then((links) => setPlanos(planosComCheckout(links)));
    }

    // Quem já tem conta não digita tudo de novo.
    supabase.auth.getSession().then(({ data }) => {
      const usuario = data.session?.user;
      if (usuario?.email) {
        setEmail(usuario.email);
        setNome((atual) => atual || (usuario.user_metadata?.name as string) || '');
      }
    });

    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_DOS_DADOS) || 'null');
      if (salvo) {
        setNome((atual) => atual || salvo.nome || '');
        setEmail((atual) => atual || salvo.email || '');
        setWhatsapp((atual) => atual || salvo.whatsapp || '');
      }
    } catch {
      /* sem dados guardados, começa em branco */
    }
  }, []);

  const plano = planos.find((p) => p.id === idDoPlano) ?? planos[planos.length - 1];
  const mensal = plano.id === 'basico';
  const precoFinal = valorDoTexto(plano.preco);
  const precoCheio = cupom ? PRECO_CHEIO_DA_OFERTA[plano.id] : plano.precoAntigo ? valorDoTexto(plano.precoAntigo) : null;

  const erros = useMemo(() => {
    const lista: Partial<Record<Campo, string>> = {};
    if (nome.trim().length < 3) lista.nome = 'Escreva seu nome.';
    if (!emailValido(email)) lista.email = 'Confira o e-mail.';
    const digitos = soDigitos(whatsapp).length;
    if (digitos < 10 || digitos > 11) lista.whatsapp = 'Coloque o WhatsApp com DDD.';
    return lista;
  }, [nome, email, whatsapp]);

  const trocarPlano = (id: Plano['id']) => {
    const novos = new URLSearchParams(parametros);
    novos.set('plano', id);
    setParametros(novos, { replace: true });
  };

  const continuar = (evento: FormEvent) => {
    evento.preventDefault();

    if (Object.keys(erros).length) {
      setTocados({ nome: true, email: true, whatsapp: true });
      setTremer((vezes) => vezes + 1);
      return;
    }

    const dados = { nome: nome.trim(), email: email.trim().toLowerCase(), whatsapp };
    try {
      localStorage.setItem(CHAVE_DOS_DADOS, JSON.stringify(dados));
    } catch {
      /* não guardar não impede de pagar */
    }

    const link = montarCheckout(plano, { email: dados.email, nome: dados.nome });
    setIndo(true);

    window.setTimeout(() => {
      if (link) {
        window.location.href = link;
      } else {
        setSemCheckout(true);
      }
    }, 1800);
  };

  const erroDe = (campo: Campo) => (tocados[campo] ? erros[campo] : undefined);
  const marcar = (campo: Campo) => () => setTocados((atual) => ({ ...atual, [campo]: true }));

  return (
    <div className="relative min-h-screen bg-navy-950 text-white overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-30" aria-hidden="true" />
      <div
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-gold/10 blur-[120px]"
        aria-hidden="true"
      />

      <header className="relative border-b border-white/10">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to={cupom ? '/oferta#planos' : '/#planos'} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Voltar</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-md overflow-hidden bg-navy-900 flex items-center justify-center">
              <img src="/fornexa-logo.jpeg" alt="" className="w-full h-full object-cover scale-[2.8]" draggable={false} />
            </div>
            <span className="font-display font-semibold text-lg tracking-tight">FORNEXA</span>
          </div>

          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <Lock className="w-3.5 h-3.5 text-gold" aria-hidden="true" />
            <span className="hidden sm:inline">Compra segura</span>
          </span>
        </div>
      </header>

      <main className="relative max-w-5xl mx-auto px-5 py-10 md:py-14">
        <div className="mb-8 md:mb-10">
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-[-0.02em]">Finalizar compra</h1>
          <p className="text-slate-400 mt-2">Confira o plano e seus dados. O pagamento é no próximo passo.</p>
        </div>

        <form
          onSubmit={continuar}
          noValidate
          className="grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-8 items-start"
        >
          <div className="space-y-6">
            {/* 1. Plano */}
            <Etapa numero={1} titulo="Seu plano">
              <div className="grid sm:grid-cols-2 gap-3">
                {planos.map((opcao) => {
                  const ativo = opcao.id === plano.id;
                  const ehMensal = opcao.id === 'basico';
                  return (
                    <button
                      key={opcao.id}
                      type="button"
                      onClick={() => trocarPlano(opcao.id)}
                      aria-pressed={ativo}
                      className={`relative text-left rounded-xl p-4 border transition-all ${
                        ativo
                          ? 'border-gold bg-gold/[0.07] shadow-[0_0_0_3px_rgba(255,211,0,0.12)]'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                      }`}
                    >
                      <span
                        className={`absolute top-4 right-4 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          ativo ? 'border-gold bg-gold' : 'border-white/25'
                        }`}
                        aria-hidden="true"
                      >
                        {ativo && <Check className="w-3 h-3 text-navy-950" strokeWidth={3.5} />}
                      </span>
                      <span className="block text-sm font-semibold">{ehMensal ? 'Mensal' : 'Vitalício'}</span>
                      <span className="block mt-1 text-xl font-bold">
                        {opcao.preco}
                        {ehMensal && <span className="text-sm font-normal text-slate-400">/mês</span>}
                      </span>
                      <span className="block mt-1 text-xs text-slate-400">
                        {ehMensal ? 'Renova todo mês' : 'Paga uma vez, usa pra sempre'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Etapa>

            {/* 2. Dados */}
            <Etapa numero={2} titulo="Seus dados">
              <div key={tremer} className={`grid sm:grid-cols-2 gap-4 ${tremer ? (tremer % 2 ? 'acesso-treme-a' : 'acesso-treme-b') : ''}`}>
                <CampoDoForm id="ck-nome" rotulo="Nome completo" erro={erroDe('nome')} className="sm:col-span-2">
                  <input
                    id="ck-nome"
                    autoComplete="name"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    onBlur={marcar('nome')}
                    placeholder="Como está no seu documento"
                    className={classeDoCampo(erroDe('nome'))}
                    disabled={indo}
                  />
                </CampoDoForm>

                <CampoDoForm id="ck-email" rotulo="E-mail" erro={erroDe('email')}>
                  <input
                    id="ck-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={marcar('email')}
                    placeholder="seuemail@exemplo.com"
                    className={classeDoCampo(erroDe('email'))}
                    disabled={indo}
                  />
                </CampoDoForm>

                <CampoDoForm id="ck-whatsapp" rotulo="WhatsApp" erro={erroDe('whatsapp')}>
                  <input
                    id="ck-whatsapp"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(mascaraDeTelefone(e.target.value))}
                    onBlur={marcar('whatsapp')}
                    placeholder="(11) 99999-9999"
                    className={classeDoCampo(erroDe('whatsapp'))}
                    disabled={indo}
                  />
                </CampoDoForm>
              </div>

              <p className="mt-4 flex items-start gap-2 text-xs text-slate-400 leading-relaxed">
                <Mail className="w-4 h-4 text-gold shrink-0 mt-px" aria-hidden="true" />
                Seu acesso é liberado neste e-mail. Use o mesmo quando for criar a sua conta na FORNEXA.
              </p>
            </Etapa>
          </div>

          {/* Resumo */}
          <aside className="lg:sticky lg:top-6">
            <div className="rounded-2xl border border-white/10 bg-navy-900/80 backdrop-blur p-6">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">Resumo</h2>

              <div className="mt-5 flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{plano.nome}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{mensal ? 'Assinatura mensal' : 'Pagamento único · acesso vitalício'}</p>
                </div>
                {precoCheio && (
                  <span className="text-sm text-slate-500 line-through whitespace-nowrap">{reais(precoCheio)}</span>
                )}
              </div>

              {cupom && (
                <div className="acesso-aviso mt-4 flex items-center justify-between gap-3 rounded-xl border border-dashed border-gold/50 bg-gold/[0.06] px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm">
                    <Ticket className="w-4 h-4 text-gold" aria-hidden="true" />
                    Cupom <span className="font-mono font-semibold tracking-wider text-gold">{cupom.cupom}</span>
                  </span>
                  <span className="text-sm font-semibold text-gold whitespace-nowrap">
                    −{reais((precoCheio ?? precoFinal) - precoFinal)}
                  </span>
                </div>
              )}

              <div className="mt-5 pt-5 border-t border-white/10 flex items-end justify-between">
                <span className="text-slate-300">Total</span>
                <span className="text-right">
                  <span className="block text-3xl font-bold tracking-tight">{reais(precoFinal)}</span>
                  <span className="block text-xs text-slate-400">{mensal ? 'por mês' : 'uma vez só'}</span>
                </span>
              </div>

              <button
                type="submit"
                disabled={indo}
                className="btn-fnx btn-fnx-primario acesso-botao mt-6 flex w-full h-14 items-center justify-center gap-2 font-semibold disabled:opacity-80"
              >
                <Lock className="w-4 h-4" aria-hidden="true" />
                <span>Ir para o pagamento</span>
              </button>

              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                <li className="flex items-center gap-3">
                  <Zap className="w-4 h-4 text-gold shrink-0" aria-hidden="true" />
                  PIX ou cartão
                </li>
                <li className="flex items-center gap-3">
                  <ShieldCheck className="w-4 h-4 text-gold shrink-0" aria-hidden="true" />
                  Pagamento processado com segurança pela Applyfy
                </li>
                <li className="flex items-center gap-3">
                  <CreditCard className="w-4 h-4 text-gold shrink-0" aria-hidden="true" />
                  Seus dados de pagamento não passam pela FORNEXA
                </li>
              </ul>
            </div>
          </aside>
        </form>
      </main>

      {indo && <TelaDeIda nome={nome.trim().split(' ')[0]} semCheckout={semCheckout} aoVoltar={() => { setIndo(false); setSemCheckout(false); }} />}
    </div>
  );
}

function Etapa({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-navy-900/60 p-5 sm:p-6">
      <h2 className="flex items-center gap-3 font-semibold mb-5">
        <span className="w-7 h-7 rounded-full bg-gold text-navy-950 text-sm font-bold flex items-center justify-center">{numero}</span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function CampoDoForm({
  id,
  rotulo,
  erro,
  className = '',
  children,
}: {
  id: string;
  rotulo: string;
  erro?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm text-slate-300 mb-1.5">
        {rotulo}
      </label>
      {children}
      {erro && (
        <p role="alert" className="acesso-aviso mt-1.5 flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {erro}
        </p>
      )}
    </div>
  );
}

const classeDoCampo = (erro?: string) =>
  `w-full h-12 rounded-xl bg-navy-950/70 border px-4 text-white placeholder:text-slate-500 outline-none transition-colors focus:ring-2 disabled:opacity-60 ${
    erro ? 'border-red-400/70 focus:ring-red-400/20' : 'border-white/10 focus:border-gold focus:ring-gold/20'
  }`;

/** O intervalo entre "Ir para o pagamento" e a Applyfy abrir. */
function TelaDeIda({ nome, semCheckout, aoVoltar }: { nome: string; semCheckout: boolean; aoVoltar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-navy-950/95 backdrop-blur-sm flex items-center justify-center px-6" role="status">
      <div className="acesso-aviso w-full max-w-sm text-center">
        <div className="acesso-pop mx-auto w-16 h-16 rounded-2xl bg-gold flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="#041016" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path className="acesso-check" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>

        {semCheckout ? (
          <>
            <p className="mt-6 text-xl font-semibold">Prévia: o pagamento abriria aqui</p>
            <p className="mt-2 text-sm text-slate-400">
              Neste ambiente de teste a Applyfy não está configurada. No ar, a pessoa cai direto no pagamento com nome e e-mail preenchidos.
            </p>
            <button type="button" onClick={aoVoltar} className="mt-6 text-sm text-gold hover:underline">
              Voltar ao checkout
            </button>
          </>
        ) : (
          <>
            <p className="mt-6 text-xl font-semibold">Tudo certo{nome ? `, ${nome}` : ''}!</p>
            <p className="mt-2 text-sm text-slate-400">Levando você ao pagamento seguro…</p>
            <div className="mt-6 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="acesso-barra h-full bg-gold rounded-full" style={{ animationDuration: '1.8s' }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
