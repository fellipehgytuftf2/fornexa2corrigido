import { useEffect, useState } from 'react';
import { AlertCircle, Boxes, Check, Loader2, PackageSearch } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ProdutoDoFornecedor {
  id: string;
  nome: string;
  imagem: string | null;
  preco: number;
  estoque: number;
  ativo: boolean;
  /** O fornecedor marcou que não tem este produto. */
  indisponivel: boolean;
}

/** Abaixo disto o produto ainda vende, mas já merece um aviso na tela. */
const ACABANDO = 5;

/**
 * O fornecedor conta o próprio estoque.
 *
 * O FORNEXA nunca soube quanto o fornecedor tem, e o vendedor só descobria que
 * um produto acabou quando o pedido já estava pago no Mercado Livre — com a
 * punição do marketplace caindo sobre ele. Quem sabe é o fornecedor, então é
 * ele quem conta.
 *
 * O vendedor continua sem ver número nenhum. A única coisa que muda do lado
 * dele é que produto zerado some do catálogo.
 */
export default function EstoqueFornecedor() {
  const [produtos, setProdutos] = useState<ProdutoDoFornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [controlaEstoque, setControlaEstoque] = useState(false);
  const [salvandoControle, setSalvandoControle] = useState(false);

  /** Id do produto sendo gravado, e o que acabou de ser gravado. */
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [salvoId, setSalvoId] = useState<string | null>(null);

  /**
   * O que está digitado em cada campo.
   *
   * Fica separado da lista porque enquanto a pessoa digita "1" para chegar em
   * "12" o valor é inválido, e escrever isso na lista faria a linha piscar
   * "fora do catálogo" no meio da digitação.
   */
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  const carregar = async () => {
    setCarregando(true);
    setErro('');

    const [produtosResposta, fornecedorResposta] = await Promise.all([
      supabase.rpc('fornecedor_meus_produtos'),
      supabase
        .from('suppliers')
        .select('controla_estoque')
        .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .maybeSingle<{ controla_estoque: boolean }>(),
    ]);

    setCarregando(false);

    if (produtosResposta.error) {
      setErro(`Não foi possível carregar seus produtos: ${produtosResposta.error.message}`);
      return;
    }

    const lista = (produtosResposta.data as ProdutoDoFornecedor[]) || [];

    setProdutos(lista);
    setControlaEstoque(Boolean(fornecedorResposta.data?.controla_estoque));

    const inicial: Record<string, string> = {};
    lista.forEach((produto) => {
      inicial[produto.id] = String(produto.estoque);
    });
    setRascunho(inicial);
  };

  useEffect(() => {
    carregar();
  }, []);

  const gravar = async (produto: ProdutoDoFornecedor, valor: string) => {
    const quantidade = Math.max(0, Math.floor(Number(valor)));

    if (!Number.isFinite(quantidade) || quantidade === produto.estoque) {
      // Nada mudou, ou o campo ficou vazio. Devolve o número que estava lá em
      // vez de gravar lixo.
      setRascunho((atual) => ({ ...atual, [produto.id]: String(produto.estoque) }));
      return;
    }

    setSalvandoId(produto.id);
    setErro('');

    const { data, error } = await supabase.rpc('fornecedor_ajusta_estoque', {
      p_produto: produto.id,
      p_quantidade: quantidade,
    });

    setSalvandoId(null);

    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      setRascunho((atual) => ({ ...atual, [produto.id]: String(produto.estoque) }));
      return;
    }

    const gravado = Number(data ?? quantidade);

    setProdutos((atuais) =>
      atuais.map((item) =>
        item.id === produto.id
          ? { ...item, estoque: gravado, indisponivel: gravado === 0 }
          : item
      )
    );
    setRascunho((atual) => ({ ...atual, [produto.id]: String(gravado) }));

    setSalvoId(produto.id);
    window.setTimeout(() => setSalvoId((atual) => (atual === produto.id ? null : atual)), 1600);
  };

  /**
   * "Esse eu não tenho" — um produto só, sem ligar o controle.
   *
   * É o caso mais comum: acabou um item e o fornecedor quer tirá-lo do
   * catálogo hoje, sem se comprometer a manter número de todos os outros.
   */
  const alternarDisponibilidade = async (produto: ProdutoDoFornecedor) => {
    const voltando = produto.indisponivel;

    setSalvandoId(produto.id);
    setErro('');

    const { error } = await supabase.rpc('fornecedor_define_disponibilidade', {
      p_produto: produto.id,
      p_disponivel: voltando,
    });

    setSalvandoId(null);

    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }

    // Voltando ao catálogo, o banco garante ao menos uma unidade — senão o
    // produto sumiria de novo na hora para quem tem o controle ligado.
    const estoque = voltando ? Math.max(1, produto.estoque) : 0;

    setProdutos((atuais) =>
      atuais.map((item) =>
        item.id === produto.id ? { ...item, indisponivel: !voltando, estoque } : item
      )
    );
    setRascunho((atual) => ({ ...atual, [produto.id]: String(estoque) }));

    setSalvoId(produto.id);
    window.setTimeout(() => setSalvoId((atual) => (atual === produto.id ? null : atual)), 1600);
  };

  const alternarControle = async () => {
    setSalvandoControle(true);
    setErro('');

    const { error } = await supabase.rpc('fornecedor_define_controle_estoque', {
      p_ativo: !controlaEstoque,
    });

    setSalvandoControle(false);

    if (error) {
      setErro(`Não foi possível alterar: ${error.message}`);
      return;
    }

    setControlaEstoque((atual) => !atual);
  };

  const formatarPreco = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      Number(valor || 0)
    );

  const foraDoCatalogo = produtos.filter((produto) => produto.indisponivel).length;

  if (carregando) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="w-8 h-8 text-slate-600 animate-spin mx-auto" />
        <p className="text-slate-400 mt-4">Carregando seus produtos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {erro && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-red-300">{erro}</p>
        </div>
      )}

      {/* A chave. Enquanto está desligada os números são só anotação — dá para
          contar tudo com calma antes de deixar a regra valer. */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="min-w-0">
            <p className="font-semibold text-white flex items-center gap-2">
              <Boxes className="w-4 h-4 text-gold" aria-hidden="true" />
              Controle de estoque
            </p>

            <p className="text-sm text-slate-400 mt-1 leading-relaxed max-w-xl">
              {controlaEstoque
                ? 'Ligado. Produto zerado sai do catálogo e ninguém consegue anunciar. Volta sozinho quando você repõe.'
                : 'Desligado. As quantidades ficam só como anotação. Para tirar um produto do catálogo sem ligar isto, use "Não tenho" na linha dele.'}
            </p>
          </div>

          <button
            type="button"
            onClick={alternarControle}
            disabled={salvandoControle}
            aria-pressed={controlaEstoque}
            className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50 ${
              controlaEstoque
                ? 'border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white'
                : 'bg-gold text-navy-900 hover:opacity-90'
            }`}
          >
            {salvandoControle ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : null}
            {controlaEstoque ? 'Desligar' : 'Ligar controle'}
          </button>
        </div>

        {foraDoCatalogo > 0 && (
          <p className="text-sm text-amber-300/90 mt-4">
            {foraDoCatalogo} produto(s) estão fora do catálogo agora por falta de
            estoque.
          </p>
        )}
      </div>

      {produtos.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center">
          <PackageSearch className="w-8 h-8 text-slate-600 mx-auto" aria-hidden="true" />

          <p className="text-slate-400 mt-4 max-w-md mx-auto leading-relaxed">
            Nenhum produto seu está no catálogo do FORNEXA ainda. Assim que a
            equipe cadastrar, eles aparecem aqui para você contar.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {produtos.map((produto) => {
            const fora = produto.indisponivel;
            const acabando = !fora && produto.estoque > 0 && produto.estoque <= ACABANDO;

            return (
              <li
                key={produto.id}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  {produto.imagem ? (
                    <img
                      src={produto.imagem}
                      alt=""
                      className="w-12 h-12 rounded-xl object-cover bg-white/5 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-white/5 shrink-0" />
                  )}

                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{produto.nome}</p>

                    <p className="text-sm text-slate-400 mt-0.5">
                      {formatarPreco(produto.preco)}

                      {fora && <span className="ml-2 text-red-400">· fora do catálogo</span>}

                      {controlaEstoque && acabando && (
                        <span className="ml-2 text-amber-300/90">· acabando</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <label className="sr-only" htmlFor={`estoque-${produto.id}`}>
                    Quantidade de {produto.nome}
                  </label>

                  <input
                    id={`estoque-${produto.id}`}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={rascunho[produto.id] ?? ''}
                    onChange={(evento) =>
                      setRascunho((atual) => ({ ...atual, [produto.id]: evento.target.value }))
                    }
                    onBlur={(evento) => gravar(produto, evento.target.value)}
                    onKeyDown={(evento) => {
                      if (evento.key === 'Enter') {
                        evento.currentTarget.blur();
                      }
                    }}
                    disabled={salvandoId === produto.id}
                    className="w-24 rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2.5 text-white text-center font-mono tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50"
                  />

                  {/* Serve sozinho, sem o controle ligado: é o fornecedor
                      dizendo "esse eu não tenho" para um produto só. */}
                  <button
                    type="button"
                    onClick={() => alternarDisponibilidade(produto)}
                    disabled={salvandoId === produto.id}
                    className={`whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-40 ${
                      fora
                        ? 'bg-gold text-navy-900 hover:opacity-90'
                        : 'border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {fora ? 'Voltei a ter' : 'Não tenho'}
                  </button>

                  <span className="w-5 shrink-0" aria-live="polite">
                    {salvandoId === produto.id && (
                      <Loader2 className="w-4 h-4 text-slate-400 animate-spin" aria-hidden="true" />
                    )}

                    {salvoId === produto.id && salvandoId !== produto.id && (
                      <Check className="w-4 h-4 text-green-400" aria-label="Salvo" />
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
