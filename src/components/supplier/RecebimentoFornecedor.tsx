import { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, ShieldCheck, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * Como e quando o fornecedor aceita receber.
 *
 * Duas decisões que são a mesma conversa, por isso moram na mesma tela: por
 * onde o dinheiro chega, e a partir de quando ele para de esperar o dinheiro
 * para despachar.
 */
export default function RecebimentoFornecedor() {
  const [chavePix, setChavePix] = useState('');
  const [liberaApos, setLiberaApos] = useState('');
  const [exigeAntecipado, setExigeAntecipado] = useState(false);

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const carregar = async () => {
      setCarregando(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('suppliers')
        .select('chave_pix, libera_apos_pedidos_pagos, exige_pagamento_antecipado')
        .eq('auth_user_id', user?.id ?? '')
        .maybeSingle<{
          chave_pix: string | null;
          libera_apos_pedidos_pagos: number | null;
          exige_pagamento_antecipado: boolean | null;
        }>();

      setCarregando(false);

      if (error) {
        setErro(`Não foi possível carregar seus dados: ${error.message}`);
        return;
      }

      setChavePix(data?.chave_pix ?? '');
      setLiberaApos(
        data?.libera_apos_pedidos_pagos ? String(data.libera_apos_pedidos_pagos) : ''
      );
      setExigeAntecipado(Boolean(data?.exige_pagamento_antecipado));
    };

    carregar();
  }, []);

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    setSalvo(false);

    const { error } = await supabase.rpc('fornecedor_define_recebimento', {
      p_chave_pix: chavePix.trim() || null,
      p_libera_apos: Number(liberaApos) || null,
    });

    setSalvando(false);

    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }

    setSalvo(true);
    window.setTimeout(() => setSalvo(false), 2400);
  };

  if (carregando) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="w-8 h-8 text-slate-600 animate-spin mx-auto" />
        <p className="text-slate-400 mt-4">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {erro && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-red-300">{erro}</p>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="font-semibold text-white flex items-center gap-2">
          <Wallet className="w-4 h-4 text-gold" aria-hidden="true" />
          Sua chave PIX
        </p>

        <p className="text-sm text-slate-400 mt-1 leading-relaxed">
          Com ela cadastrada, o vendedor copia um código já com o valor certo e
          paga em um clique — sem perguntar nada a você.
        </p>

        <label htmlFor="chave-pix" className="sr-only">
          Chave PIX
        </label>

        <input
          id="chave-pix"
          value={chavePix}
          onChange={(evento) => setChavePix(evento.target.value)}
          placeholder="CNPJ, telefone, e-mail ou chave aleatória"
          className="w-full mt-4 rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
        />

        {/* O aviso é curto porque o risco é grande e específico. */}
        <p className="text-sm text-slate-400 mt-3 leading-relaxed">
          Confira caractere por caractere. O dinheiro vai direto do banco do
          vendedor para o seu — o FORNEXA não passa no meio e não tem como
          desfazer um envio para a chave errada.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="font-semibold text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-gold" aria-hidden="true" />
          Vendedor de confiança
        </p>

        {exigeAntecipado ? (
          <>
            <p className="text-sm text-slate-400 mt-1 leading-relaxed">
              Hoje você recebe antes de despachar. Depois de alguns pedidos
              pagos em dia, dá para deixar o vendedor conhecido despachar na
              hora e acertar depois — como funciona no atacado.
            </p>

            <div className="flex flex-wrap items-center gap-3 mt-4">
              <label htmlFor="libera-apos" className="text-sm text-slate-300">
                Liberar sem esperar após
              </label>

              <input
                id="libera-apos"
                type="number"
                min="0"
                inputMode="numeric"
                value={liberaApos}
                onChange={(evento) => setLiberaApos(evento.target.value)}
                placeholder="0"
                className="w-24 rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2.5 text-center text-white font-mono tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
              />

              <span className="text-sm text-slate-300">pedidos pagos</span>
            </div>

            <p className="text-sm text-slate-400 mt-3 leading-relaxed">
              {Number(liberaApos) > 0
                ? `Quem já pagou ${liberaApos} pedido(s) a você despacha na hora. Quem nunca comprou continua pagando antes.`
                : 'Vazio ou zero: todo vendedor paga antes, sempre.'}
            </p>

            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              A contagem é só entre você e cada vendedor. Pedido pago a outro
              fornecedor não conta.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-400 mt-1 leading-relaxed">
            Você não exige pagamento antes de despachar, então todo pedido já
            libera na hora. Esta regra não muda nada para você.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={salvar}
        disabled={salvando}
        className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-navy-900 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50"
      >
        {salvando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {salvo && !salvando && <Check className="w-4 h-4" aria-hidden="true" />}
        {salvando ? 'Salvando...' : salvo ? 'Salvo' : 'Salvar'}
      </button>
    </div>
  );
}
