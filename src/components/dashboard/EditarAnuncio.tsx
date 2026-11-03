import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Lock,
  Package,
  Power,
  ShoppingBag,
  Star,
  Tag,
  TrendingUp,
  Truck,
  Type,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { calcularVenda, precoParaLucroDesejado } from '../../lib/taxasDoMercadoLivre';
import { useTravaScrollDeFundo } from '../../lib/useTravaScrollDeFundo';

/**
 * Editar um anúncio que já está no ar no Mercado Livre.
 *
 * O QUE O MERCADO LIVRE DEIXA MUDAR
 *
 * Preço, fotos, descrição e pausar/reativar: sempre. O título só enquanto o
 * anúncio não tem venda nenhuma — depois da primeira, o Mercado Livre trava
 * título, condição e modo de compra. Por isso a tela lê o anúncio de lá antes
 * de abrir os campos: a contagem de vendas que manda é a deles.
 *
 * O QUE FICA DE FORA
 *
 * Estoque: quem tem a mercadoria é o fornecedor, e o FORNEXA já pausa sozinho
 * quando ela acaba. Categoria: o Mercado Livre limita a troca depois de
 * publicar.
 *
 * O preço mostra o lucro enquanto se digita, com a mesma conta medida que a
 * publicação usa (comissão e frete por faixa). Preço que dá prejuízo não é
 * proibido — pode ser promoção de propósito —, mas é dito em vermelho.
 */

export interface AnuncioParaEditar {
  id: string;
  name: string;
  image_url: string;
  supplier_price: number;
  sale_price: number;
  ml_item_id: string | null;
  permalink?: string | null;
}

/** O anúncio como o Mercado Livre respondeu. */
interface AnuncioNoMl {
  titulo: string;
  preco: number;
  descricao: string;
  status: 'active' | 'paused' | string;
  vendas: number;
  /** Visitas nos últimos 30 dias. Nulo quando o Mercado Livre não respondeu. */
  visitas?: number | null;
  fotos: string[];
}

export interface AnuncioSalvo {
  preco: number;
  titulo: string;
  descricao: string;
  status: 'active' | 'paused';
}

interface Props {
  anuncio: AnuncioParaEditar;
  aoFechar: () => void;
  aoSalvar: (salvo: AnuncioSalvo) => void;
}

const LIMITE_TITULO = 60;
const LIMITE_FOTOS = 10;
const FOTOS_RECOMENDADAS = 4;
const LUCROS_RAPIDOS = [15, 25, 40];

const reais = (valor: number) =>
  `${valor < 0 ? '− ' : ''}R$ ${Math.abs(valor)
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

const lerPreco = (texto: string) => {
  const numero = parseFloat(texto.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(numero) ? numero : 0;
};

const precoParaTexto = (valor: number) => valor.toFixed(2).replace('.', ',');

type Secao = 'preco' | 'texto' | 'fotos' | 'disponibilidade';

const SECOES: { id: Secao; rotulo: string; icone: typeof Tag }[] = [
  { id: 'preco', rotulo: 'Preço', icone: Tag },
  { id: 'texto', rotulo: 'Título e descrição', icone: Type },
  { id: 'fotos', rotulo: 'Fotos', icone: ImageIcon },
  { id: 'disponibilidade', rotulo: 'Disponibilidade', icone: Power },
];

/**
 * Um bloco do formulário. Fica fora do componente principal de propósito:
 * declarado dentro dele, seria um componente novo a cada tecla, e o campo
 * perderia o foco enquanto se digita.
 */
function Cartao({
  secao,
  numero,
  titulo,
  descricao,
  registrar,
  children,
}: {
  secao: Secao;
  numero: number;
  titulo: string;
  descricao: string;
  registrar: (secao: Secao, elemento: HTMLElement | null) => void;
  children: ReactNode;
}) {
  return (
    <section
      ref={(elemento) => registrar(secao, elemento)}
      data-secao={secao}
      className="scroll-mt-20 rounded-2xl border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-800 shadow-sm"
    >
      <header className="flex items-start gap-3 px-5 pt-5">
        <span className="w-8 h-8 shrink-0 rounded-xl bg-gold/25 text-navy-900 dark:text-gold flex items-center justify-center text-sm font-bold tabular-nums">
          {numero}
        </span>
        <div>
          <h3 className="text-navy-900 dark:text-white font-bold">{titulo}</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{descricao}</p>
        </div>
      </header>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

export default function EditarAnuncio({ anuncio, aoFechar, aoSalvar }: Props) {
  useTravaScrollDeFundo(true);

  const [carregando, setCarregando] = useState(true);
  const [erroAoLer, setErroAoLer] = useState('');
  const [original, setOriginal] = useState<AnuncioNoMl | null>(null);

  const [precoTexto, setPrecoTexto] = useState('');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [fotos, setFotos] = useState<string[]>([]);

  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState('');
  const [erroAoSalvar, setErroAoSalvar] = useState('');
  const [secaoAtiva, setSecaoAtiva] = useState<Secao>('preco');

  const areaDeRolagem = useRef<HTMLDivElement>(null);
  const campoPreco = useRef<HTMLInputElement>(null);
  const seletorDeFoto = useRef<HTMLInputElement>(null);
  const secoes = useRef<Record<Secao, HTMLElement | null>>({
    preco: null,
    texto: null,
    fotos: null,
    disponibilidade: null,
  });

  useEffect(() => {
    let cancelado = false;

    const ler = async () => {
      setCarregando(true);
      setErroAoLer('');

      const { data, error } = await supabase.functions.invoke('ml-editar-anuncio', {
        body: { acao: 'ler', user_product_id: anuncio.id },
      });

      if (cancelado) return;

      if (error || !data?.anuncio) {
        setErroAoLer(
          data?.error ||
            'Não foi possível ler o anúncio no Mercado Livre. Confira se a conta está conectada em Integrações.'
        );
        setCarregando(false);
        return;
      }

      const lido = data.anuncio as AnuncioNoMl;

      setOriginal(lido);
      setPrecoTexto(precoParaTexto(lido.preco));
      setTitulo(lido.titulo);
      setDescricao(lido.descricao);
      setAtivo(lido.status === 'active');
      setFotos(lido.fotos);
      setCarregando(false);
    };

    ler();

    return () => {
      cancelado = true;
    };
  }, [anuncio.id]);

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && !salvando) aoFechar();
    };

    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar, salvando]);

  // A aba de cima acende conforme a seção que está na tela.
  useEffect(() => {
    const raiz = areaDeRolagem.current;
    if (!raiz || carregando) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas
          .filter((entrada) => entrada.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

        if (visivel) setSecaoAtiva(visivel.target.getAttribute('data-secao') as Secao);
      },
      { root: raiz, rootMargin: '0px 0px -65% 0px' }
    );

    Object.values(secoes.current).forEach((elemento) => elemento && observador.observe(elemento));
    return () => observador.disconnect();
  }, [carregando]);

  const custo = Number(anuncio.supplier_price) || 0;
  const preco = lerPreco(precoTexto);
  const conta = useMemo(() => calcularVenda(preco, custo), [preco, custo]);
  const contaAntes = useMemo(
    () => (original ? calcularVenda(original.preco, custo) : null),
    [original, custo]
  );

  const tituloTravado = (original?.vendas ?? 0) > 0;

  const mudancas = useMemo(() => {
    if (!original) return [] as { campo: string; de: string; para: string }[];

    const lista: { campo: string; de: string; para: string }[] = [];

    if (Math.abs(preco - original.preco) > 0.001) {
      lista.push({ campo: 'Preço', de: reais(original.preco), para: reais(preco) });
    }
    if (!tituloTravado && titulo.trim() !== original.titulo) {
      lista.push({ campo: 'Título', de: 'anterior', para: 'novo título' });
    }
    if (descricao !== original.descricao) {
      lista.push({ campo: 'Descrição', de: 'anterior', para: 'nova descrição' });
    }
    if (fotos.join('|') !== original.fotos.join('|')) {
      lista.push({
        campo: 'Fotos',
        de: `${original.fotos.length} ${original.fotos.length === 1 ? 'foto' : 'fotos'}`,
        para: `${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}`,
      });
    }
    if (ativo !== (original.status === 'active')) {
      lista.push({ campo: 'Status', de: ativo ? 'Pausado' : 'Ativo', para: ativo ? 'Ativo' : 'Pausado' });
    }

    return lista;
  }, [original, preco, titulo, descricao, fotos, ativo, tituloTravado]);

  const podeSalvar =
    mudancas.length > 0 && preco > 0 && titulo.trim().length > 0 && fotos.length > 0 && !salvando && !enviandoFoto;

  /** Dicas do título: o que o comprador vê na busca. */
  const dicasDoTitulo = [
    {
      ok: titulo.trim().length >= 40,
      texto: 'Usa pelo menos 40 caracteres, para caber o que o comprador procura',
    },
    {
      ok: titulo.trim().length > 0 && titulo !== titulo.toUpperCase(),
      texto: 'Não está todo em maiúsculas',
    },
    { ok: !/[!*#$%@]/.test(titulo), texto: 'Sem símbolos como ! * # %' },
  ];

  const registrar = (secao: Secao, elemento: HTMLElement | null) => {
    secoes.current[secao] = elemento;
  };

  const irPara = (secao: Secao) => {
    setSecaoAtiva(secao);
    secoes.current[secao]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const tornarCapa = (indice: number) => {
    setFotos((atual) => [atual[indice], ...atual.filter((_, i) => i !== indice)]);
  };

  const removerFoto = (indice: number) => {
    setFotos((atual) => atual.filter((_, i) => i !== indice));
  };

  /**
   * Foto nova sobe para o armazenamento do FORNEXA, e o Mercado Livre a baixa
   * pelo endereço público na hora de salvar. Mesmo caminho da publicação.
   */
  const adicionarFotos = async (arquivos: FileList | null) => {
    if (!arquivos?.length) return;

    setEnviandoFoto(true);
    setErroFoto('');

    const aceitos = Array.from(arquivos).slice(0, LIMITE_FOTOS - fotos.length);
    const novas: string[] = [];

    for (const arquivo of aceitos) {
      const extensao = arquivo.name.split('.').pop() || 'jpg';
      const nome = `anuncio/${crypto.randomUUID()}.${extensao}`;

      const { error } = await supabase.storage
        .from('product-images')
        .upload(nome, arquivo, { cacheControl: '3600', upsert: false });

      if (error) {
        setErroFoto(
          /row-level security|violates|permission/i.test(error.message)
            ? 'Sua conta ainda não tem permissão para enviar fotos. Avise o suporte do FORNEXA.'
            : `Não foi possível enviar a foto: ${error.message}`
        );
        break;
      }

      novas.push(supabase.storage.from('product-images').getPublicUrl(nome).data.publicUrl);
    }

    setFotos((atual) => [...atual, ...novas].slice(0, LIMITE_FOTOS));
    setEnviandoFoto(false);
  };

  const salvar = async () => {
    if (!original || !podeSalvar) return;

    setSalvando(true);
    setErroAoSalvar('');

    // Só vai o que mudou: mandar o título de volta num anúncio com venda faz o
    // Mercado Livre recusar a alteração inteira, mesmo sendo o mesmo texto.
    const enviar: Record<string, unknown> = {};

    if (Math.abs(preco - original.preco) > 0.001) {
      enviar.preco = preco;
      // O lucro no preço novo, com a mesma conta da tela, para a lista de
      // Meus Anúncios não continuar mostrando o do preço antigo.
      enviar.margem = Math.round(conta.lucro * 100) / 100;
    }
    if (!tituloTravado && titulo.trim() !== original.titulo) enviar.titulo = titulo.trim();
    if (descricao !== original.descricao) enviar.descricao = descricao;
    if (ativo !== (original.status === 'active')) enviar.status = ativo ? 'active' : 'paused';
    if (fotos.join('|') !== original.fotos.join('|')) enviar.fotos = fotos;

    const { data, error } = await supabase.functions.invoke('ml-editar-anuncio', {
      body: { acao: 'salvar', user_product_id: anuncio.id, mudancas: enviar },
    });

    setSalvando(false);

    if (error || !data?.ok) {
      setErroAoSalvar(
        data?.error || 'O Mercado Livre não aceitou a alteração. Tente de novo em instantes.'
      );
      return;
    }

    aoSalvar({
      preco,
      titulo: tituloTravado ? original.titulo : titulo.trim(),
      descricao,
      status: ativo ? 'active' : 'paused',
    });
  };

  const percentualSobreCusto = (lucro: number) =>
    custo > 0 ? `${lucro < 0 ? '−' : ''}${Math.abs((lucro / custo) * 100).toFixed(0)}%` : '';

  // Como o preço se divide: custo, comissão, frete e o que sobra.
  const partes = (() => {
    const total = Math.max(conta.precoDeVenda, conta.custoDoFornecedor + conta.comissao + conta.frete, 0.01);
    return [
      { rotulo: 'Fornecedor', valor: conta.custoDoFornecedor, cor: 'bg-navy-900 dark:bg-slate-200' },
      { rotulo: 'Comissão ML', valor: conta.comissao, cor: 'bg-slate-400' },
      { rotulo: 'Frete', valor: conta.frete, cor: 'bg-slate-300 dark:bg-slate-500' },
      { rotulo: 'Seu lucro', valor: Math.max(conta.lucro, 0), cor: 'bg-green-500' },
    ].map((parte) => ({ ...parte, largura: (parte.valor / total) * 100 }));
  })();

  const enderecoNoMl =
    anuncio.permalink ||
    (anuncio.ml_item_id ? `https://produto.mercadolivre.com.br/${anuncio.ml_item_id.replace(/^MLB/, 'MLB-')}-_JM` : null);

  return createPortal(
    <div className="fixed inset-0 z-[200] flex lg:items-center lg:justify-center lg:p-6" role="dialog" aria-modal="true" aria-labelledby="editar-anuncio-titulo">
      <button
        type="button"
        aria-label="Fechar"
        onClick={() => !salvando && aoFechar()}
        className="absolute inset-0 bg-navy-900/60 editar-anuncio-fundo"
      />

      <div className="relative w-full lg:max-w-6xl h-full lg:h-[92vh] bg-gray-50 dark:bg-navy-900 lg:rounded-3xl shadow-2xl flex flex-col overflow-hidden editar-anuncio-painel">
        {/* Cabeçalho escuro, com o anúncio e seus números */}
        <header className="bg-navy-900 text-white px-5 sm:px-7 pt-5 pb-5 border-b border-white/10">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-2xl bg-white overflow-hidden ring-1 ring-white/10">
              {(fotos[0] || anuncio.image_url) && (
                <img src={fotos[0] || anuncio.image_url} alt="" className="w-full h-full object-cover" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">Editar anúncio</p>
              <h2 id="editar-anuncio-titulo" className="font-bold text-base sm:text-lg leading-snug mt-1 line-clamp-2">
                {original?.titulo || anuncio.name}
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 text-xs text-slate-400">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold ${
                    ativo ? 'bg-green-500/15 text-green-300' : 'bg-amber-400/15 text-amber-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${ativo ? 'bg-green-400' : 'bg-amber-300'}`} />
                  {ativo ? 'Ativo' : 'Pausado'}
                </span>
                <span className="tabular-nums">{anuncio.ml_item_id}</span>
                {enderecoNoMl && (
                  <a
                    href={enderecoNoMl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-slate-300 hover:text-white underline-offset-2 hover:underline"
                  >
                    Ver no Mercado Livre
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={aoFechar}
              disabled={salvando}
              aria-label="Fechar"
              className="w-10 h-10 shrink-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5 mt-4 sm:mt-5">
            {[
              { rotulo: 'Vendas', valor: original ? String(original.vendas) : '—', icone: ShoppingBag },
              {
                rotulo: 'Visitas (30 dias)',
                valor: original?.visitas != null ? original.visitas.toLocaleString('pt-BR') : '—',
                icone: Eye,
              },
              { rotulo: 'Preço no ar', valor: original ? reais(original.preco) : '—', icone: Tag },
              {
                rotulo: 'Lucro por venda hoje',
                valor: contaAntes ? reais(contaAntes.lucro) : '—',
                icone: TrendingUp,
                ruim: (contaAntes?.lucro ?? 0) < 0,
              },
            ].map(({ rotulo, valor, icone: Icone, ruim }) => (
              <div key={rotulo} className="rounded-2xl bg-white/[0.06] border border-white/10 px-3.5 py-2.5 sm:px-4 sm:py-3">
                <dt className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Icone className="w-3.5 h-3.5" />
                  {rotulo}
                </dt>
                <dd className={`mt-0.5 sm:mt-1 text-base sm:text-lg font-bold tabular-nums ${ruim ? 'text-red-300' : 'text-white'}`}>
                  {valor}
                </dd>
              </div>
            ))}
          </dl>
        </header>

        {carregando ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-slate-400 text-sm">
            <Loader2 className="w-8 h-8 animate-spin" />
            Lendo o anúncio no Mercado Livre...
          </div>
        ) : erroAoLer ? (
          <div className="flex-1 p-6">
            <div className="max-w-xl mx-auto rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 flex gap-3 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {erroAoLer}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* Formulário */}
            <div ref={areaDeRolagem} className="min-h-0 overflow-y-auto">
              <nav className="sticky top-0 z-10 bg-gray-50/95 dark:bg-navy-900/95 backdrop-blur px-5 sm:px-7 py-3 border-b border-gray-200 dark:border-navy-700 flex gap-2 overflow-x-auto">
                {SECOES.map(({ id, rotulo, icone: Icone }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => irPara(id)}
                    className={`shrink-0 inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                      secaoAtiva === id
                        ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900'
                        : 'text-gray-600 dark:text-slate-300 hover:bg-gray-200/70 dark:hover:bg-navy-800'
                    }`}
                  >
                    <Icone className="w-4 h-4" />
                    {rotulo}
                  </button>
                ))}
              </nav>

              <div className="px-5 sm:px-7 py-6 space-y-5">
                {/* 1. Preço */}
                <Cartao registrar={registrar} secao="preco" numero={1} titulo="Preço" descricao="O lucro é recalculado enquanto você digita.">
                  <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
                    <div className="space-y-1.5">
                      <label htmlFor="editar-preco" className="text-xs font-semibold text-gray-500 dark:text-slate-400">
                        Preço de venda
                      </label>
                      <div className="flex items-center gap-2 rounded-2xl border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-700 px-4 focus-within:ring-2 focus-within:ring-gold focus-within:border-navy-900">
                        <span className="text-gray-400 font-semibold text-lg">R$</span>
                        <input
                          id="editar-preco"
                          ref={campoPreco}
                          inputMode="decimal"
                          autoComplete="off"
                          value={precoTexto}
                          onChange={(evento) => setPrecoTexto(evento.target.value.replace(/[^\d.,]/g, ''))}
                          className="w-full py-3.5 bg-transparent text-2xl font-bold text-navy-900 dark:text-white tabular-nums outline-none"
                        />
                      </div>
                    </div>

                    <div
                      className={`rounded-2xl px-4 py-2.5 text-right ${
                        conta.lucro < 0
                          ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                          : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                      }`}
                    >
                      <p className="text-[11px] font-semibold">Seu lucro por venda</p>
                      <p className="text-xl font-bold tabular-nums">
                        {reais(conta.lucro)}
                        <span className="text-sm font-semibold ml-1.5">{percentualSobreCusto(conta.lucro)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-slate-400 mr-1">Preço para lucrar:</span>
                    {LUCROS_RAPIDOS.map((lucro) => {
                      const sugerido = precoParaLucroDesejado(custo, lucro);
                      const escolhido = Math.abs(sugerido - preco) < 0.005;
                      return (
                        <button
                          key={lucro}
                          type="button"
                          onClick={() => setPrecoTexto(precoParaTexto(sugerido))}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors ${
                            escolhido
                              ? 'border-gold bg-gold text-navy-900'
                              : 'border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:border-navy-900 dark:hover:border-white'
                          }`}
                        >
                          {reais(lucro)} <span className="font-normal opacity-70">→ {reais(sugerido)}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Para onde vai cada real do preço */}
                  <div className="rounded-2xl border border-gray-200 dark:border-navy-700 p-4">
                    <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 dark:bg-navy-700">
                      {partes.map((parte) => (
                        <div key={parte.rotulo} className={`${parte.cor} transition-all duration-300`} style={{ width: `${parte.largura}%` }} />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                      {partes.map((parte) => (
                        <div key={parte.rotulo} className="min-w-0">
                          <p className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-slate-400">
                            <span className={`w-2 h-2 rounded-full ${parte.cor}`} />
                            {parte.rotulo}
                          </p>
                          <p className="text-sm font-bold text-navy-900 dark:text-white tabular-nums mt-0.5">
                            {parte.rotulo === 'Seu lucro' ? reais(conta.lucro) : reais(parte.valor)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {contaAntes && Math.abs(preco - (original?.preco ?? 0)) > 0.001 && (
                    <p className="flex flex-wrap items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300">
                      Lucro por venda:
                      <span className="tabular-nums">{reais(contaAntes.lucro)}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                      <strong className={`tabular-nums ${conta.lucro < 0 ? 'text-red-600' : 'text-green-700 dark:text-green-400'}`}>
                        {reais(conta.lucro)}
                      </strong>
                    </p>
                  )}

                  {conta.lucro < 0 && preco > 0 && (
                    <p className="flex gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 px-3 py-2.5 text-xs text-red-700 dark:text-red-300 leading-relaxed">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Com esse preço você paga para vender. Se não for uma promoção de propósito, use um dos preços sugeridos acima.
                    </p>
                  )}

                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Comissão e frete são a média medida nas vendas da FORNEXA para essa faixa de preço.
                  </p>
                </Cartao>

                {/* 2. Título e descrição */}
                <Cartao registrar={registrar} secao="texto" numero={2} titulo="Título e descrição" descricao="O que o comprador lê na busca e na página do produto.">
                  <div className="space-y-2">
                    <label htmlFor="editar-titulo" className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400">
                      Título
                      {tituloTravado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-navy-700 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:text-slate-400">
                          <Lock className="w-3 h-3" />
                          Travado
                        </span>
                      )}
                    </label>
                    <input
                      id="editar-titulo"
                      value={titulo}
                      maxLength={LIMITE_TITULO}
                      disabled={tituloTravado}
                      onChange={(evento) => setTitulo(evento.target.value)}
                      className="w-full rounded-2xl border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-700 px-4 py-3 text-sm font-medium text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:bg-navy-900 dark:disabled:text-slate-400"
                    />
                    <div className="h-1 rounded-full bg-gray-100 dark:bg-navy-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${titulo.length >= 40 ? 'bg-green-500' : 'bg-gold'}`}
                        style={{ width: `${(titulo.length / LIMITE_TITULO) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between gap-3 text-xs text-gray-500 dark:text-slate-400">
                      <span>
                        {tituloTravado
                          ? 'O Mercado Livre não deixa mudar o título depois da primeira venda.'
                          : 'Comece pelo que o comprador digita na busca.'}
                      </span>
                      <span className="tabular-nums shrink-0">
                        {titulo.length}/{LIMITE_TITULO}
                      </span>
                    </div>

                    {!tituloTravado && (
                      <ul className="grid gap-1.5 pt-1">
                        {dicasDoTitulo.map((dica) => (
                          <li key={dica.texto} className={`flex items-center gap-2 text-xs ${dica.ok ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-slate-400'}`}>
                            <span
                              className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                                dica.ok ? 'bg-green-500 text-white' : 'border border-gray-300 dark:border-navy-600'
                              }`}
                            >
                              {dica.ok && <Check className="w-3 h-3" strokeWidth={3} />}
                            </span>
                            {dica.texto}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="editar-descricao" className="text-xs font-semibold text-gray-500 dark:text-slate-400">
                      Descrição
                    </label>
                    <textarea
                      id="editar-descricao"
                      value={descricao}
                      onChange={(evento) => setDescricao(evento.target.value)}
                      rows={7}
                      className="w-full rounded-2xl border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-700 px-4 py-3 text-sm leading-relaxed text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold resize-y"
                    />
                    <div className="flex justify-between gap-3 text-xs text-gray-500 dark:text-slate-400">
                      <span>Só texto: o Mercado Livre não aceita links, telefone nem formatação.</span>
                      <span className="tabular-nums shrink-0">{descricao.length} caracteres</span>
                    </div>
                  </div>
                </Cartao>

                {/* 3. Fotos */}
                <Cartao registrar={registrar} secao="fotos" numero={3} titulo="Fotos" descricao="A primeira é a capa: é ela que aparece na busca.">
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                    {fotos.map((foto, indice) => (
                      <div
                        key={foto + indice}
                        className={`group relative aspect-square rounded-2xl overflow-hidden bg-gray-100 dark:bg-navy-700 ${
                          indice === 0 ? 'ring-2 ring-gold ring-offset-2 ring-offset-white dark:ring-offset-navy-800' : 'border border-gray-200 dark:border-navy-600'
                        }`}
                      >
                        <img src={foto} alt="" className="w-full h-full object-cover" />

                        {indice === 0 ? (
                          <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-gold text-navy-900 text-[10px] font-bold px-2 py-0.5">
                            <Star className="w-3 h-3 fill-navy-900" />
                            Capa
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => tornarCapa(indice)}
                            title="Usar como capa"
                            className="absolute bottom-1.5 left-1.5 w-7 h-7 rounded-full bg-white/95 text-navy-900 shadow flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                          >
                            <Star className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {fotos.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removerFoto(indice)}
                            title="Remover foto"
                            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/95 text-navy-900 shadow flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}

                    {fotos.length < LIMITE_FOTOS && (
                      <button
                        type="button"
                        onClick={() => seletorDeFoto.current?.click()}
                        disabled={enviandoFoto}
                        className="aspect-square rounded-2xl border-2 border-dashed border-gray-300 dark:border-navy-600 text-gray-500 dark:text-slate-400 hover:border-navy-900 hover:text-navy-900 dark:hover:border-white dark:hover:text-white flex flex-col items-center justify-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-60"
                      >
                        {enviandoFoto ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImagePlus className="w-6 h-6" />}
                        {enviandoFoto ? 'Enviando...' : 'Adicionar'}
                      </button>
                    )}
                  </div>

                  <input
                    ref={seletorDeFoto}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    hidden
                    onChange={(evento) => {
                      adicionarFotos(evento.target.files);
                      evento.target.value = '';
                    }}
                  />

                  {erroFoto && <p className="text-xs text-red-600 dark:text-red-400">{erroFoto}</p>}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-gray-500 dark:text-slate-400">
                      A estrela troca a capa e o X remove. Até {LIMITE_FOTOS} fotos.
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${
                        fotos.length >= FOTOS_RECOMENDADAS
                          ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                      }`}
                    >
                      {fotos.length >= FOTOS_RECOMENDADAS ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      {fotos.length} de {FOTOS_RECOMENDADAS} fotos recomendadas
                    </span>
                  </div>
                </Cartao>

                {/* 4. Disponibilidade */}
                <Cartao registrar={registrar} secao="disponibilidade" numero={4} titulo="Disponibilidade" descricao="Pausar tira o anúncio do ar sem perder as vendas e a reputação dele.">
                  <div className="grid sm:grid-cols-2 gap-3">
                    {[
                      { valor: true, rotulo: 'Ativo', texto: 'Aparece na busca e pode ser comprado.' },
                      { valor: false, rotulo: 'Pausado', texto: 'Some da busca até você reativar.' },
                    ].map((opcao) => (
                      <button
                        key={opcao.rotulo}
                        type="button"
                        onClick={() => setAtivo(opcao.valor)}
                        aria-pressed={ativo === opcao.valor}
                        className={`text-left rounded-2xl border-2 p-4 transition-colors ${
                          ativo === opcao.valor
                            ? 'border-navy-900 bg-white dark:border-gold dark:bg-navy-800'
                            : 'border-gray-200 dark:border-navy-700 hover:border-gray-300 dark:hover:border-navy-600'
                        }`}
                      >
                        <span className="flex items-center justify-between">
                          <span className="font-bold text-navy-900 dark:text-white">{opcao.rotulo}</span>
                          <span
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              ativo === opcao.valor ? 'border-navy-900 dark:border-gold' : 'border-gray-300 dark:border-navy-600'
                            }`}
                          >
                            {ativo === opcao.valor && <span className="w-2.5 h-2.5 rounded-full bg-navy-900 dark:bg-gold" />}
                          </span>
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-slate-400 mt-1">{opcao.texto}</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl bg-gray-50 dark:bg-navy-900/60 border border-gray-200 dark:border-navy-700 p-4">
                    <Package className="w-5 h-5 text-gray-500 dark:text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-navy-900 dark:text-white">Estoque pelo fornecedor</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        A quantidade segue o estoque do fornecedor. Se acabar, a FORNEXA pausa o anúncio sozinha e reativa quando ele repor.
                      </p>
                    </div>
                  </div>
                </Cartao>
              </div>
            </div>

            {/* Prévia e resumo, fixos ao lado */}
            <aside className="hidden lg:flex flex-col gap-4 min-h-0 overflow-y-auto border-l border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-800 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-slate-400">
                Como aparece no Mercado Livre
              </p>

              <div className={`rounded-2xl border border-gray-200 dark:border-navy-700 overflow-hidden transition-opacity ${ativo ? '' : 'opacity-60'}`}>
                <div className="relative aspect-[4/3] bg-gray-100 dark:bg-navy-700">
                  {fotos[0] && <img src={fotos[0]} alt="" className="w-full h-full object-cover" />}
                  {!ativo && (
                    <span className="absolute top-3 left-3 rounded-full bg-navy-900/85 text-white text-[11px] font-semibold px-2.5 py-1">
                      Pausado
                    </span>
                  )}
                </div>
                <div className="p-4 space-y-2 bg-white dark:bg-navy-800">
                  <p className="text-sm text-navy-900 dark:text-white leading-snug line-clamp-2">
                    {titulo || 'Sem título'}
                  </p>
                  <p className="text-2xl font-normal text-navy-900 dark:text-white tabular-nums">{reais(preco)}</p>
                  {conta.temFreteGratis && (
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400">
                      <Truck className="w-3.5 h-3.5" />
                      Frete grátis
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-gray-50 dark:bg-navy-900/60 border border-gray-200 dark:border-navy-700 p-4">
                <p className="text-sm font-bold text-navy-900 dark:text-white">
                  {mudancas.length === 0
                    ? 'Nenhuma alteração ainda'
                    : mudancas.length === 1
                      ? '1 alteração para salvar'
                      : `${mudancas.length} alterações para salvar`}
                </p>
                {mudancas.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {mudancas.map((mudanca) => (
                      <li key={mudanca.campo} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-gray-600 dark:text-slate-300">{mudanca.campo}</span>
                        <span className="flex items-center gap-1 text-gray-500 dark:text-slate-400 tabular-nums min-w-0">
                          <span className="truncate">{mudanca.de}</span>
                          <ArrowRight className="w-3 h-3 shrink-0" />
                          <span className="font-semibold text-navy-900 dark:text-white truncate">{mudanca.para}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>
        )}

        {/* Rodapé */}
        <footer className="flex items-center gap-3 px-5 sm:px-7 py-4 border-t border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-800">
          <div className="hidden sm:block min-w-0 flex-1">
            {erroAoSalvar ? (
              <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="truncate">{erroAoSalvar}</span>
              </p>
            ) : (
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {mudancas.length === 0
                  ? 'Altere um campo para salvar.'
                  : 'As alterações vão direto para o anúncio no Mercado Livre.'}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={aoFechar}
            disabled={salvando}
            className="flex-1 sm:flex-none inline-flex items-center justify-center px-5 py-3 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={salvar}
            disabled={!podeSalvar}
            className="flex-[1.6] sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gold hover:bg-gold-hover text-navy-900 text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_8px_20px_-10px_rgba(255,211,0,0.9)]"
          >
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>
              {salvando ? 'Salvando...' : 'Salvar'}
              {!salvando && <span className="hidden sm:inline"> no Mercado Livre</span>}
            </span>
          </button>
        </footer>
      </div>

      <style>{`
        .editar-anuncio-painel { animation: editarAnuncioEntra 260ms ease-out; }
        .editar-anuncio-fundo { animation: editarAnuncioFundo 200ms ease-out; }
        @keyframes editarAnuncioEntra { from { opacity: 0; transform: translateY(16px) scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes editarAnuncioFundo { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .editar-anuncio-painel, .editar-anuncio-fundo { animation: none; }
        }
      `}</style>
    </div>,
    document.body
  );
}
