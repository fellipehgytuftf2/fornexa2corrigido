import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, PackageSearch } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ItemDaVenda {
  anuncio: string | null;
  titulo: string | null;
  quantidade: number | null;
  preco: number | null;
  virou_pedido: boolean;
}

interface PedidoAqui {
  id: string;
  product_name: string | null;
  status: string | null;
  ml_order_status: string | null;
  tracking_code: string | null;
  created_at: string | null;
}

interface VendaComVariosItens {
  venda: string;
  data: string | null;
  status: string | null;
  itens_na_venda: number;
  pedidos_aqui: number;
  faltam: number;
  produtos: (string | null)[];
}

interface Varredura {
  ok?: boolean;
  conclusao?: string;
  vendas_olhadas?: number;
  itens_perdidos?: number;
  vendas?: VendaComVariosItens[];
  error?: string;
}

interface Resultado {
  ok?: boolean;
  venda?: string;
  conclusao?: string;
  status_no_ml?: string | null;
  status_detalhe?: string | null;
  envio_id?: string | number | null;
  itens_do_mercado_livre?: ItemDaVenda[] | null;
  pedidos_aqui?: PedidoAqui[];
  resposta_crua?: string;
  error?: string;
}

/**
 * O que uma venda tem no Mercado Livre, e o que dela existe aqui.
 *
 * "O pedido do vendedor não aparece no painel" tem três causas que se parecem
 * de fora: escondido por filtro, em outro estado, ou nunca criado. Esta tela
 * separa as três sem adivinhação — e serve principalmente para provar o caso
 * do item perdido, que é a venda com dois produtos virando um pedido só.
 */
export default function SondaDeVenda() {
  const [venda, setVenda] = useState('');
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const sondar = async () => {
    if (!venda.trim()) return;

    setRodando(true);
    setResultado(null);

    const { data, error } = await supabase.functions.invoke('admin-sondar-venda', {
      body: { venda: venda.trim() },
    });

    setRodando(false);

    if (error) {
      // Mesmo cuidado da varredura abaixo: o motivo vem no corpo.
      let motivo: string | undefined;

      const contexto = (
        error as { context?: { json?: () => Promise<{ error?: string }> } } | null
      )?.context;

      if (contexto?.json) {
        try {
          motivo = (await contexto.json())?.error;
        } catch {
          // segue com a mensagem genérica
        }
      }

      setResultado({ error: motivo ?? 'Não foi possível consultar agora. Tente de novo.' });
      return;
    }

    setResultado(data as Resultado);
  };

  const itens = resultado?.itens_do_mercado_livre ?? [];
  const faltando = itens.some((item) => !item.virou_pedido);

  /**
   * A varredura: mede o defeito em vez de esperar reclamação.
   *
   * Venda com dois produtos vira um pedido só aqui, e o produto perdido não
   * aparece para ninguém — então ninguém reclama. Antes de mexer em como o
   * pedido nasce, isto responde se o caso acontece toda semana ou quase nunca.
   */
  const [emailDaVarredura, setEmailDaVarredura] = useState('');
  const [varrendo, setVarrendo] = useState(false);
  const [varredura, setVarredura] = useState<Varredura | null>(null);

  const varrer = async () => {
    setVarrendo(true);
    setVarredura(null);

    const { data, error } = await supabase.functions.invoke('admin-varrer-multi-item', {
      body: emailDaVarredura.trim() ? { email: emailDaVarredura.trim() } : {},
    });

    setVarrendo(false);

    if (error) {
      // O motivo real vem no corpo da resposta, não no erro.
      //
      // Em resposta não-2xx o supabase-js não popula `data`, e mostrar
      // "tente de novo" esconde justamente o que resolve: "esta conta não tem
      // conexão com o Mercado Livre", "a conexão expirou". Foi o que apareceu
      // na terceira conta varrida, e custou um "não sei" que era evitável.
      let motivo: string | undefined;

      const contexto = (
        error as { context?: { json?: () => Promise<{ error?: string }> } } | null
      )?.context;

      if (contexto?.json) {
        try {
          motivo = (await contexto.json())?.error;
        } catch {
          // segue com a mensagem genérica
        }
      }

      setVarredura({ error: motivo ?? 'Não foi possível varrer agora. Tente de novo.' });
      return;
    }

    setVarredura(data as Varredura);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-start gap-3">
        <PackageSearch className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />

        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">
            Onde está este pedido
          </h2>

          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Pergunta ao Mercado Livre o que a venda tem e compara com o que existe no
            FORNEXA. Responde quando um vendedor diz que o pedido sumiu.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <input
          value={venda}
          onChange={(e) => setVenda(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sondar();
          }}
          placeholder="Número da venda no Mercado Livre"
          className="flex-1 min-w-[260px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
        />

        <button
          onClick={sondar}
          disabled={rodando}
          className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {rodando && <Loader2 className="w-4 h-4 animate-spin" />}
          {rodando ? 'Consultando…' : 'Consultar'}
        </button>
      </div>

      {resultado && (
        <div className="mt-4 space-y-3">
          {resultado.error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{resultado.error}</p>
          ) : (
            <>
              <div
                className={`flex items-start gap-2 text-sm rounded-lg p-3 ${
                  faltando
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200'
                    : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200'
                }`}
              >
                {faltando ? (
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                )}

                <div>
                  <p>{resultado.conclusao}</p>

                  {resultado.status_no_ml && (
                    <p className="mt-1 text-xs opacity-80">
                      Estado no Mercado Livre: {resultado.status_no_ml}
                      {resultado.status_detalhe ? ` (${resultado.status_detalhe})` : ''}
                      {resultado.envio_id ? ` · envio ${resultado.envio_id}` : ''}
                    </p>
                  )}
                </div>
              </div>

              {itens.length > 0 && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
                  {itens.map((item, indice) => (
                    <div
                      key={`${item.anuncio}-${indice}`}
                      className="flex items-start justify-between gap-3 p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-slate-900 dark:text-white truncate">
                          {item.titulo ?? '—'}
                        </p>

                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          {item.anuncio ?? '—'} · {item.quantidade ?? '?'} un
                        </p>
                      </div>

                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          item.virou_pedido
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {item.virou_pedido ? 'tem pedido' : 'sem pedido aqui'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {(resultado.pedidos_aqui?.length ?? 0) > 0 && (
                <details className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <summary className="cursor-pointer text-slate-600 dark:text-slate-300">
                    {resultado.pedidos_aqui?.length} pedido(s) desta venda no FORNEXA
                  </summary>

                  <pre className="mt-2 overflow-auto max-h-64 text-slate-500 dark:text-slate-400">
                    {JSON.stringify(resultado.pedidos_aqui, null, 2)}
                  </pre>
                </details>
              )}
            </>
          )}
        </div>
      )}

      {/* A varredura fica depois, separada por linha: é outra pergunta — não
          "onde está este pedido", mas "isto acontece quanto". */}
      <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-700">
        <p className="text-sm font-medium text-slate-900 dark:text-white">
          Venda com mais de um produto
        </p>

        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          O FORNEXA cria um pedido por venda, lendo só o primeiro produto. Esta varredura
          olha as 50 vendas mais recentes de um vendedor e diz quantos produtos ficaram
          sem pedido aqui.
        </p>

        <div className="flex flex-wrap gap-2 mt-3">
          <input
            type="email"
            value={emailDaVarredura}
            onChange={(e) => setEmailDaVarredura(e.target.value)}
            placeholder="E-mail do vendedor (vazio = sua conta)"
            className="flex-1 min-w-[260px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
          />

          <button
            onClick={varrer}
            disabled={varrendo}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-900 dark:text-white disabled:opacity-50 flex items-center gap-2"
          >
            {varrendo && <Loader2 className="w-4 h-4 animate-spin" />}
            {varrendo ? 'Varrendo…' : 'Varrer 50 vendas'}
          </button>
        </div>

        {varredura && (
          <div className="mt-3 space-y-3">
            {varredura.error ? (
              <p className="text-sm text-red-600 dark:text-red-400">{varredura.error}</p>
            ) : (
              <>
                <div
                  className={`flex items-start gap-2 text-sm rounded-lg p-3 ${
                    (varredura.itens_perdidos ?? 0) > 0
                      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200'
                      : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200'
                  }`}
                >
                  {(varredura.itens_perdidos ?? 0) > 0 ? (
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  )}

                  <span>{varredura.conclusao}</span>
                </div>

                {(varredura.vendas?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
                    {varredura.vendas?.map((venda) => (
                      <div key={venda.venda} className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-mono text-xs text-slate-600 dark:text-slate-300">
                            {venda.venda}
                            {venda.status ? ` · ${venda.status}` : ''}
                          </p>

                          <span
                            className={`text-xs font-semibold shrink-0 ${
                              venda.faltam > 0
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {venda.itens_na_venda} produtos · {venda.pedidos_aqui} pedido(s)
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {venda.produtos.filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
