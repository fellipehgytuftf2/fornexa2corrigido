import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Check, Ticket, X } from 'lucide-react';
import {
  conferirCupom,
  cupomDoLink,
  cupomGuardado,
  guardarCupom,
  normalizarCupom,
  type Influenciador,
} from '../../lib/cupons';

/**
 * A caixa "Tem cupom?" que fica em cima dos planos.
 *
 * Fechada, é uma linha discreta: quem não tem cupom não é atrapalhado. Com
 * cupom no link (?cupom=BRUNO10) ou guardado de antes, já abre aplicada —
 * o seguidor do influenciador não precisa digitar nada.
 */
export default function CupomDeInfluenciador({
  escuro = false,
  aoMudar,
}: {
  escuro?: boolean;
  aoMudar?: (influenciador: Influenciador | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [aplicado, setAplicado] = useState<Influenciador | null>(null);
  const [erro, setErro] = useState('');
  const [tremer, setTremer] = useState(0);

  useEffect(() => {
    const inicial = cupomDoLink() || cupomGuardado();
    if (!inicial) return;
    const resultado = conferirCupom(inicial);
    if (resultado.ok) {
      setAplicado(resultado.influenciador);
      guardarCupom(resultado.influenciador.cupom);
      aoMudar?.(resultado.influenciador);
    }
    // Só na chegada à página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aplicar = (evento: FormEvent) => {
    evento.preventDefault();
    const resultado = conferirCupom(texto);

    if (!resultado.ok) {
      setErro(
        resultado.motivo === 'inativo'
          ? 'Este cupom não está mais valendo.'
          : 'Cupom não encontrado. Confira como o influenciador escreveu.'
      );
      setTremer((vezes) => vezes + 1);
      return;
    }

    setErro('');
    setAplicado(resultado.influenciador);
    guardarCupom(resultado.influenciador.cupom);
    aoMudar?.(resultado.influenciador);
  };

  const remover = () => {
    setAplicado(null);
    setTexto('');
    guardarCupom(null);
    aoMudar?.(null);
  };

  const cores = escuro
    ? {
        caixa: 'bg-navy-800/80 border-navy-600',
        texto: 'text-white',
        suave: 'text-slate-400',
        campo: 'bg-navy-900 border-navy-600 text-white placeholder:text-slate-500 focus:border-gold',
        link: 'text-slate-300 hover:text-white',
      }
    : {
        caixa: 'bg-white border-gray-200 dark:bg-navy-800 dark:border-navy-700',
        texto: 'text-navy-900 dark:text-white',
        suave: 'text-gray-500 dark:text-slate-400',
        campo: 'bg-gray-50 border-gray-200 text-navy-900 placeholder:text-gray-400 focus:border-navy-900 dark:bg-navy-900 dark:border-navy-700 dark:text-white',
        link: 'text-navy-900 hover:underline dark:text-slate-200',
      };

  if (aplicado) {
    return (
      <div
        role="status"
        className={`acesso-aviso w-full max-w-xl mx-auto flex items-center gap-3 rounded-2xl border-2 border-gold p-3 pr-2 ${cores.caixa}`}
      >
        <span className="w-11 h-11 rounded-full bg-gold text-navy-900 flex items-center justify-center font-bold shrink-0">
          {aplicado.nome[0]}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold flex items-center gap-1.5 ${cores.texto}`}>
            <Check className="w-4 h-4 text-gold" strokeWidth={3} aria-hidden="true" />
            Cupom <span className="font-mono tracking-wider">{aplicado.cupom}</span> aplicado
          </p>
          <p className={`text-xs mt-0.5 truncate ${cores.suave}`}>
            Indicação de {aplicado.nome} · {aplicado.perfil}
            {aplicado.desconto ? ` · ${aplicado.desconto}% de desconto` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={remover}
          aria-label="Tirar o cupom"
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${cores.suave} hover:bg-black/5 dark:hover:bg-white/10`}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (!aberto) {
    return (
      <div className="text-center">
        <button
          type="button"
          onClick={() => setAberto(true)}
          className={`inline-flex items-center gap-2 min-h-[44px] px-2 text-sm font-semibold underline-offset-4 ${cores.link}`}
        >
          <Ticket className="w-4 h-4 text-gold" aria-hidden="true" />
          Tem cupom de influenciador?
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={aplicar}
      noValidate
      className={`w-full max-w-xl mx-auto rounded-2xl border p-3 ${cores.caixa} ${
        tremer === 0 ? '' : tremer % 2 ? 'acesso-treme-a' : 'acesso-treme-b'
      }`}
    >
      <label htmlFor="cupom-influenciador" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${cores.suave}`}>
        Cupom de influenciador
      </label>
      <div className="flex gap-2">
        <input
          id="cupom-influenciador"
          value={texto}
          onChange={(evento) => {
            setTexto(normalizarCupom(evento.target.value));
            setErro('');
          }}
          placeholder="Ex.: BRUNO10"
          autoComplete="off"
          autoFocus
          aria-invalid={Boolean(erro)}
          aria-describedby={erro ? 'cupom-erro' : undefined}
          className={`flex-1 min-w-0 h-12 px-4 rounded-xl border font-mono tracking-wider uppercase text-[15px] focus:outline-none ${cores.campo}`}
        />
        <button
          type="submit"
          className="h-12 px-5 rounded-xl bg-gold text-navy-900 text-sm font-bold hover:bg-gold-hover shrink-0"
        >
          Aplicar
        </button>
      </div>
      {erro && (
        <p id="cupom-erro" role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" aria-hidden="true" />
          {erro}
        </p>
      )}
    </form>
  );
}
