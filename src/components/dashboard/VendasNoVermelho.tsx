import { useEffect, useState } from 'react';
import { Loader2, TrendingDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Linha {
  produto: string;
  vendedor: string | null;
  vendedor_email: string | null;
  vendas: number;
  prejuizo_total: number;
  prejuizo_medio: number;
  preco_medio: number;
  custo_medio: number;
  taxa_media: number;
  frete_medio: number;
  ultima_venda: string;
}

interface Resumo {
  vendas_apuradas: number;
  vendas_no_vermelho: number;
  prejuizo_total: number;
  vendedores_atingidos: number;
}

const dinheiro = (valor: number | null | undefined) =>
  `R$ ${Number(valor ?? 0).toFixed(2).replace('.', ',')}`;

/**
 * O que já está sendo vendido no prejuízo.
 *
 * A conta de publicar foi corrigida em 09/10 e resolve as próximas vendas.
 * Esta lista é para as que já existem: quem segue anunciando com preço
 * escolhido pela conta antiga perde dinheiro a cada venda, e não sabe —
 * o prejuízo só aparece no Financeiro, depois, e só para quem procura.
 *
 * Serve para avisar as pessoas, uma a uma, antes da próxima venda sair igual.
 */
export default function VendasNoVermelho() {
  const [dias, setDias] = useState(90);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const carregar = async () => {
      setCarregando(true);
      setErro('');

      const [lista, total] = await Promise.all([
        supabase.rpc('admin_vendas_no_vermelho', { p_dias: dias }),
        supabase.rpc('admin_resumo_do_vermelho', { p_dias: dias }),
      ]);

      setCarregando(false);

      if (lista.error) {
        setErro(lista.error.message);
        return;
      }

      setLinhas((lista.data ?? []) as Linha[]);
      setResumo(((total.data ?? []) as Resumo[])[0] ?? null);
    };

    carregar();
  }, [dias]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <TrendingDown className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />

          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">
              Vendas no vermelho
            </h2>

            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Produtos que perdem dinheiro a cada venda, com taxa e frete reais do
              Mercado Livre. Só entram vendas com custo já fechado por eles.
            </p>
          </div>
        </div>

        <select
          value={dias}
          onChange={(e) => setDias(Number(e.target.value))}
          className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
        >
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
          <option value={365}>Último ano</option>
        </select>
      </div>

      {resumo && !carregando && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {[
            ['Vendas apuradas', String(resumo.vendas_apuradas)],
            ['No vermelho', String(resumo.vendas_no_vermelho)],
            ['Prejuízo somado', dinheiro(resumo.prejuizo_total)],
            ['Vendedores atingidos', String(resumo.vendedores_atingidos)],
          ].map(([rotulo, valor]) => (
            <div
              key={rotulo}
              className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"
            >
              <p className="text-xs text-slate-500 dark:text-slate-400">{rotulo}</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                {valor}
              </p>
            </div>
          ))}
        </div>
      )}

      {carregando && (
        <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mt-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Somando...
        </p>
      )}

      {erro && <p className="text-sm text-red-600 dark:text-red-400 mt-4">{erro}</p>}

      {!carregando && !erro && linhas.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">
          Nenhuma venda no vermelho no período. É a resposta que se quer ver.
        </p>
      )}

      {!carregando && linhas.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <th className="py-2 pr-3 font-medium">Produto</th>
                <th className="py-2 pr-3 font-medium">Vendedor</th>
                <th className="py-2 pr-3 font-medium text-right">Vendas</th>
                <th className="py-2 pr-3 font-medium text-right">Preço</th>
                <th className="py-2 pr-3 font-medium text-right">Custo</th>
                <th className="py-2 pr-3 font-medium text-right">Taxa</th>
                <th className="py-2 pr-3 font-medium text-right">Frete</th>
                <th className="py-2 font-medium text-right">Prejuízo</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {linhas.map((linha) => (
                <tr key={`${linha.produto}-${linha.vendedor_email}`}>
                  <td className="py-2.5 pr-3 text-slate-900 dark:text-white max-w-[260px] truncate">
                    {linha.produto}
                  </td>

                  <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                    <span className="block truncate max-w-[180px]">
                      {linha.vendedor ?? '—'}
                    </span>
                    <span className="block text-xs text-slate-400 truncate max-w-[180px]">
                      {linha.vendedor_email}
                    </span>
                  </td>

                  <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {linha.vendas}
                  </td>

                  <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {dinheiro(linha.preco_medio)}
                  </td>

                  <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {dinheiro(linha.custo_medio)}
                  </td>

                  <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {dinheiro(linha.taxa_media)}
                  </td>

                  <td className="py-2.5 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {dinheiro(linha.frete_medio)}
                  </td>

                  <td className="py-2.5 text-right tabular-nums font-semibold text-red-600 dark:text-red-400">
                    {dinheiro(linha.prejuizo_total)}
                    <span className="block text-xs font-normal text-slate-400">
                      {dinheiro(linha.prejuizo_medio)} por venda
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
