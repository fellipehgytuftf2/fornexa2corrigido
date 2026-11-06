import type { CSSProperties, ReactNode } from 'react';
import {
  AlertCircle,
  ExternalLink,
  Pencil,
  Share2,
  Trash2,
  Truck,
  TrendingUp,
} from 'lucide-react';

/**
 * O card de um anúncio em Meus Anúncios, em vários formatos.
 *
 * PRÉVIA — branch feat/cards-anuncios. A página escolhe o formato por uma
 * barra de prévia; o escolhido fica, os outros saem. As regras (o que mostrar,
 * quando mostrar) continuam todas em MyProducts — aqui é só desenho.
 */

export type FormatoDoCartao = 'atual' | 'vitrine' | 'raiox' | 'linha';

export interface DadosDoCartao {
  imagem: string;
  nome: string;
  titulo: string;
  marketplace: string;
  /** O selo de situação, já decidido pela página. */
  situacao: { texto: string; tom: 'ativo' | 'pausado' | 'neutro' };
  /** Aviso de estoque, quando houver: pausado pelo FORNEXA ou prestes a ser. */
  avisoDeEstoque: { pausado: boolean; texto: string } | null;
  salvoEm: string;
  precoFornecedor: number;
  precoVenda: number;
  lucro: number;
  margemPercentual: number;
  temFornecedor: boolean;
  prazo: string;
  /** O bloco de "vendendo no prejuízo", montado pela página. */
  alertaDePrejuizo: ReactNode;
  podeEditar: boolean;
  linkDoAnuncio: string | null;
  podeDivulgar: boolean;
  excluindo: boolean;
  aoEditar: () => void;
  aoDivulgar: () => void;
  aoExcluir: () => void;
  /** Posição na página, para a entrada em cascata. */
  ordem: number;
}

const reais = (valor: number) => `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`;

const corDoSelo = {
  ativo: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pausado: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  neutro: 'bg-gray-100 text-gray-700 dark:bg-navy-700 dark:text-slate-300',
};

const entrada = (ordem: number): CSSProperties => ({ animationDelay: `${Math.min(ordem, 9) * 60}ms` });

/** As classes do grid da página para cada formato. */
export const gradeDoFormato: Record<FormatoDoCartao, string> = {
  atual: 'grid grid-cols-1 xl:grid-cols-2 gap-5',
  vitrine: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5',
  raiox: 'grid grid-cols-1 xl:grid-cols-2 gap-5',
  linha: 'flex flex-col gap-3',
};

export default function CartaoDoAnuncio({ formato, ...dados }: DadosDoCartao & { formato: FormatoDoCartao }) {
  if (formato === 'vitrine') return <Vitrine {...dados} />;
  if (formato === 'raiox') return <RaioX {...dados} />;
  if (formato === 'linha') return <Linha {...dados} />;
  return <Atual {...dados} />;
}

function Selo({ situacao }: { situacao: DadosDoCartao['situacao'] }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${corDoSelo[situacao.tom]}`}>
      {situacao.texto}
    </span>
  );
}

function AvisoDeEstoque({ aviso, className = '' }: { aviso: DadosDoCartao['avisoDeEstoque']; className?: string }) {
  if (!aviso) return null;
  return (
    <div
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
        aviso.pausado
          ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
          : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
      } ${className}`}
    >
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <span>{aviso.texto}</span>
    </div>
  );
}

/** Botão só de ícone, com o nome aparecendo ao passar o mouse. */
function BotaoIcone({
  rotulo,
  onClick,
  href,
  disabled,
  perigo,
  children,
}: {
  rotulo: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  perigo?: boolean;
  children: ReactNode;
}) {
  const classes = `group/icone relative w-11 h-11 rounded-xl flex items-center justify-center border transition-all hover:-translate-y-0.5 disabled:opacity-50 ${
    perigo
      ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-900/20'
      : 'border-gray-200 text-navy-900 hover:border-navy-900 dark:border-white/15 dark:text-white dark:hover:border-white/40'
  }`;
  const dica = (
    <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-navy-950 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover/icone:opacity-100 group-focus-visible/icone:opacity-100">
      {rotulo}
    </span>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={rotulo} className={classes}>
        {children}
        {dica}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={rotulo} className={classes}>
      {children}
      {dica}
    </button>
  );
}

function BotoesSecundarios(dados: DadosDoCartao) {
  return (
    <>
      {dados.podeEditar && (
        <BotaoIcone rotulo="Editar" onClick={dados.aoEditar}>
          <Pencil className="w-[18px] h-[18px]" aria-hidden="true" />
        </BotaoIcone>
      )}
      {dados.linkDoAnuncio && (
        <BotaoIcone rotulo="Ver anúncio" href={dados.linkDoAnuncio}>
          <ExternalLink className="w-[18px] h-[18px]" aria-hidden="true" />
        </BotaoIcone>
      )}
      <BotaoIcone rotulo="Excluir" onClick={dados.aoExcluir} disabled={dados.excluindo} perigo>
        <Trash2 className="w-[18px] h-[18px]" aria-hidden="true" />
      </BotaoIcone>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* VITRINE: foto grande em cima, como numa loja. O lucro é o destaque.  */
/* ------------------------------------------------------------------ */

function Vitrine(dados: DadosDoCartao) {
  const margem = Math.max(0, Math.min(dados.margemPercentual, 300));

  return (
    <article
      style={entrada(dados.ordem)}
      className="cartao-entra group flex flex-col bg-white dark:bg-navy-850 rounded-3xl border border-gray-200 dark:border-white/10 overflow-hidden shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_-20px_rgba(4,16,22,0.35)]"
    >
      <div className="relative aspect-[4/3] bg-white border-b border-gray-100 dark:border-white/10 overflow-hidden">
        <img
          src={dados.imagem}
          alt={dados.nome}
          className="absolute inset-0 w-full h-full object-contain p-6 transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <Selo situacao={dados.situacao} />
        </div>
        <span className="absolute top-3 right-3 px-2 py-1 rounded-full text-[11px] font-semibold bg-white/90 text-navy-900 shadow-sm">
          {dados.marketplace}
        </span>
        <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-navy-950 text-gold px-3 py-1.5 text-sm font-bold shadow-lg">
          <TrendingUp className="w-4 h-4" aria-hidden="true" />+{reais(dados.lucro)}
        </div>
      </div>

      <div className="flex-1 flex flex-col p-5 gap-3">
        <h3 className="font-display text-[15px] font-semibold text-navy-900 dark:text-white leading-snug line-clamp-2 min-h-[2.6em]">
          {dados.titulo}
        </h3>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500 dark:text-slate-400">Você vende por</p>
            <p className="font-display text-2xl font-bold text-navy-900 dark:text-white tracking-tight">
              {reais(dados.precoVenda)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 dark:text-slate-400">Custo</p>
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">{reais(dados.precoFornecedor)}</p>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs font-semibold mb-1.5">
            <span className="text-green-700 dark:text-green-400">Margem {dados.margemPercentual.toFixed(0)}%</span>
            <span className="text-gray-500 dark:text-slate-400 inline-flex items-center gap-1">
              <Truck className="w-3.5 h-3.5" aria-hidden="true" />
              {dados.temFornecedor ? `${dados.prazo} dias` : 'Sem fornecedor'}
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
            <div
              className="barra-enche h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400"
              style={{ width: `${(margem / 300) * 100}%`, animationDelay: `${200 + Math.min(dados.ordem, 9) * 60}ms` }}
            />
          </div>
        </div>

        <AvisoDeEstoque aviso={dados.avisoDeEstoque} />
        {dados.alertaDePrejuizo}

        <div className="mt-auto pt-2 flex items-center gap-2">
          {dados.podeDivulgar ? (
            <button
              type="button"
              onClick={dados.aoDivulgar}
              className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-gold text-navy-900 text-sm font-bold transition-all hover:bg-gold-hover hover:-translate-y-0.5"
            >
              <Share2 className="w-4 h-4" aria-hidden="true" />
              Divulgar
            </button>
          ) : (
            <span className="flex-1" />
          )}
          <BotoesSecundarios {...dados} />
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* RAIO-X: para onde vai cada real da venda, numa barra só.            */
/* ------------------------------------------------------------------ */

function RaioX(dados: DadosDoCartao) {
  const venda = Math.max(dados.precoVenda, 0.01);
  const custo = Math.max(dados.precoFornecedor, 0);
  const lucro = Math.max(dados.lucro, 0);
  // O que sobra entre o preço, o custo e o lucro é o que o Mercado Livre fica
  // (comissão, taxa fixa e frete). Não é estimativa nova: é a conta que já
  // gerou o lucro mostrado aqui.
  const mercadoLivre = Math.max(venda - custo - lucro, 0);
  const pct = (valor: number) => `${(valor / venda) * 100}%`;
  // Produto antigo, salvo antes de o lucro descontar as taxas, chega sem a
  // fatia do Mercado Livre — mostrar "R$ 0,00" ali seria dizer que ele não
  // cobra nada.
  const fatias = [
    { nome: 'Fornecedor', valor: custo, cor: 'bg-slate-400 dark:bg-slate-500' },
    { nome: 'Mercado Livre', valor: mercadoLivre, cor: 'bg-amber-400' },
    { nome: 'Seu lucro', valor: lucro, cor: 'bg-green-500' },
  ].filter((fatia) => fatia.valor > 0.009);

  return (
    <article
      style={entrada(dados.ordem)}
      className="cartao-entra group bg-white dark:bg-navy-850 rounded-3xl border border-gray-200 dark:border-white/10 overflow-hidden shadow-sm transition-shadow duration-300 hover:shadow-[0_24px_48px_-20px_rgba(4,16,22,0.3)]"
    >
      <div className="relative bg-navy-950 text-white p-5 flex gap-4 items-center overflow-hidden">
        <div aria-hidden="true" className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-gold/10 blur-2xl" />
        <div className="relative w-20 h-20 rounded-2xl bg-white p-2 shrink-0 overflow-hidden">
          <img
            src={dados.imagem}
            alt={dados.nome}
            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3"
          />
        </div>
        <div className="relative flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Selo situacao={dados.situacao} />
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-white/10 text-slate-200">
              {dados.marketplace}
            </span>
          </div>
          <h3 className="font-display font-semibold mt-2 leading-snug line-clamp-2">{dados.titulo}</h3>
        </div>
        <div className="relative text-right shrink-0">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Por venda</p>
          <p className="font-display text-2xl font-bold text-gold">+{reais(dados.lucro)}</p>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4">
        <div>
          <div className="flex justify-between items-baseline mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              Para onde vai a venda de {reais(dados.precoVenda)}
            </p>
            <p className="text-xs font-semibold text-green-700 dark:text-green-400">
              {dados.margemPercentual.toFixed(0)}% sobre o custo
            </p>
          </div>
          <div className="flex h-3.5 rounded-full overflow-hidden bg-gray-100 dark:bg-white/10" role="img" aria-label={`Fornecedor ${reais(custo)}, Mercado Livre ${reais(mercadoLivre)}, seu lucro ${reais(lucro)}`}>
            {fatias.map((fatia, indice) => (
              <div
                key={fatia.nome}
                className={`barra-enche h-full ${fatia.cor} ${indice > 0 ? 'border-l-2 border-white dark:border-navy-850' : ''}`}
                style={{ width: pct(fatia.valor), animationDelay: `${150 + indice * 120}ms` }}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {fatias.map((fatia) => (
              <div key={fatia.nome} className="flex items-start gap-2">
                <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${fatia.cor}`} aria-hidden="true" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{fatia.nome}</p>
                  <p className="text-sm font-bold text-navy-900 dark:text-white">{reais(fatia.valor)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
          <Truck className="w-4 h-4 shrink-0" aria-hidden="true" />
          {dados.temFornecedor ? `Envio pelo fornecedor em ${dados.prazo} dias` : 'Fornecedor não vinculado'}
          <span className="ml-auto text-xs text-gray-400 dark:text-slate-500">Salvo em {dados.salvoEm}</span>
        </div>

        <AvisoDeEstoque aviso={dados.avisoDeEstoque} />
        {dados.alertaDePrejuizo}

        <div className="flex items-center gap-2 pt-1">
          {dados.podeDivulgar && (
            <button
              type="button"
              onClick={dados.aoDivulgar}
              className="h-11 px-5 inline-flex items-center justify-center gap-2 rounded-xl bg-gold text-navy-900 text-sm font-bold transition-all hover:bg-gold-hover hover:-translate-y-0.5"
            >
              <Share2 className="w-4 h-4" aria-hidden="true" />
              Divulgar
            </button>
          )}
          {dados.podeEditar && (
            <button
              type="button"
              onClick={dados.aoEditar}
              className="h-11 px-4 inline-flex items-center justify-center gap-2 rounded-xl bg-navy-900 text-white dark:bg-white dark:text-navy-900 text-sm font-semibold transition-all hover:-translate-y-0.5"
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
              Editar
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {dados.linkDoAnuncio && (
              <BotaoIcone rotulo="Ver anúncio" href={dados.linkDoAnuncio}>
                <ExternalLink className="w-[18px] h-[18px]" aria-hidden="true" />
              </BotaoIcone>
            )}
            <BotaoIcone rotulo="Excluir" onClick={dados.aoExcluir} disabled={dados.excluindo} perigo>
              <Trash2 className="w-[18px] h-[18px]" aria-hidden="true" />
            </BotaoIcone>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* LINHA: uma linha por anúncio — para quem tem dezenas e quer bater o  */
/* olho em todos.                                                       */
/* ------------------------------------------------------------------ */

function Linha(dados: DadosDoCartao) {
  return (
    <article
      style={entrada(dados.ordem)}
      className="cartao-entra group bg-white dark:bg-navy-850 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm transition-all duration-200 hover:border-navy-900/30 dark:hover:border-white/25 hover:shadow-md"
    >
      <div className="flex flex-wrap lg:flex-nowrap items-center gap-4 p-3 pr-4">
        <div className="w-16 h-16 rounded-xl bg-white border border-gray-100 dark:border-white/10 p-1.5 shrink-0 overflow-hidden">
          <img src={dados.imagem} alt={dados.nome} className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-110" />
        </div>

        <div className="flex-1 min-w-[200px]">
          <h3 className="text-sm font-semibold text-navy-900 dark:text-white line-clamp-1">{dados.titulo}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <Selo situacao={dados.situacao} />
            <span className="text-xs text-gray-500 dark:text-slate-400">
              {dados.marketplace} · {dados.temFornecedor ? `envio em ${dados.prazo} dias` : 'sem fornecedor'}
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-6 text-right shrink-0">
          <div>
            <dt className="text-[11px] text-gray-500 dark:text-slate-400">Custo</dt>
            <dd className="text-sm font-semibold text-gray-700 dark:text-slate-300">{reais(dados.precoFornecedor)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-gray-500 dark:text-slate-400">Venda</dt>
            <dd className="text-sm font-bold text-navy-900 dark:text-white">{reais(dados.precoVenda)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-gray-500 dark:text-slate-400">Lucro</dt>
            <dd className="text-sm font-bold text-green-600 dark:text-green-400">
              {reais(dados.lucro)} <span className="text-xs font-semibold opacity-80">· {dados.margemPercentual.toFixed(0)}%</span>
            </dd>
          </div>
        </dl>

        <div className="flex items-center gap-2 shrink-0 lg:pl-2">
          {dados.podeDivulgar && (
            <BotaoIcone rotulo="Divulgar" onClick={dados.aoDivulgar}>
              <Share2 className="w-[18px] h-[18px]" aria-hidden="true" />
            </BotaoIcone>
          )}
          <BotoesSecundarios {...dados} />
        </div>
      </div>

      {(dados.avisoDeEstoque || dados.alertaDePrejuizo) && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          <AvisoDeEstoque aviso={dados.avisoDeEstoque} />
          {dados.alertaDePrejuizo}
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* ATUAL: o card de hoje, para comparar.                               */
/* ------------------------------------------------------------------ */

function Atual(dados: DadosDoCartao) {
  return (
    <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="flex gap-4">
          <img src={dados.imagem} alt={dados.nome} className="w-24 h-24 rounded-xl object-cover" />

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-navy-700 dark:text-slate-300">
                {dados.marketplace}
              </span>
              <Selo situacao={dados.situacao} />
            </div>

            <h3 className="text-navy-900 dark:text-white font-bold mt-3 line-clamp-2">{dados.titulo}</h3>

            <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">Salvo em {dados.salvoEm}</p>

            <AvisoDeEstoque aviso={dados.avisoDeEstoque} className="mt-3" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-slate-400">Preço fornecedor</p>
            <p className="text-sm font-bold text-navy-900 dark:text-white mt-1">{reais(dados.precoFornecedor)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-slate-400">Preço venda</p>
            <p className="text-sm font-bold text-navy-900 dark:text-white mt-1">{reais(dados.precoVenda)}</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3">
            <p className="text-xs text-green-700 dark:text-green-400">Lucro</p>
            <p className="text-sm font-bold text-green-700 dark:text-green-400 mt-1">
              {reais(dados.lucro)} · {dados.margemPercentual.toFixed(0)}%
            </p>
          </div>
        </div>

        <div className="mt-5 bg-gray-50 dark:bg-navy-700 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Truck className="w-5 h-5 text-gray-600 dark:text-slate-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-navy-900 dark:text-white">
                {dados.temFornecedor ? 'Envio pelo fornecedor' : 'Fornecedor não vinculado'}
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                {dados.temFornecedor
                  ? `Prazo médio: ${dados.prazo}`
                  : 'Este produto precisa ter supplier_id para gerar pedido corretamente.'}
              </p>
            </div>
          </div>
        </div>

        {dados.alertaDePrejuizo && <div className="mt-5">{dados.alertaDePrejuizo}</div>}

        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          {dados.podeEditar && (
            <button
              onClick={dados.aoEditar}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gold hover:bg-gold-hover text-navy-900 text-sm font-bold transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Editar
            </button>
          )}
          {dados.linkDoAnuncio && (
            <a
              href={dados.linkDoAnuncio}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Ver anúncio
            </a>
          )}
          {dados.podeDivulgar && (
            <button
              onClick={dados.aoDivulgar}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm font-semibold transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Divulgar
            </button>
          )}
          <button
            onClick={dados.aoExcluir}
            disabled={dados.excluindo}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}
