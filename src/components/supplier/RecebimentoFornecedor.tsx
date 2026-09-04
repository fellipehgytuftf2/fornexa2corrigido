import { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * Por onde o dinheiro do repasse chega ao fornecedor.
 *
 * Com a chave guardada, o vendedor copia um código PIX já com o valor certo em
 * vez de procurar o WhatsApp, perguntar a chave e digitar tudo na mão.
 *
 * Quem digita é o fornecedor, nunca o admin. Chave errada digitada por
 * terceiro manda dinheiro para estranho, e a responsabilidade tem que ser de
 * quem recebe.
 */
export default function RecebimentoFornecedor() {
  const [chavePix, setChavePix] = useState('');

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
        .select('chave_pix')
        .eq('auth_user_id', user?.id ?? '')
        .maybeSingle<{ chave_pix: string | null }>();

      setCarregando(false);

      if (error) {
        setErro(`Não foi possível carregar seus dados: ${error.message}`);
        return;
      }

      setChavePix(data?.chave_pix ?? '');
    };

    carregar();
  }, []);

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    setSalvo(false);

    const { error } = await supabase.rpc('fornecedor_define_recebimento', {
      p_chave_pix: chavePix.trim() || null,
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
          paga em um clique — sem precisar perguntar nada a você.
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

        {/* A chave tem que ser IGUAL à que está registrada no banco. Formatada
            de outro jeito, o aplicativo do pagador responde "chave não
            encontrada" — mesmo ela existindo. */}
        <p className="text-sm text-slate-400 mt-3 leading-relaxed">
          Escreva do mesmo jeito que ela está registrada no seu banco:
        </p>

        <ul className="text-sm text-slate-400 mt-2 space-y-1 list-disc pl-5">
          <li>CNPJ ou CPF: só números</li>
          <li>Celular: com o +55 na frente</li>
          <li>E-mail ou chave aleatória: exatamente como aparece lá</li>
        </ul>

        <p className="text-sm text-slate-400 mt-3 leading-relaxed">
          Confira caractere por caractere. O dinheiro vai direto do banco do
          vendedor para o seu — o FORNEXA não passa no meio e não tem como
          desfazer um envio para a chave errada.
        </p>
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
