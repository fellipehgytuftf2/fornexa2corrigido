import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, Check, Ticket, X } from 'lucide-react';
import { PLANOS, montarCheckout } from '../../lib/planos';
import {
  conferirCupom,
  cupomDoLink,
  cupomGuardado,
  guardarCupom,
  normalizarCupom,
  type Influenciador,
} from '../../lib/cupons';

/**
 * Os planos da landing de oferta (fornexa.site/oferta).
 *
 * Na landing principal o Premium sai por R$ 297. Aqui ele aparece por
 * R$ 594, com a caixa de cupom já aberta em cima: o cupom do influenciador
 * (a maioria de 50%) derruba o preço, e os R$ 594 vão para o lugar do
 * "preço antigo", riscados. O Básico fica do lado, com o preço de sempre:
 * o cupom vale só para o Premium.
 *
 * PRÉVIA — branch feat/cupom-influenciador. Os cupons são de exemplo, e o
 * checkout de R$ 594 ainda não existe na Applyfy.
 */

const PRECO_DA_OFERTA = 594;

const reais = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** O número corre de um valor ao outro, para o desconto "cair" na tela. */
function useValorAnimado(alvo: number) {
  const [valor, setValor] = useState(alvo);
  const anterior = useRef(alvo);

  useEffect(() => {
    const de = anterior.current;
    anterior.current = alvo;
    if (de === alvo || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValor(alvo);
      return;
    }

    const inicio = performance.now();
    let quadro = 0;
    const passo = (agora: number) => {
      const t = Math.min((agora - inicio) / 700, 1);
      const suave = 1 - Math.pow(1 - t, 3);
      setValor(de + (alvo - de) * suave);
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo]);

  return valor;
}

export default function PlanoDaOferta() {
  const premium = PLANOS.find((plano) => plano.id === 'premium') ?? PLANOS[PLANOS.length - 1];
  const basico = PLANOS.find((plano) => plano.id === 'basico') ?? PLANOS[0];
  const linkBasico = montarCheckout(basico);

  const [texto, setTexto] = useState('');
  const [cupom, setCupom] = useState<Influenciador | null>(null);
  const [erro, setErro] = useState('');
  const [tremer, setTremer] = useState(0);

  useEffect(() => {
    const inicial = cupomDoLink() || cupomGuardado();
    if (!inicial) return;
    const resultado = conferirCupom(inicial);
    if (resultado.ok) {
      setCupom(resultado.influenciador);
      guardarCupom(resultado.influenciador.cupom);
    }
  }, []);

  const aplicar = (evento: FormEvent) => {
    evento.preventDefault();

    if (!texto) {
      setErro('Digite o cupom.');
      setTremer((vezes) => vezes + 1);
      return;
    }

    const resultado = conferirCupom(texto);
    if (!resultado.ok) {
      setErro(resultado.motivo === 'inativo' ? 'Este cupom não está mais valendo.' : 'Cupom não encontrado. Confira como está escrito.');
      setTremer((vezes) => vezes + 1);
      return;
    }

    setErro('');
    setCupom(resultado.influenciador);
    guardarCupom(resultado.influenciador.cupom);
  };

  const remover = () => {
    setCupom(null);
    setTexto('');
    guardarCupom(null);
  };

  const desconto = cupom?.desconto ?? 0;
  const precoFinal = Math.round(PRECO_DA_OFERTA * (1 - desconto / 100) * 100) / 100;
  const precoNaTela = useValorAnimado(precoFinal);

  // Com cupom, o checkout é o do Premium de sempre (R$ 297). Sem cupom, seria
  // um checkout de R$ 594, que ainda não existe.
  const linkComCupom = montarCheckout(premium);

  return (
    <section id="planos" className="bg-navy-900 py-24 scroll-mt-28">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-10">
          <h2 className="text-white text-4xl font-bold mb-4">Escolha seu plano</h2>
          <p className="text-slate-400 text-lg">Tem um cupom? Coloque abaixo e veja o preço do Premium cair.</p>
        </div>

        {/* A caixa do cupom já vem aberta: nada para clicar antes de digitar. */}
        <div className="mb-12 max-w-xl mx-auto">
          {cupom ? (
            <div role="status" className="acesso-aviso flex items-center gap-3 rounded-2xl border-2 border-gold bg-navy-800/80 p-3 pr-2">
              <span className="w-11 h-11 rounded-xl bg-gold text-navy-900 flex items-center justify-center shrink-0">
                <Check className="w-6 h-6" strokeWidth={3} aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">
                  Cupom <span className="font-mono tracking-wider text-gold">{cupom.cupom}</span> aplicado
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{cupom.desconto}% de desconto no Plano Premium</p>
              </div>
              <button
                type="button"
                onClick={remover}
                aria-label="Tirar o cupom"
                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-white/10 shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <form
              onSubmit={aplicar}
              noValidate
              className={`rounded-2xl border border-navy-600 bg-navy-800/80 p-3 ${
                tremer === 0 ? '' : tremer % 2 ? 'acesso-treme-a' : 'acesso-treme-b'
              }`}
            >
              <label htmlFor="cupom-oferta" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                <Ticket className="w-4 h-4 text-gold" aria-hidden="true" />
                Cupom de desconto
              </label>
              <div className="flex gap-2">
                <input
                  id="cupom-oferta"
                  value={texto}
                  onChange={(evento) => {
                    setTexto(normalizarCupom(evento.target.value));
                    setErro('');
                  }}
                  placeholder="Digite seu cupom"
                  autoComplete="off"
                  aria-invalid={Boolean(erro)}
                  aria-describedby={erro ? 'cupom-oferta-erro' : undefined}
                  className="flex-1 min-w-0 h-12 px-4 rounded-xl border border-navy-600 bg-navy-900 font-mono tracking-wider uppercase text-[15px] text-white placeholder:normal-case placeholder:tracking-normal placeholder:font-sans placeholder:text-slate-500 focus:outline-none focus:border-gold"
                />
                <button type="submit" className="h-12 px-5 rounded-xl bg-gold text-navy-900 text-sm font-bold hover:bg-gold-hover shrink-0">
                  Aplicar
                </button>
              </div>
              {erro && (
                <p id="cupom-oferta-erro" role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-red-400">
                  <AlertCircle className="w-4 h-4" aria-hidden="true" />
                  {erro}
                </p>
              )}
            </form>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6 items-stretch justify-items-center">
        <div className="bg-navy-700 rounded-[28px] border border-navy-600 p-10 w-full max-w-sm h-full flex flex-col">
          <h3 className="text-white font-semibold text-xl mb-3">{basico.nome}</h3>
          <div className="mb-8">
            {/* Mesmo espaço do "De R$ 594" do Premium, para os dois preços
                ficarem na mesma altura. */}
            <span className="block text-lg mb-1 invisible" aria-hidden="true">
              —
            </span>
            <span className="text-white text-4xl font-bold">{basico.preco}</span>
            <span className="text-slate-400">{basico.periodo}</span>
          </div>
          <ul className="space-y-4 mb-10">
            {basico.beneficios.map((beneficio) => (
              <li key={beneficio} className="flex items-center gap-3 text-slate-300 text-sm">
                <Check className="w-4 h-4 text-gold flex-shrink-0" aria-hidden="true" />
                {beneficio}
              </li>
            ))}
          </ul>
          <div className="mt-auto">
            <a
              href={linkBasico || '/register'}
              className="btn-fnx btn-fnx-secundario flex w-full items-center justify-center py-3 font-medium"
            >
              <span>{basico.chamada}</span>
            </a>
          </div>
        </div>

        <div className="relative w-full max-w-sm h-full">
          <div className="relative bg-navy-700 rounded-[28px] border-2 border-gold p-10 h-full flex flex-col">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-black text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
              {premium.destaque}
            </div>

            <h3 className="text-white font-semibold text-xl mb-3">{premium.nome}</h3>

            <div className="mb-8">
              {/* Com cupom, os R$ 594 viram o preço antigo, riscados. */}
              <span
                className={`block text-lg line-through mb-1 transition-all duration-500 ${
                  cupom ? 'text-slate-400 opacity-100 translate-y-0' : 'text-transparent opacity-0 -translate-y-1'
                }`}
                aria-hidden={!cupom}
              >
                De {reais(PRECO_DA_OFERTA)}
              </span>

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-white text-4xl font-bold tabular-nums">{reais(precoNaTela)}</span>
                {cupom && (
                  <span className="acesso-aviso inline-flex items-center rounded-full bg-gold px-2.5 py-1 text-sm font-bold text-navy-900">
                    −{cupom.desconto}%
                  </span>
                )}
              </div>
              <span className="text-slate-400 block text-sm mt-1">{premium.periodo}</span>
            </div>

            <ul className="space-y-4 mb-10">
              {premium.beneficios.map((beneficio) => (
                <li key={beneficio} className="flex items-center gap-3 text-slate-300 text-sm">
                  <Check className="w-4 h-4 text-gold flex-shrink-0" aria-hidden="true" />
                  {beneficio}
                </li>
              ))}
            </ul>

            <div className="mt-auto">
              <a
                href={cupom ? linkComCupom || '/register' : '#cupom-oferta'}
                className="btn-fnx btn-fnx-primario flex w-full items-center justify-center py-3 font-semibold"
              >
                <span>Pagar {reais(precoFinal)}</span>
              </a>
              {!cupom && (
                <p className="mt-3 text-center text-xs text-slate-500">
                  Prévia: o checkout de {reais(PRECO_DA_OFERTA)} ainda não foi criado na Applyfy.
                </p>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}
