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
 * lista de cima para baixo sem procurar nada. Uma linha por campo, com o botão
 * só de ícone: são cinco campos, e cinco caixas com borda e a palavra "Copiar"
 * ocupavam meia tela para dizer pouco.
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
    <div className="divide-y divide-gray-100 dark:divide-navy-700">
      {campos.map((campo) => (
        <div key={campo.chave} className="flex items-center gap-3 py-1.5">
          <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400">
            {campo.rotulo}
          </span>

          <span className="flex-1 min-w-0 truncate text-sm text-navy-900 dark:text-white">
            {campo.valor}
          </span>

          <button
            type="button"
            onClick={() => copiar(campo.chave, String(campo.valor))}
            aria-label={`Copiar ${campo.rotulo}`}
            title={`Copiar ${campo.rotulo}`}
            className="shrink-0 p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-700 hover:text-navy-900 dark:hover:text-white transition-colors"
          >
            {copiado === campo.chave ? (
              <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      ))}

      {cidadeEstado && (
        <p className="pt-2 text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
          O Mercado Livre preenche cidade e estado sozinho pelo CEP. Tem que
          aparecer <strong className="text-navy-900 dark:text-white">{cidadeEstado}</strong> —
          se aparecer outra coisa, o CEP está errado.
        </p>
      )}
    </div>
  );
}
