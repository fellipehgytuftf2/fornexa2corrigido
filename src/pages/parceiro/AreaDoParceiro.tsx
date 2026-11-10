import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  Copy,
  ExternalLink,
  LogOut,
  MessageCircle,
  Sparkles,
  TrendingUp,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { PLANOS } from '../../lib/planos';
import { FaixaDePrevia, PARCEIRO_DE_EXEMPLO } from './previa';

/**
 * A área do parceiro: fornexa.site/parceiro.
 *
 * Só o que o parceiro precisa: o link dele, quanto o link trouxe, quem
 * chegou por ele e texto pronto para divulgar. Nada de catálogo, anúncios ou
 * pedidos — parceiro não vende produto, vende o FORNEXA.
 *
 * PRÉVIA: os números e os nomes são de exemplo.
 */

const CLIENTES = [
  { nome: 'Mariana S.', plano: 'Premium', quando: 'hoje', pagou: true },
  { nome: 'Ricardo A.', plano: 'Básico', quando: 'ontem', pagou: true },
  { nome: 'Fernanda L.', plano: 'Básico', quando: '08/11', pagou: false },
  { nome: 'Paulo H.', plano: 'Premium', quando: '06/11', pagou: true },
  { nome: 'Juliana C.', plano: 'Básico', quando: '03/11', pagou: true },
];

const TEXTOS = [
  'Quer vender no Mercado Livre sem comprar estoque? Eu uso o FORNEXA: você escolhe o produto, publica e o fornecedor envia por você.',
  'Comecei a vender sem estoque e sem sair de casa. O FORNEXA liga você a fornecedores de verdade e o pedido sai sozinho.',
  'Se você sempre quis ter uma loja no Mercado Livre mas não tinha dinheiro para estoque, olha isso aqui:',
];

const reais = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function AreaDoParceiro() {
  const link = `fornexa.site/${PARCEIRO_DE_EXEMPLO.apelido}`;
  const [copiado, setCopiado] = useState<string | null>(null);
  const [mostrarBarras, setMostrarBarras] = useState(false);

  useEffect(() => {
    const quadro = window.requestAnimationFrame(() => setMostrarBarras(true));
    return () => window.cancelAnimationFrame(quadro);
  }, []);

  useEffect(() => {
    if (!copiado) return;
    const temporizador = window.setTimeout(() => setCopiado(null), 1800);
    return () => window.clearTimeout(temporizador);
  }, [copiado]);

  const copiar = async (texto: string, chave: string) => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Na prévia, só mostra o retorno.
    }
    setCopiado(chave);
  };

  const pagantes = CLIENTES.filter((cliente) => cliente.pagou);
  const faturamento = pagantes.reduce(
    (soma, cliente) => soma + (cliente.plano === 'Premium' ? 297 : 169),
    0
  );
  const vendasPorDia = [1, 0, 2, 1, 0, 3, 1, 2, 0, 1];
  const maior = Math.max(...vendasPorDia);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-navy-900 text-navy-900 dark:text-white pb-24">
      <header className="bg-navy-950 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="font-display text-lg font-bold tracking-[0.08em]">FORNEXA</span>
            <span className="px-2 py-0.5 rounded-md bg-gold text-navy-900 text-[11px] font-bold uppercase tracking-wider">
              Parceiro
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-slate-300">{PARCEIRO_DE_EXEMPLO.nome}</span>
            <Link
              to="/parceiro/entrar"
              aria-label="Sair"
              className="w-10 h-10 rounded-xl border border-white/15 flex items-center justify-center text-slate-300 hover:bg-white/10"
            >
              <LogOut className="w-[18px] h-[18px]" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-8 pt-4">
          <p className="text-sm text-slate-400">Olá, {PARCEIRO_DE_EXEMPLO.nome.split(' ')[0]}</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-1">
            Seu link já está no ar
          </h1>

          <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl bg-white/5 border border-white/10 p-3 sm:p-4">
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-green-400 shrink-0 animate-pulse" aria-hidden="true" />
              <span className="font-mono text-lg sm:text-xl text-gold truncate">{link}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => copiar(`https://${link}`, 'link')}
                className="flex-1 sm:flex-none h-11 px-5 inline-flex items-center justify-center gap-2 rounded-xl bg-gold text-navy-900 text-sm font-bold hover:bg-gold-hover"
              >
                {copiado === 'link' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiado === 'link' ? 'Copiado' : 'Copiar link'}
              </button>
              <a
                href={`https://${link}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir minha página"
                className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-white/15 text-white hover:bg-white/10"
              >
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 -mt-2 pt-6 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Este mês</h2>
          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-gold/20 text-navy-900 dark:text-gold">
            Dados de exemplo
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { rotulo: 'Cadastros pelo seu link', valor: String(CLIENTES.length), icone: UserPlus, cor: 'bg-navy-900 text-gold' },
            { rotulo: 'Assinaturas pagas', valor: String(pagantes.length), icone: TrendingUp, cor: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
            { rotulo: 'Vendido pelo seu link', valor: reais(faturamento), icone: Wallet, cor: 'bg-gold/20 text-navy-900 dark:text-gold' },
          ].map((cartao, indice) => {
            const Icone = cartao.icone;
            return (
              <div
                key={cartao.rotulo}
                style={{ animationDelay: `${indice * 80}ms` }}
                className="cartao-entra bg-white dark:bg-navy-850 rounded-2xl border border-gray-200 dark:border-white/10 p-5 flex items-center gap-4"
              >
                <span className={`w-12 h-12 rounded-xl flex items-center justify-center ${cartao.cor}`}>
                  <Icone className="w-6 h-6" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">{cartao.rotulo}</p>
                  <p className="font-display text-2xl font-bold tracking-tight">{cartao.valor}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-6">
          <section className="bg-white dark:bg-navy-850 rounded-2xl border border-gray-200 dark:border-white/10 p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold">Quem entrou pelo seu link</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Só o primeiro nome: os dados de cada cliente são dele.</p>

            <div className="mt-5 h-28 flex items-end gap-2" role="img" aria-label="Assinaturas por dia nos últimos 10 dias">
              {vendasPorDia.map((vendas, indice) => (
                <div key={indice} className="flex-1 h-full flex items-end">
                  <div
                    className="w-full rounded-t-md bg-gold transition-[height] duration-700 ease-out"
                    style={{
                      height: mostrarBarras ? `${Math.max((vendas / maior) * 100, 4)}%` : '0%',
                      transitionDelay: `${indice * 50}ms`,
                      opacity: vendas ? 1 : 0.3,
                    }}
                  />
                </div>
              ))}
            </div>

            <ul className="mt-5 divide-y divide-gray-100 dark:divide-white/10">
              {CLIENTES.map((cliente) => (
                <li key={cliente.nome} className="py-3 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-navy-900 text-gold flex items-center justify-center text-sm font-bold shrink-0">
                    {cliente.nome[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{cliente.nome}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">Plano {cliente.plano} · {cliente.quando}</p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      cliente.pagou
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-slate-300'
                    }`}
                  >
                    {cliente.pagou ? 'Pagou' : 'Só cadastrou'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-col gap-6">
            <section className="bg-white dark:bg-navy-850 rounded-2xl border border-gray-200 dark:border-white/10 p-5 sm:p-6">
              <h2 className="font-display text-lg font-semibold">Textos prontos para divulgar</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">O seu link vai junto quando você copia.</p>
              <div className="mt-4 flex flex-col gap-3">
                {TEXTOS.map((texto, indice) => (
                  <div key={indice} className="rounded-xl bg-gray-50 dark:bg-navy-950 border border-gray-200 dark:border-white/10 p-4">
                    <p className="text-sm leading-relaxed">{texto}</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => copiar(`${texto}\nhttps://${link}`, `texto-${indice}`)}
                        className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-navy-900 text-white dark:bg-white dark:text-navy-900 text-xs font-semibold"
                      >
                        {copiado === `texto-${indice}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiado === `texto-${indice}` ? 'Copiado' : 'Copiar'}
                      </button>
                      <a
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${texto}\nhttps://${link}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/15 text-xs font-semibold"
                      >
                        <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        WhatsApp
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-navy-950 text-white rounded-2xl p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-gold" aria-hidden="true" />
                <h2 className="font-display text-lg font-semibold">O que a sua página vende</h2>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {PLANOS.map((plano) => (
                  <div key={plano.id} className="rounded-xl bg-white/5 border border-white/10 p-4">
                    <p className="text-xs text-slate-400">{plano.nome}</p>
                    <p className="font-display text-xl font-bold text-gold mt-1">{plano.preco}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>

      <FaixaDePrevia />
    </div>
  );
}
