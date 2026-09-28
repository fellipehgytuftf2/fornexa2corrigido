import { useMemo } from 'react';
import { supabase } from '../../lib/supabase';

/**
 * A foto da pessoa, ou as iniciais dela.
 *
 * POR QUE UM COMPONENTE SÓ
 *
 * A foto aparece no menu, no perfil, no pódio, na tabela do ranking e na
 * comemoração. Cinco lugares montando o endereço do arquivo por conta própria
 * é a receita para um deles mostrar quadrado enquanto o resto mostra redondo —
 * ou para o sem-foto virar um buraco cinza em vez de iniciais.
 */

const TAMANHOS = {
  p: { caixa: 32, texto: 'text-xs' },
  m: { caixa: 44, texto: 'text-sm' },
  g: { caixa: 72, texto: 'text-xl' },
  gg: { caixa: 96, texto: 'text-2xl' },
} as const;

function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);

  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();

  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

interface Props {
  foto?: string | null;
  nome?: string | null;
  tamanho?: keyof typeof TAMANHOS;
  /** Moldura de destaque, usada no pódio. */
  anel?: string;
}

export default function Avatar({ foto, nome, tamanho = 'm', anel }: Props) {
  const { caixa, texto } = TAMANHOS[tamanho];

  const endereco = useMemo(() => {
    if (!foto) return null;

    // O bucket é público: link direto, sem uma chamada por linha da tabela.
    return supabase.storage.from('avatares').getPublicUrl(foto).data.publicUrl;
  }, [foto]);

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-gray-100 dark:bg-navy-700 ${
        anel ?? ''
      }`}
      style={{ width: caixa, height: caixa }}
    >
      {endereco ? (
        <img
          src={endereco}
          alt={nome ?? 'Foto de perfil'}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className={`font-semibold text-gray-500 dark:text-slate-300 ${texto}`}>
          {iniciais(nome)}
        </span>
      )}
    </span>
  );
}
