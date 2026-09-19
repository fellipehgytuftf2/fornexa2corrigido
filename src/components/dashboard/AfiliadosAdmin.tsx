import { useEffect, useState } from 'react';
import { AlertCircle, Check, Copy, Loader2, Search, Share2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  decidirAfiliado,
  linkDoAfiliado,
  listarAfiliadosDoAdmin,
  podeDivulgar,
  salvarCheckoutDoAfiliado,
  type AfiliadoDoAdmin,
} from '../../lib/afiliados';
import ModalPortal from '../ui/modal-portal';

interface DesempenhoDoAfiliado {
  afiliado: string;
  vendas: number;
  faturamento: number;
  clientes_com_conta: number;
  clientes_ativos: number;
  clientes_perdidos: number;
  usando_ainda: number;
  primeira_venda: string | null;
  ultima_venda: string | null;
}

interface ClienteDoAfiliado {
  email: string | null;
  nome: string | null;
  plano: string | null;
  plan_status: string | null;
  valor: number | null;
  comprou_em: string | null;
  ultimo_acesso: string | null;
}

function LinkParaDivulgar({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    await navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        readOnly
        value={link}
        onFocus={(event) => event.target.select()}
        className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-navy-900 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm font-mono truncate"
      />

      <button
        type="button"
        onClick={copiar}
        className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-white text-white dark:text-navy-900 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

/** Quem pediu e ainda espera resposta. Aceitar aqui não libera link nenhum. */
function PedidoPendente({
  afiliado,
  onDecidir,
}: {
  afiliado: AfiliadoDoAdmin;
  onDecidir: (aprovado: boolean) => void;
}) {
  const [decidindo, setDecidindo] = useState(false);

  const decidir = async (aprovado: boolean) => {
    setDecidindo(true);
    await onDecidir(aprovado);
    setDecidindo(false);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-navy-600 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-navy-900 dark:text-white truncate">
          {afiliado.nome || afiliado.email}
        </p>
        <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
          {afiliado.email}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => decidir(false)}
          disabled={decidindo}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 text-sm text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors disabled:opacity-50"
        >
          Recusar
        </button>

        <button
          type="button"
          onClick={() => decidir(true)}
          disabled={decidindo}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-900 dark:bg-white text-white dark:text-navy-900 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {decidindo && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Aceitar
        </button>
      </div>
    </div>
  );
}

/**
 * Um afiliado aceito. Enquanto os dois checkouts da conta dele não estiverem
 * colados aqui, ele não tem link — e a tela dele diz exatamente isso.
 */
function AfiliadoAceito({
  afiliado,
  onSalvo,
}: {
  afiliado: AfiliadoDoAdmin;
  onSalvo: () => void;
}) {
  const pronto = podeDivulgar(afiliado);

  const [editando, setEditando] = useState(!pronto);
  const [basico, setBasico] = useState(afiliado.checkout_basico);
  const [premium, setPremium] = useState(afiliado.checkout_premium);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async () => {
    setSalvando(true);
    setErro('');

    try {
      await salvarCheckoutDoAfiliado(afiliado.conta, { basico, premium });
      setEditando(false);
      onSalvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const classeDoCampo =
    'w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-navy-600 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-navy-900 dark:text-white truncate">
            {afiliado.nome || afiliado.email}
          </p>
          <p className="text-xs font-mono text-gray-500 dark:text-slate-400 truncate">
            /{afiliado.apelido}
          </p>
        </div>

        {pronto ? (
          <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-medium">
            <Check className="w-3.5 h-3.5" />
            Divulgando
          </span>
        ) : (
          <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-medium">
            <AlertCircle className="w-3.5 h-3.5" />
            Falta o checkout dele
          </span>
        )}
      </div>

      {pronto && !editando && (
        <>
          <LinkParaDivulgar link={linkDoAfiliado(afiliado.apelido)} />

          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-xs text-gray-500 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white transition-colors mt-3"
          >
            Trocar os checkouts dele
          </button>
        </>
      )}

      {editando && (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">
              Checkout Básico da conta dele
            </label>
            <input
              type="text"
              value={basico}
              onChange={(event) => setBasico(event.target.value)}
              placeholder="https://checkout.applyfy.com.br/checkout/..."
              className={classeDoCampo}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">
              Checkout Premium da conta dele
            </label>
            <input
              type="text"
              value={premium}
              onChange={(event) => setPremium(event.target.value)}
              placeholder="https://checkout.applyfy.com.br/checkout/..."
              className={classeDoCampo}
            />
          </div>

          {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || !basico.trim() || !premium.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-900 dark:bg-white text-white dark:text-navy-900 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Salvar e liberar o link
            </button>

            {pronto && (
              <button
                type="button"
                onClick={() => {
                  setBasico(afiliado.checkout_basico);
                  setPremium(afiliado.checkout_premium);
                  setEditando(false);
                }}
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-navy-600 text-sm text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Afiliados: quem pediu, quem foi aceito, e o que as indicações deram.
 *
 * A tela segue a ordem da regra. Em cima o que exige decisão sua — pedidos
 * esperando resposta. No meio, os aceitos, cada um esperando o checkout da
 * conta dele para o link nascer. Embaixo, o desempenho, que vem das vendas e
 * não do cadastro.
 */
export default function AfiliadosAdmin() {
  const [cadastrados, setCadastrados] = useState<AfiliadoDoAdmin[]>([]);
  const [carregandoCadastro, setCarregandoCadastro] = useState(true);
  const [erroCadastro, setErroCadastro] = useState('');

  const [desempenho, setDesempenho] = useState<DesempenhoDoAfiliado[]>([]);
  const [carregandoDesempenho, setCarregandoDesempenho] = useState(true);
  const [erroDesempenho, setErroDesempenho] = useState('');

  const [detalhe, setDetalhe] = useState<DesempenhoDoAfiliado | null>(null);
  const [clientes, setClientes] = useState<ClienteDoAfiliado[]>([]);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const [busca, setBusca] = useState('');

  const recarregarCadastro = async () => {
    try {
      setCadastrados(await listarAfiliadosDoAdmin());
      setErroCadastro('');
    } catch (e) {
      setErroCadastro(e instanceof Error ? e.message : 'Erro desconhecido.');
    } finally {
      setCarregandoCadastro(false);
    }
  };

  useEffect(() => {
    recarregarCadastro();

    const carregarDesempenho = async () => {
      const { data, error } = await supabase.rpc('admin_afiliados');

      if (error) {
        setErroDesempenho(error.message);
      } else {
        setDesempenho((data as DesempenhoDoAfiliado[]) || []);
      }

      setCarregandoDesempenho(false);
    };

    carregarDesempenho();
  }, []);

  const decidir = async (conta: string, aprovado: boolean) => {
    try {
      await decidirAfiliado(conta, aprovado);
      await recarregarCadastro();
    } catch (e) {
      setErroCadastro(e instanceof Error ? e.message : 'Não foi possível decidir.');
    }
  };

  const abrirDetalhe = async (afiliado: DesempenhoDoAfiliado) => {
    setDetalhe(afiliado);
    setClientes([]);
    setCarregandoDetalhe(true);

    const { data, error } = await supabase.rpc('admin_clientes_do_afiliado', {
      p_afiliado: afiliado.afiliado,
    });

    setCarregandoDetalhe(false);

    if (!error) {
      setClientes((data as ClienteDoAfiliado[]) || []);
    }
  };

  const formatarValor = (valor: number | null) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      Number(valor || 0)
    );

  const formatarData = (valor: string | null) => {
    if (!valor) return 'nunca';

    const data = new Date(valor);
    const dias = Math.floor((Date.now() - data.getTime()) / 86400000);

    if (dias === 0) return 'hoje';
    if (dias === 1) return 'ontem';
    if (dias < 30) return `${dias} dias atrás`;

    return data.toLocaleDateString('pt-BR');
  };

  // Sem acento dos dois lados: quem digita "joao" tem que achar o "João".
  const semAcento = (texto: string) =>
    texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const termo = semAcento(busca.trim());

  const encontrados = termo
    ? cadastrados.filter((a) =>
        [a.nome, a.email, a.apelido].some((campo) => campo && semAcento(campo).includes(termo))
      )
    : cadastrados;

  const pendentes = encontrados.filter((a) => a.situacao === 'pendente');
  const aceitos = encontrados.filter((a) => a.situacao === 'aprovado');

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Share2 className="w-5 h-5 text-gray-600 dark:text-slate-400" />

          <h2 className="text-lg font-semibold text-navy-900 dark:text-white">
            Afiliados
          </h2>
        </div>

        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 mb-5">
          Cliente que já comprou pede para divulgar. Você aceita e cola os dois
          checkouts da conta dele — só aí o link dele nasce.
        </p>

        {erroCadastro && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 mb-4">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{erroCadastro}</p>
          </div>
        )}

        {carregandoCadastro ? (
          <div className="flex items-center gap-3 text-gray-500 dark:text-slate-400 py-8 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            Carregando...
          </div>
        ) : cadastrados.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 dark:border-navy-600 px-4 py-10 text-center">
            <p className="text-sm text-navy-900 dark:text-white font-medium">
              Ninguém pediu para ser afiliado ainda
            </p>

            <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
              O pedido sai da conta do cliente, em Afiliados. Quando alguém
              pedir, ele aparece aqui esperando sua resposta.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />

              <input
                type="search"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar por nome, e-mail ou link"
                aria-label="Buscar afiliado"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              />
            </div>

            {termo && pendentes.length === 0 && aceitos.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-6">
                Nenhum afiliado com “{busca.trim()}”. Confira a grafia ou busque
                pelo e-mail.
              </p>
            )}

            {pendentes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
                  Esperando sua resposta
                </p>

                {pendentes.map((afiliado) => (
                  <PedidoPendente
                    key={afiliado.conta}
                    afiliado={afiliado}
                    onDecidir={(aprovado) => decidir(afiliado.conta, aprovado)}
                  />
                ))}
              </div>
            )}

            {aceitos.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
                  Aceitos
                </p>

                <div className="grid gap-3 lg:grid-cols-2">
                  {aceitos.map((afiliado) => (
                    <AfiliadoAceito
                      key={afiliado.conta}
                      afiliado={afiliado}
                      onSalvo={recarregarCadastro}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-navy-900 dark:text-white">
          Desempenho
        </h2>

        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 mb-5">
          O que aconteceu com o cliente depois da venda. A comissão continua
          sendo calculada e paga pela Applyfy.
        </p>

        {erroDesempenho && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 mb-4">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{erroDesempenho}</p>
          </div>
        )}

        {carregandoDesempenho ? (
          <div className="flex items-center gap-3 text-gray-500 dark:text-slate-400 py-8 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            Carregando...
          </div>
        ) : desempenho.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 dark:border-navy-600 px-4 py-10 text-center">
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Nenhuma venda por afiliado ainda.
            </p>

            <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
              A primeira venda indicada aparece aqui sozinha, assim que o
              pagamento entrar.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-navy-600">
                  <th className="pb-3 pr-4 font-medium">Afiliado</th>
                  <th className="pb-3 pr-4 font-medium">Vendas</th>
                  <th className="pb-3 pr-4 font-medium">Faturamento</th>
                  <th className="pb-3 pr-4 font-medium">Ativos</th>
                  <th className="pb-3 pr-4 font-medium">Perdidos</th>
                  <th className="pb-3 pr-4 font-medium">Usando ainda</th>
                  <th className="pb-3 font-medium">Última venda</th>
                </tr>
              </thead>

              <tbody>
                {desempenho.map((item) => (
                  <tr
                    key={item.afiliado}
                    onClick={() => abrirDetalhe(item)}
                    className="border-b border-gray-100 dark:border-navy-700 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-navy-700/50"
                  >
                    <td className="py-3 pr-4 font-mono text-navy-900 dark:text-white">
                      {item.afiliado}
                    </td>

                    <td className="py-3 pr-4 text-navy-900 dark:text-white font-medium">
                      {item.vendas}
                    </td>

                    <td className="py-3 pr-4 text-navy-900 dark:text-white whitespace-nowrap">
                      {formatarValor(item.faturamento)}
                    </td>

                    <td className="py-3 pr-4 text-green-600 dark:text-green-400 font-medium">
                      {item.clientes_ativos}
                    </td>

                    <td
                      className={`py-3 pr-4 font-medium ${
                        item.clientes_perdidos > 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-500 dark:text-slate-400'
                      }`}
                    >
                      {item.clientes_perdidos}
                    </td>

                    {/* A coluna que decide se a indicação valeu. */}
                    <td className="py-3 pr-4 text-navy-900 dark:text-white">
                      {item.usando_ainda} de {item.vendas}
                    </td>

                    <td className="py-3 text-gray-600 dark:text-slate-300 whitespace-nowrap">
                      {formatarData(item.ultima_venda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detalhe && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black/50 z-[100] overflow-y-auto flex min-h-full items-start justify-center p-4">
            <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 w-full max-w-lg my-auto">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="text-lg font-semibold text-navy-900 dark:text-white font-mono">
                    {detalhe.afiliado}
                  </h3>

                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    {detalhe.vendas} venda(s) · {formatarValor(detalhe.faturamento)} ·
                    primeira em {formatarData(detalhe.primeira_venda)}
                  </p>
                </div>

                <button
                  onClick={() => setDetalhe(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {carregandoDetalhe ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando...
                </div>
              ) : (
                <ul className="space-y-2">
                  {clientes.map((cliente, indice) => (
                    <li
                      key={`${cliente.email}-${indice}`}
                      className="rounded-lg border border-gray-200 dark:border-navy-600 px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-navy-900 dark:text-white">
                          {cliente.nome || cliente.email}
                        </span>

                        <span className="text-sm font-medium text-navy-900 dark:text-white">
                          {formatarValor(cliente.valor)}
                        </span>
                      </div>

                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                        {cliente.plan_status === 'ativo'
                          ? 'ativo'
                          : cliente.plan_status || 'sem conta ainda'}
                        {' · comprou '}
                        {formatarData(cliente.comprou_em)}
                        {' · último acesso '}
                        {formatarData(cliente.ultimo_acesso)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
