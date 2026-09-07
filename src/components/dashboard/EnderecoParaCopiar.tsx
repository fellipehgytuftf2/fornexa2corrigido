import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export interface PartesDoEndereco {
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
}

/**
 * O endereço do fornecedor, campo a campo, cada um com seu botão de copiar.
 *
 * O formulário do Mercado Livre pede CEP, rua, número, complemento e bairro em
 * caixas separadas. Entregar tudo numa linha só — "Rua Pedro Vicente, 266 —
 * Luz — São Paulo/SP — 01109-010" — obrigava o vendedor a recortar o texto no
 * meio, campo por campo, e errar aí é errar o remetente da etiqueta.
 *
 * A ordem é a do formulário deles, de propósito: quem está preenchendo desce a
 * lista de cima para baixo sem procurar nada.
 *
 * Cidade e estado ficam por último e sem botão: o Mercado Livre os preenche
 * sozinho a partir do CEP. Aparecem só para o vendedor conferir que o CEP que
 * ele colou é o certo.
 */
export default function EnderecoParaCopiar({ partes }: { partes: PartesDoEndereco }) {
  const [copiado, setCopiado] = useState<string | null>(null);

  const copiar = async (campo: string, valor: string) => {
    await navigator.clipboard.writeText(valor);
    setCopiado(campo);
    window.setTimeout(() => setCopiado((atual) => (atual === campo ? null : atual)), 2000);
  };

  const campos = [
    { chave: 'cep', rotulo: 'CEP', valor: partes.cep },
    { chave: 'logradouro', rotulo: 'Rua / Avenida', valor: partes.logradouro },
    { chave: 'numero', rotulo: 'Número', valor: partes.numero },
    { chave: 'complemento', rotulo: 'Complemento', valor: partes.complemento },
    { chave: 'bairro', rotulo: 'Bairro', valor: partes.bairro },
  ].filter((campo) => Boolean(campo.valor));

  const cidadeEstado = [partes.cidade, partes.estado].filter(Boolean).join('/');

  return (
    <div className="mt-3 space-y-2">
      {campos.map((campo) => (
        <div
          key={campo.chave}
          className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-navy-600 px-3 py-2"
        >
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400">
              {campo.rotulo}
            </p>

            <p className="text-sm text-navy-900 dark:text-white truncate">{campo.valor}</p>
          </div>

          <button
            type="button"
            onClick={() => copiar(campo.chave, String(campo.valor))}
            aria-label={`Copiar ${campo.rotulo}`}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-xs font-semibold transition-colors"
          >
            {copiado === campo.chave ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copiar
              </>
            )}
          </button>
        </div>
      ))}

      {cidadeEstado && (
        <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
          O Mercado Livre preenche cidade e estado sozinho pelo CEP. Tem que
          aparecer <strong className="text-navy-900 dark:text-white">{cidadeEstado}</strong> —
          se aparecer outra coisa, o CEP está errado.
        </p>
      )}
    </div>
  );
}
