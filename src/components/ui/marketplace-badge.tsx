import { useState } from 'react';
import { Handshake, ShoppingBag, Store } from 'lucide-react';

/**
 * Identifica visualmente o marketplace de onde a venda veio.
 *
 * Existe para vendedor e fornecedor reconhecerem a origem de relance, sem ler
 * texto — importante agora que só há Mercado Livre, e mais ainda quando entrar
 * Shopee.
 *
 * Usa o arquivo oficial em `public/` quando ele existe. Enquanto não existe,
 * desenha um selo nas cores da marca em vez de mostrar imagem quebrada: fica
 * reconhecível, parece intencional, e não distribui um arquivo de marca
 * registrada refeito à mão.
 */

interface MarcaConhecida {
  /**
   * Arquivos em ordem de preferência. O componente desce a lista quando um
   * falha, então o PNG oficial pode ser adicionado depois sem tocar em código,
   * e enquanto não existe vale o símbolo desenhado.
   */
  logos: string[];
  fundo: string;
  cor: string;
  icone: typeof Handshake;
}

const mercadoLivre: MarcaConhecida = {
  logos: ['/mercado-livre.png', '/mercado-livre.svg'],
  fundo: '#FFE600',
  cor: '#2D3277',
  icone: Handshake,
};

const marcas: Record<string, MarcaConhecida> = {
  'mercado livre': mercadoLivre,
  mercadolivre: mercadoLivre,
  shopee: {
    logos: ['/shopee.png', '/shopee.svg'],
    fundo: '#EE4D2D',
    cor: '#FFFFFF',
    icone: ShoppingBag,
  },
};

interface MarketplaceBadgeProps {
  marketplace: string;
  /** Mostra o nome ao lado da logo. */
  showName?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const dimensoes = {
  sm: { caixa: 'w-[18px] h-[18px]', icone: 'w-3 h-3', raio: 'rounded', texto: 'text-xs' },
  md: { caixa: 'w-6 h-6', icone: 'w-4 h-4', raio: 'rounded-md', texto: 'text-sm' },
  lg: { caixa: 'w-10 h-10', icone: 'w-6 h-6', raio: 'rounded-xl', texto: 'text-base' },
};

export default function MarketplaceBadge({
  marketplace,
  showName = true,
  size = 'sm',
  className = '',
}: MarketplaceBadgeProps) {
  /** Índice do arquivo em uso. Avança a cada falha até acabarem as opções. */
  const [tentativa, setTentativa] = useState(0);

  const nome = marketplace?.trim() || 'Marketplace';
  const marca = marcas[nome.toLowerCase()];
  const medida = dimensoes[size];

  const Icone = marca?.icone ?? Store;
  const arquivo = marca?.logos[tentativa];

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {arquivo ? (
        <img
          key={arquivo}
          src={arquivo}
          alt=""
          className={`${medida.caixa} object-contain shrink-0`}
          onError={() => setTentativa((atual) => atual + 1)}
          draggable={false}
        />
      ) : (
        <span
          className={`${medida.caixa} ${medida.raio} shrink-0 flex items-center justify-center`}
          style={
            marca
              ? { backgroundColor: marca.fundo }
              : undefined
          }
          aria-hidden="true"
        >
          <Icone
            className={`${medida.icone} ${marca ? '' : 'text-gray-500'}`}
            style={marca ? { color: marca.cor } : undefined}
            strokeWidth={2.5}
          />
        </span>
      )}

      {showName && <span className={medida.texto}>{nome}</span>}
    </span>
  );
}
