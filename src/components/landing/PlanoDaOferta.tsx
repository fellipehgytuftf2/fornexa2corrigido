import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, Check, Lock, Ticket, X } from 'lucide-react';
import { PLANOS, montarCheckout, type Plano } from '../../lib/planos';
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
 * Aqui os planos aparecem pelo dobro — Básico R$ 338/mês e Premium R$ 594 —
 * e o cupom do influenciador (a maioria de 50%) traz cada um de volta ao
 * preço de sempre. Com o cupom, o valor cheio vai para o lugar do "preço
 * antigo", riscado.
 *
 * O cupom é obrigatório: sem ele, os botões não seguem para o pagamento e
 * pedem o cupom. Por isso não existe checkout de R$ 338 nem de R$ 594 — com
 * o cupom, a compra vai para os checkouts de sempre (R$ 169 e R$ 297).
 *
 * PRÉVIA — branch feat/cupom-influenciador. Os cupons são de exemplo.
 */

/** O preço cheio de cada plano nesta landing. */
const PRECO_CHEIO: Record<Plano['id'], number> = { basico: 338, premium: 594 };

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
  const basico = PLANOS.find((plano) => plano.id === 'basico') ?? PLANOS[0];
  const premium = PLANOS.find((plano) => plano.id === 'premium') ?? PLANOS[PLANOS.length - 1];

  const [texto, setTexto] = useState('');
  const [cupom, setCupom] = useState<Influenciador | null>(null);
  const [erro, setErro] = useState('');
  const [tremer, setTremer] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

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

  /** Sem cupom, o botão do plano leva de volta à caixa do cupom. */
  const pedirCupom = () => {
    setErro('Coloque o seu cupom para continuar.');
    setTremer((vezes) => vezes + 1);
    document.getElementById('caixa-do-cupom')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => campo.current?.focus(), 350);
  };

  return (
    <section id="planos" className="bg-navy-900 py-24 scroll-mt-28">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-10">
          <h2 className="text-white text-4xl font-bold mb-4">Escolha seu plano</h2>
          <p className="text-slate-400 text-lg">Coloque o seu cupom e veja o preço cair.</p>
        </div>

        {/* A caixa do cupom já vem aberta: nada para clicar antes de digitar. */}
        <div id="caixa-do-cupom" className="mb-12 max-w-xl mx-auto scroll-mt-28">
          {cupom ? (
            <div role="status" className="acesso-aviso flex items-center gap-3 rounded-2xl border-2 border-gold bg-navy-800/80 p-3 pr-2">
              <span className="w-11 h-11 rounded-xl bg-gold text-navy-900 flex items-center justify-center shrink-0">
                <Check className="w-6 h-6" strokeWidth={3} aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">
                  Cupom <span className="font-mono tracking-wider text-gold">{cupom.cupom}</span> aplicado
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{cupom.desconto}% de desconto nos dois planos</p>
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
              className={`rounded-2xl border-2 border-gold/60 bg-navy-800/80 p-3 shadow-[0_0_0_6px_rgba(255,211,0,0.06)] ${
                tremer === 0 ? '' : tremer % 2 ? 'acesso-treme-a' : 'acesso-treme-b'
              }`}
            >
              <label htmlFor="cupom-oferta" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                <Ticket className="w-4 h-4 text-gold" aria-hidden="true" />
                Cupom de desconto
              </label>
              <div className="flex gap-2">
                <input
                  ref={campo}
                  id="cupom-oferta"
                  value={texto}
                  onChange={(evento) => {
                    setTexto(normalizarCupom(evento.target.value));
                    setErro('');
                  }}
                  placeholder="Digite seu cupom"
                  autoComplete="off"
                  aria-invalid={Boolean(erro)}
                  aria-describedby="cupom-oferta-aviso"
                  className="flex-1 min-w-0 h-12 px-4 rounded-xl border border-navy-600 bg-navy-900 font-mono tracking-wider uppercase text-[15px] text-white placeholder:normal-case placeholder:tracking-normal placeholder:font-sans placeholder:text-slate-500 focus:outline-none focus:border-gold"
                />
                <button type="submit" className="h-12 px-5 rounded-xl bg-gold text-navy-900 text-sm font-bold hover:bg-gold-hover shrink-0">
                  Aplicar
                </button>
              </div>
              <p
                id="cupom-oferta-aviso"
                role={erro ? 'alert' : undefined}
                className={`mt-2.5 flex items-center gap-1.5 text-sm ${erro ? 'text-red-400' : 'text-slate-400'}`}
              >
                {erro ? <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" /> : <Lock className="w-4 h-4 shrink-0 text-gold" aria-hidden="true" />}
                {erro || 'Para continuar, é preciso colocar o cupom.'}
              </p>
            </form>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6 items-stretch justify-items-center">
          <CartaoDoPlano plano={basico} cupom={cupom} aoPedirCupom={pedirCupom} />
          <CartaoDoPlano plano={premium} cupom={cupom} aoPedirCupom={pedirCupom} destacado />
        </div>
      </div>
    </section>
  );
}

function CartaoDoPlano({
  plano,
  cupom,
  aoPedirCupom,
  destacado = false,
}: {
  plano: Plano;
  cupom: Influenciador | null;
  aoPedirCupom: () => void;
  destacado?: boolean;
}) {
  const cheio = PRECO_CHEIO[plano.id];
  const desconto = cupom?.desconto ?? 0;
  const precoFinal = Math.round(cheio * (1 - desconto / 100) * 100) / 100;
  const precoNaTela = useValorAnimado(precoFinal);
  // Com cupom, a compra segue para o checkout de sempre do plano.
  const link = montarCheckout(plano);
  const mensal = plano.id === 'basico';

  return (
    <div className="relative w-full max-w-sm h-full">
      <div
        className={`relative bg-navy-700 rounded-[28px] p-10 h-full flex flex-col ${
          destacado ? 'border-2 border-gold' : 'border border-navy-600'
        }`}
      >
        {plano.destaque && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-black text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
            {plano.destaque}
          </div>
        )}

        <h3 className="text-white font-semibold text-xl mb-3">{plano.nome}</h3>

        <div className="mb-8">
          {/* Com cupom, o preço cheio vai para o lugar do preço antigo, riscado. */}
          <span
            className={`block text-lg line-through mb-1 transition-all duration-500 ${
              cupom ? 'text-slate-400 opacity-100 translate-y-0' : 'text-transparent opacity-0 -translate-y-1'
            }`}
            aria-hidden={!cupom}
          >
            De {reais(cheio)}
            {mensal ? '/mês' : ''}
          </span>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <span className="text-white text-4xl font-bold tabular-nums">{reais(precoNaTela)}</span>
              {mensal && <span className="text-slate-400">{plano.periodo}</span>}
            </span>
            {cupom && (
              <span className="acesso-aviso inline-flex items-center rounded-full bg-gold px-2.5 py-1 text-sm font-bold text-navy-900">
                −{cupom.desconto}%
              </span>
            )}
          </div>
          {!mensal && <span className="text-slate-400 block text-sm mt-1">{plano.periodo}</span>}
        </div>

        <ul className="space-y-4 mb-10">
          {plano.beneficios.map((beneficio) => (
            <li key={beneficio} className="flex items-center gap-3 text-slate-300 text-sm">
              <Check className="w-4 h-4 text-gold flex-shrink-0" aria-hidden="true" />
              {beneficio}
            </li>
          ))}
        </ul>

        <div className="mt-auto">
          {cupom ? (
            <a
              href={link || '/register'}
              className={`btn-fnx ${destacado ? 'btn-fnx-primario font-semibold' : 'btn-fnx-secundario font-medium'} flex w-full items-center justify-center py-3`}
            >
              <span>
                {mensal ? 'Comprar Mensal' : 'Comprar Vitalício'}
              </span>
            </a>
          ) : (
            <button
              type="button"
              onClick={aoPedirCupom}
              className="group flex w-full h-12 items-center justify-center gap-2 rounded-full bg-white/[0.06] border border-white/10 text-slate-300 text-sm font-semibold whitespace-nowrap hover:bg-white/10 hover:text-white hover:border-gold/40 transition-colors"
            >
              <Lock className="w-4 h-4 text-gold flex-shrink-0" aria-hidden="true" />
              <span>Insira o cupom para liberar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
