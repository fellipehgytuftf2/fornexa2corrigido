import { useState, type FormEvent } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Crown,
  Link2,
  Plus,
  ShoppingBag,
  Ticket,
  Wallet,
  X,
} from 'lucide-react';
import { INFLUENCIADORES_DE_EXEMPLO, normalizarCupom, type Influenciador } from '../../lib/cupons';

/**
 * Influenciadores: quem tem cupom e quanto cada cupom vendeu.
 *
 * Mora em Afiliados (o dono e o co-produtor abrem). A conta é simples: venda
 * paga de uma conta que entrou com o cupom conta para o dono do cupom.
 *
 * PRÉVIA — branch feat/cupom-influenciador: números e vendas de exemplo.
 */

interface Desempenho {
  cadastros: number;
  vendas: number;
  faturamento: number;
  ultimas: { cliente: string; plano: string; quando: string }[];
}

const DESEMPENHO: Record<string, Desempenho> = {
  BRUNO10: {
    cadastros: 64,
    vendas: 23,
    faturamento: 5121.3,
    ultimas: [
      { cliente: 'Thiago M.', plano: 'Premium', quando: 'hoje, 14:02' },
      { cliente: 'Aline R.', plano: 'Básico', quando: 'hoje, 09:40' },
      { cliente: 'Carlos E.', plano: 'Premium', quando: 'ontem' },
    ],
  },
  LUCASDROP: {
    cadastros: 41,
    vendas: 14,
    faturamento: 3012.65,
    ultimas: [
      { cliente: 'Renata P.', plano: 'Básico', quando: 'ontem' },
      { cliente: 'Diego F.', plano: 'Premium', quando: '09/11' },
    ],
  },
  MARI: {
    cadastros: 37,
    vendas: 9,
    faturamento: 1999,
    ultimas: [{ cliente: 'Patrícia S.', plano: 'Premium', quando: '08/11' }],
  },
  RAFA: { cadastros: 12, vendas: 2, faturamento: 338, ultimas: [] },
};

const reais = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Influenciadores() {
  const [lista, setLista] = useState<Influenciador[]>(INFLUENCIADORES_DE_EXEMPLO);
  const [aberto, setAberto] = useState<string | null>('BRUNO10');
  const [copiado, setCopiado] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const comNumeros = lista
    .map((item) => ({ ...item, ...(DESEMPENHO[item.cupom] ?? { cadastros: 0, vendas: 0, faturamento: 0, ultimas: [] }) }))
    .sort((a, b) => b.vendas - a.vendas);

  const totalVendas = comNumeros.reduce((soma, item) => soma + item.vendas, 0);
  const totalFaturamento = comNumeros.reduce((soma, item) => soma + item.faturamento, 0);
  const maisVendas = Math.max(...comNumeros.map((item) => item.vendas), 1);
  const melhor = comNumeros[0];

  const copiar = async (texto: string, chave: string) => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Na prévia, só mostra o retorno.
    }
    setCopiado(chave);
    window.setTimeout(() => setCopiado(null), 1600);
  };

  const alternarAtivo = (cupom: string) =>
    setLista((atual) => atual.map((item) => (item.cupom === cupom ? { ...item, ativo: !item.ativo } : item)));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-navy-900 dark:text-white">Influenciadores</h1>
            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-gold/20 text-navy-900 dark:text-gold">
              Dados de exemplo
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            Cada influenciador tem um cupom. Toda venda paga com o cupom conta para ele.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-gold text-navy-900 text-sm font-bold hover:bg-gold-hover transition-transform hover:-translate-y-0.5"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Novo influenciador
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { rotulo: 'Vendas com cupom', valor: String(totalVendas), icone: ShoppingBag, cor: 'bg-navy-900 text-gold' },
          { rotulo: 'Faturado com cupom', valor: reais(totalFaturamento), icone: Wallet, cor: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
          { rotulo: 'Cupons ativos', valor: String(lista.filter((item) => item.ativo).length), icone: Ticket, cor: 'bg-gold/20 text-navy-900 dark:text-gold' },
          { rotulo: 'Quem mais vendeu', valor: melhor?.nome.split(' ')[0] ?? '—', icone: Crown, cor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
        ].map((cartao, indice) => {
          const Icone = cartao.icone;
          return (
            <div
              key={cartao.rotulo}
              style={{ animationDelay: `${indice * 70}ms` }}
              className="cartao-entra bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-white/10 p-5 flex items-center gap-4"
            >
              <span className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${cartao.cor}`}>
                <Icone className="w-6 h-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-gray-500 dark:text-slate-400">{cartao.rotulo}</p>
                <p className="font-display text-xl 2xl:text-2xl font-bold text-navy-900 dark:text-white whitespace-nowrap">{cartao.valor}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-navy-900 dark:text-white">Ranking do mês</h2>
          <span className="text-xs text-gray-500 dark:text-slate-400">Clique num influenciador para ver as vendas</span>
        </div>

        <ul>
          {comNumeros.map((item, posicao) => {
            const estaAberto = aberto === item.cupom;
            const conversao = item.cadastros ? Math.round((item.vendas / item.cadastros) * 100) : 0;
            const link = `fornexa.site/?cupom=${item.cupom}`;

            return (
              <li key={item.cupom} className={`border-b last:border-b-0 border-gray-100 dark:border-white/10 ${item.ativo ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap lg:flex-nowrap items-center gap-4 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setAberto(estaAberto ? null : item.cupom)}
                    aria-expanded={estaAberto}
                    className="flex items-center gap-3 flex-1 min-w-[220px] text-left"
                  >
                    <span className="w-6 text-center font-display font-bold text-gray-400">{posicao + 1}º</span>
                    <span className={`w-11 h-11 rounded-full flex items-center justify-center font-bold shrink-0 ${posicao === 0 ? 'bg-gold text-navy-900' : 'bg-navy-900 text-gold'}`}>
                      {item.nome[0]}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-navy-900 dark:text-white">{item.nome}</span>
                      <span className="block text-xs text-gray-500 dark:text-slate-400">{item.perfil}</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${estaAberto ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => copiar(item.cupom, `cupom-${item.cupom}`)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-dashed border-gold bg-gold/10 font-mono text-sm font-bold tracking-wider text-navy-900 dark:text-gold"
                    aria-label={`Copiar cupom ${item.cupom}`}
                  >
                    {copiado === `cupom-${item.cupom}` ? <Check className="w-3.5 h-3.5" /> : <Ticket className="w-3.5 h-3.5" />}
                    {item.cupom}
                  </button>

                  <span className="text-xs text-gray-500 dark:text-slate-400 w-24">
                    {item.desconto ? `${item.desconto}% de desconto` : 'Só rastreio'}
                  </span>

                  <div className="w-44">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-bold text-navy-900 dark:text-white">{item.vendas} vendas</span>
                      <span className="text-gray-500 dark:text-slate-400">{conversao}% dos cadastros</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                      <div
                        className="barra-enche h-full rounded-full bg-gold"
                        style={{ width: `${(item.vendas / maisVendas) * 100}%`, animationDelay: `${posicao * 90}ms` }}
                      />
                    </div>
                  </div>

                  <span className="w-28 text-right font-display font-bold text-green-700 dark:text-green-400">{reais(item.faturamento)}</span>

                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-slate-300 cursor-pointer min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={item.ativo}
                      onChange={() => alternarAtivo(item.cupom)}
                      className="w-5 h-5 accent-[#FFD300]"
                    />
                    Ativo
                  </label>
                </div>

                {estaAberto && (
                  <div className="acesso-aviso px-5 pb-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="rounded-xl bg-gray-50 dark:bg-navy-900 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">Últimas vendas</p>
                      {item.ultimas.length ? (
                        <ul className="mt-2 divide-y divide-gray-200 dark:divide-white/10">
                          {item.ultimas.map((venda) => (
                            <li key={venda.cliente} className="py-2 flex justify-between text-sm">
                              <span className="text-navy-900 dark:text-white">{venda.cliente} · Plano {venda.plano}</span>
                              <span className="text-gray-500 dark:text-slate-400">{venda.quando}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">Nenhuma venda este mês.</p>
                      )}
                    </div>
                    <div className="rounded-xl bg-navy-950 text-white p-4 flex flex-col gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Link com o cupom já aplicado</p>
                      <p className="font-mono text-gold break-all">{link}</p>
                      <button
                        type="button"
                        onClick={() => copiar(`https://${link}`, `link-${item.cupom}`)}
                        className="self-start h-10 px-4 inline-flex items-center gap-2 rounded-lg bg-gold text-navy-900 text-sm font-bold"
                      >
                        {copiado === `link-${item.cupom}` ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                        {copiado === `link-${item.cupom}` ? 'Copiado' : 'Copiar link'}
                      </button>
                      <p className="text-xs text-slate-400">Quem entra por esse link já chega com o cupom, sem digitar nada.</p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {criando && (
        <NovoInfluenciador
          existentes={lista.map((item) => item.cupom)}
          aoFechar={() => setCriando(false)}
          aoCriar={(novo) => {
            setLista((atual) => [...atual, novo]);
            setAberto(novo.cupom);
          }}
        />
      )}
    </div>
  );
}

function NovoInfluenciador({
  existentes,
  aoFechar,
  aoCriar,
}: {
  existentes: string[];
  aoFechar: () => void;
  aoCriar: (novo: Influenciador) => void;
}) {
  const [nome, setNome] = useState('');
  const [perfil, setPerfil] = useState('');
  const [cupom, setCupom] = useState('');
  const [cupomMexido, setCupomMexido] = useState(false);
  const [desconto, setDesconto] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState<Influenciador | null>(null);

  // Sugere o cupom pelo primeiro nome até a pessoa mexer no campo.
  const sugestao = normalizarCupom(nome.split(' ')[0] ?? '');
  const cupomFinal = cupomMexido ? cupom : sugestao;

  const criar = (evento: FormEvent) => {
    evento.preventDefault();
    if (!nome.trim() || !cupomFinal) {
      setErro('Preencha o nome e o cupom.');
      return;
    }
    if (existentes.includes(cupomFinal)) {
      setErro(`O cupom ${cupomFinal} já é de outra pessoa.`);
      return;
    }
    const novo: Influenciador = {
      cupom: cupomFinal,
      nome: nome.trim(),
      perfil: perfil.trim() ? `@${perfil.trim().replace(/^@/, '')}` : '',
      desconto,
      ativo: true,
    };
    aoCriar(novo);
    setPronto(novo);
  };

  const campo =
    'w-full h-12 px-4 rounded-xl bg-gray-50 dark:bg-navy-900 border border-gray-200 dark:border-white/15 text-[15px] text-navy-900 dark:text-white focus:outline-none focus:border-navy-900 dark:focus:border-gold';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-navy-950/60 dark:bg-black/75">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="novo-influenciador-titulo"
        className="cartao-entra w-full max-w-lg bg-white dark:bg-navy-850 dark:border dark:border-white/10 rounded-3xl shadow-2xl p-6 flex flex-col gap-4"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="novo-influenciador-titulo" className="font-display text-xl font-semibold text-navy-900 dark:text-white">
            {pronto ? 'Influenciador cadastrado' : 'Novo influenciador'}
          </h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {pronto ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600 dark:text-slate-300">Mande para {pronto.nome.split(' ')[0]} o cupom e o link:</p>
            <div className="acesso-aviso rounded-2xl bg-navy-950 text-white p-4">
              <p className="text-xs uppercase tracking-wider text-slate-400">Cupom</p>
              <p className="font-mono text-2xl font-bold text-gold tracking-wider">{pronto.cupom}</p>
              <p className="text-xs uppercase tracking-wider text-slate-400 mt-3">Link com o cupom</p>
              <p className="font-mono text-gold break-all">fornexa.site/?cupom={pronto.cupom}</p>
            </div>
            <button type="button" onClick={aoFechar} className="h-12 rounded-full bg-navy-900 text-white dark:bg-white dark:text-navy-900 font-semibold">
              Pronto
            </button>
          </div>
        ) : (
          <form onSubmit={criar} className="flex flex-col gap-4">
            <div>
              <label htmlFor="inf-nome" className="block text-sm font-semibold text-navy-900 dark:text-white mb-2">Nome</label>
              <input id="inf-nome" value={nome} onChange={(e) => { setNome(e.target.value); setErro(''); }} className={campo} autoFocus />
            </div>
            <div>
              <label htmlFor="inf-perfil" className="block text-sm font-semibold text-navy-900 dark:text-white mb-2">Perfil (opcional)</label>
              <input id="inf-perfil" value={perfil} onChange={(e) => setPerfil(e.target.value)} placeholder="@perfil" className={campo} />
            </div>
            <div>
              <label htmlFor="inf-cupom" className="block text-sm font-semibold text-navy-900 dark:text-white mb-2">Cupom</label>
              <input
                id="inf-cupom"
                value={cupomFinal}
                onChange={(e) => { setCupom(normalizarCupom(e.target.value)); setCupomMexido(true); setErro(''); }}
                placeholder="Ex.: BRUNO10"
                className={`${campo} font-mono tracking-wider uppercase`}
              />
            </div>
            <fieldset>
              <legend className="block text-sm font-semibold text-navy-900 dark:text-white mb-2">O cupom dá desconto?</legend>
              <div className="flex flex-wrap gap-2">
                {[null, 5, 10, 15].map((valor) => (
                  <button
                    key={String(valor)}
                    type="button"
                    aria-pressed={desconto === valor}
                    onClick={() => setDesconto(valor)}
                    className={`min-h-[40px] px-4 rounded-full text-sm font-semibold border ${
                      desconto === valor
                        ? 'bg-navy-900 text-white border-navy-900 dark:bg-gold dark:text-navy-900 dark:border-gold'
                        : 'border-gray-200 text-navy-900 dark:border-white/15 dark:text-white'
                    }`}
                  >
                    {valor ? `${valor}%` : 'Não, só rastrear'}
                  </button>
                ))}
              </div>
            </fieldset>
            {erro && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
            <button type="submit" className="mt-1 h-12 inline-flex items-center justify-center gap-2 rounded-full bg-gold text-navy-900 font-bold hover:bg-gold-hover">
              <Copy className="w-4 h-4" aria-hidden="true" />
              Criar cupom
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
