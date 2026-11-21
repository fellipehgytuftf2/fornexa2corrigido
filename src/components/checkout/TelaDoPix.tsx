import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { ArrowLeft, Check, Clock, Copy, Smartphone } from 'lucide-react';
import { pixFoiPago, type CobrancaPix } from '../../lib/pixDoCheckout';

const reais = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function useContagem(expiraEm: string | null) {
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const relogio = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(relogio);
  }, []);

  if (!expiraEm) return null;
  const restante = Math.max(0, new Date(expiraEm).getTime() - agora);
  const minutos = Math.floor(restante / 60000);
  const segundos = Math.floor((restante % 60000) / 1000);
  return { acabou: restante === 0, texto: `${minutos}:${String(segundos).padStart(2, '0')}` };
}

export default function TelaDoPix({
  cobranca,
  email,
  nomeDoPlano,
  mensal,
  aoVoltar,
}: {
  cobranca: CobrancaPix;
  email: string;
  nomeDoPlano: string;
  mensal: boolean;
  aoVoltar: () => void;
}) {
  const [imagem, setImagem] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [pago, setPago] = useState(false);
  const contagem = useContagem(cobranca.expiraEm);

  useEffect(() => {
    QRCode.toDataURL(cobranca.codigo, {
      width: 520,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#041016', light: '#ffffff' },
    }).then(setImagem);
  }, [cobranca.codigo]);

  // Pergunta ao servidor a cada 4s. Quem decide se pagou é o aviso da
  // Applyfy gravado lá, nunca este navegador.
  useEffect(() => {
    if (cobranca.demonstracao || pago) return;

    const vigia = window.setInterval(async () => {
      if (await pixFoiPago(cobranca.transacao)) setPago(true);
    }, 4000);

    return () => window.clearInterval(vigia);
  }, [cobranca, pago]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(cobranca.codigo);
    } catch {
      /* navegador sem permissão: o código continua visível para copiar à mão */
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2500);
  };

  if (pago) {
    return (
      <div className="acesso-aviso text-center py-6">
        <div className="acesso-pop mx-auto w-20 h-20 rounded-full bg-emerald-400 flex items-center justify-center shadow-[0_0_60px_rgba(52,211,153,0.35)]">
          <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="#041016" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path className="acesso-check" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h2 className="mt-6 font-display text-2xl md:text-3xl font-semibold">Pagamento confirmado!</h2>
        <p className="mt-2 text-slate-300">
          Seu acesso ao <strong className="text-white">{nomeDoPlano}</strong> foi liberado para
        </p>
        <p className="mt-1 font-semibold text-gold break-all">{email}</p>
        <Link
          to={`/register?email=${encodeURIComponent(email)}`}
          className="btn-fnx btn-fnx-primario acesso-botao mt-8 inline-flex h-14 px-8 items-center justify-center gap-2 font-semibold"
        >
          Criar minha conta
        </Link>
        <p className="mt-4 text-xs text-slate-500">Já tem conta? <Link to="/login" className="text-gold hover:underline">Entrar</Link></p>
      </div>
    );
  }

  return (
    <div className="acesso-aviso">
      <button type="button" onClick={aoVoltar} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Trocar forma de pagamento
      </button>

      {cobranca.demonstracao && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <strong>Prévia:</strong> este QR Code é só de demonstração e não cobra nada. No ar, aqui aparece o Pix de verdade gerado pela Applyfy.
        </div>
      )}

      <div className="mt-6 grid md:grid-cols-[260px_1fr] gap-6 md:gap-8 items-center">
        <div className="mx-auto w-full max-w-[260px]">
          <div className="relative rounded-2xl bg-white p-3 shadow-[0_0_0_6px_rgba(255,211,0,0.15),0_20px_60px_rgba(0,0,0,0.5)]">
            {imagem ? (
              <img src={imagem} alt="QR Code do Pix" className={`w-full aspect-square ${contagem?.acabou ? 'opacity-20 blur-[2px]' : ''}`} />
            ) : (
              <div className="w-full aspect-square animate-pulse rounded-lg bg-slate-200" />
            )}
            {contagem?.acabou && (
              <div className="absolute inset-0 flex items-center justify-center text-center text-sm font-semibold text-navy-950 px-6">
                Este Pix expirou. Volte e gere outro.
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm text-slate-400">Valor</p>
          <p className="text-3xl font-bold tracking-tight">
            {reais(cobranca.valor)}
            {mensal && <span className="text-base font-normal text-slate-400">/mês</span>}
          </p>

          {contagem && !contagem.acabou && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-300">
              <Clock className="w-4 h-4 text-gold" aria-hidden="true" />
              Expira em <span className="font-mono font-semibold text-white">{contagem.texto}</span>
            </p>
          )}

          <ol className="mt-5 space-y-2.5 text-sm text-slate-300">
            <li className="flex gap-3"><Passo n={1} /><span>Abra o app do seu banco e escolha <strong className="text-white">Pix</strong>.</span></li>
            <li className="flex gap-3"><Passo n={2} /><span>Escaneie o QR Code ou use o <strong className="text-white">copia e cola</strong>.</span></li>
            <li className="flex gap-3"><Passo n={3} /><span>Confirme. O acesso libera aqui na hora.</span></li>
          </ol>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm text-slate-300 mb-2 flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-gold" aria-hidden="true" />
          Pix copia e cola
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            value={cobranca.codigo}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 h-12 rounded-xl bg-navy-950/70 border border-white/10 px-4 font-mono text-xs text-slate-300 outline-none"
            aria-label="Código Pix copia e cola"
          />
          <button
            type="button"
            onClick={copiar}
            className={`h-12 px-5 rounded-xl font-semibold text-sm inline-flex items-center gap-2 transition-colors ${
              copiado ? 'bg-emerald-400 text-navy-950' : 'bg-gold text-navy-950 hover:brightness-110'
            }`}
          >
            {copiado ? <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
            {copiado ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] py-4 text-sm text-slate-300" role="status">
        <span className="relative flex w-2.5 h-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-gold opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-gold" />
        </span>
        Aguardando o pagamento…
      </div>

      {cobranca.demonstracao && (
        <button type="button" onClick={() => setPago(true)} className="mt-4 w-full text-center text-sm text-amber-300 hover:underline">
          Simular pagamento aprovado (só na prévia)
        </button>
      )}
    </div>
  );
}

function Passo({ n }: { n: number }) {
  return (
    <span className="w-5 h-5 shrink-0 rounded-full bg-white/10 text-[11px] font-bold text-gold flex items-center justify-center">{n}</span>
  );
}
