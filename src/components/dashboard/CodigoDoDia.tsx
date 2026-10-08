import { useEffect, useState } from 'react';
import { CheckCircle, KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * O código de autorização do dia, informado uma vez.
 *
 * O Mercado Livre gera um código por dia, e ele libera TODAS as devoluções
 * daquele vendedor naquele dia — uma ou dez. Antes o FORNEXA pedia um código
 * por devolução: o vendedor colava numa, a outra do mesmo dia continuava
 * "esperando código", e o fornecedor via pendência onde não havia.
 *
 * O motorista chega com o pacote e pede o código na portaria. Quem não colou
 * perde a tentativa — e são duas antes de o produto se perder.
 */
export default function CodigoDoDia({ aoSalvar }: { aoSalvar?: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [salvo, setSalvo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const carregar = async () => {
      const { data } = await supabase.rpc('meu_codigo_do_dia');

      const linha = (data as { codigo: string }[] | null)?.[0];

      if (linha?.codigo) {
        setSalvo(linha.codigo);
        setCodigo(linha.codigo);
      }
    };

    carregar();
  }, []);

  const salvar = async () => {
    setSalvando(true);
    setErro('');

    const { data, error } = await supabase.rpc('vendedor_define_codigo_do_dia', {
      p_codigo: codigo,
    });

    setSalvando(false);

    const resposta = data as { ok?: boolean; erro?: string; codigo?: string } | null;

    if (error || !resposta?.ok) {
      setErro(error?.message ?? resposta?.erro ?? 'Não foi possível salvar o código.');
      return;
    }

    setSalvo(resposta.codigo ?? codigo);
    setCodigo(resposta.codigo ?? codigo);
    aoSalvar?.();
  };

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-gold/15 flex items-center justify-center shrink-0">
          <KeyRound className="w-4 h-4 text-gold" aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <p className="font-semibold text-navy-900 dark:text-white">
            Código de devolução de hoje
          </p>

          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
            O Mercado Livre gera um código por dia, e ele vale para todas as suas
            devoluções de hoje. Cole aqui assim que receber — é o que libera o motorista
            na portaria do fornecedor, e são só duas tentativas.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mt-4">
        <input
          value={codigo}
          onChange={(evento) => setCodigo(evento.target.value.toUpperCase())}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') salvar();
          }}
          placeholder="Ex: E94EB6C0"
          className="flex-1 min-w-0 px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900 font-mono text-sm tracking-widest text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
        />

        <button
          type="button"
          onClick={salvar}
          disabled={salvando || !codigo.trim()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gold text-navy-900 text-sm font-semibold transition-colors hover:bg-gold-hover disabled:opacity-50"
        >
          {salvando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {salvo ? 'Atualizar código' : 'Salvar código'}
        </button>
      </div>

      {salvo && (
        <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mt-3">
          <CheckCircle className="w-4 h-4" aria-hidden="true" />
          Seu fornecedor já está vendo <strong className="font-mono">{salvo}</strong> em
          todas as suas devoluções de hoje.
        </p>
      )}

      {erro && <p className="text-sm text-red-600 dark:text-red-400 mt-3">{erro}</p>}
    </div>
  );
}
