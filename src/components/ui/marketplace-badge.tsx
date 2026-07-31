import { useState } from 'react';
import { Store } from 'lucide-react';

/**
 * Identifica visualmente o marketplace de onde a venda veio.
 *
 * Existe para o vendedor e o fornecedor reconhecerem a origem de relance, sem
 * ler texto — importante agora que só há Mercado Livre, e mais ainda quando
 * entrar Shopee.
 *
 * O arquivo da logo fica em `public/`. Se estiver faltando, o componente cai
 * num selo neutro com a inicial em vez de mostrar imagem quebrada: assim a
 * tela nunca fica feia por causa de um asset ausente.
 */

const logos: Record<string, string> = {
  'mercado livre': '/mercado-livre.svg',
  mercadolivre: '/mercado-livre.svg',
  shopee: '/shopee.svg',
};

interface MarketplaceBadgeProps {
  marketplace: string;
  /** Mostra o nome ao lado da logo. */
  showName?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export default function MarketplaceBadge({
  marketplace,
  showName = true,
  size = 'sm',
  className = '',
}: MarketplaceBadgeProps) {
  const [falhou, setFalhou] = useState(false);

  const nome = marketplace?.trim() || 'Marketplace';
  const logo = logos[nome.toLowerCase()];

  const dimensao = size === 'md' ? 'w-6 h-6' : 'w-[18px] h-[18px]';
  const texto = size === 'md' ? 'text-sm' : 'text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {logo && !falhou ? (
        <img
          src={logo}
          alt=""
          className={`${dimensao} object-contain shrink-0`}
          onError={() => setFalhou(true)}
          draggable={false}
        />
      ) : (
        <span
          className={`${dimensao} shrink-0 rounded bg-gray-200 dark:bg-navy-600 flex items-center justify-center`}
          aria-hidden="true"
        >
          <Store className="w-3 h-3 text-gray-600 dark:text-slate-300" />
        </span>
      )}

      {showName && <span className={texto}>{nome}</span>}
    </span>
  );
}
