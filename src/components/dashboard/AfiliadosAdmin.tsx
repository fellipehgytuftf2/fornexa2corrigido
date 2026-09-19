import { useEffect, useState } from 'react';
import { AlertCircle, Check, Copy, Loader2, Search, Share2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  decidirAfiliado,
  desempenhoDosAfiliados,
  linkDoAfiliado,
  listarAfiliadosDoAdmin,
  podeDivulgar,
  salvarCheckoutDoAfiliado,
  type AfiliadoDoAdmin,
  type NumerosDoAfiliado,
} from '../../lib/afiliados';
import { PLANOS } from '../../lib/planos';
import ModalPortal from '../ui/modal-portal';

interface VendaPorCodigo {
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

// A venda é do afiliado quando cai num checkout dele. Colar o checkout da
// casa por engano passaria toda venda do FORNEXA para ele — e a comissão junto.
const idDoCheckout = (url: string) => url.match(/\/checkout\/([^/?#]+)/)?.[1];
const CHECKOUTS_DA_CASA = PLANOS.map((plano) => idDoCheckout(plano.checkout)).filter(Boolean);

// Sem acento dos dois lados: quem digita "joao" tem que achar o "João".
const semAcento = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function filtrar(lista: AfiliadoDoAdmin[], busca: string) {
  const termo = semAcento(busca.trim());

  if (!termo) return lista;

  return lista.filter((a) =>
    [a.nome, a.email, a.apelido].some((campo) => campo && semAcento(campo).includes(termo))
  );
}

const CARTAO =
  'bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm';

function Cabecalho({ titulo, children }: { titulo: string; children: string }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <Share2 className="w-5 h-5 text-gray-600 dark:text-slate-400" />

        <h2 className="text-lg font-semibold text-navy-900 dark:text-white">{titulo}</h2>
      </div>

      <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 mb-5">{children}</p>
    </>
  );
}

function CampoDeBusca({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />

      <input
        type="search"
        value={valor}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar por nome, e-mail ou link"
        aria-label="Buscar afiliado"
        className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
      />
    </div>
  );
}

function Erro({ mensagem }: { mensagem: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 mb-4">
      <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
      <p className="text-sm text-red-700 dark:text-red-300">{mensagem}</p>
    </div>
  );
}

function Carregando() {
  return (
    <div className="flex items-center gap-3 text-gray-500 dark:text-slate-400 py-8 justify-center">
      <Loader2 className="w-5 h-5 animate-spin" />
      Carregando...
    </div>
  );
}

function Vazio({ titulo, children }: { titulo: string; children: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 dark:border-navy-600 px-4 py-10 text-center">
      <p className="text-sm text-navy-900 dark:text-white font-medium">{titulo}</p>

      <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
        {children}
      </p>
    </div>
  );
}

function useAfiliadosCadastrados() {
  const [cadastrados, setCadastrados] = useState<AfiliadoDoAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const recarregar = async () => {
    try {
      setCadastrados(await listarAfiliadosDoAdmin());
      setErro('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    recarregar();
  }, []);

  return { cadastrados, carregando, erro, setErro, recarregar };
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
  onDecidir: (aprovado: boolean) => Promise<void>;
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
        <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{afiliado.email}</p>
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
  numeros,
  onSalvo,
}: {
  afiliado: AfiliadoDoAdmin;
  numeros?: NumerosDoAfiliado;
  onSalvo: () => void;
}) {
  const pronto = podeDivulgar(afiliado);

  const [editando, setEditando] = useState(!pronto);
  const [basico, setBasico] = useState(afiliado.checkout_basico);
  const [premium, setPremium] = useState(afiliado.checkout_premium);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = async () => {
    if ([basico, premium].some((url) => CHECKOUTS_DA_CASA.includes(idDoCheckout(url)))) {
      setErro('Esse é o checkout do FORNEXA, não o da conta dele. Cole os checkouts criados para este afiliado.');
      return;
    }

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

      {numeros && (
        <p className="text-sm text-navy-900 dark:text-white mb-3">
          {numeros.vendas === 0 ? (
            <span className="text-gray-500 dark:text-slate-400">Nenhuma venda ainda.</span>
          ) : (
            <>
              <span className="font-semibold">{numeros.vendas}</span>{' '}
              {numeros.vendas === 1 ? 'venda' : 'vendas'} ·{' '}
              <span className="font-semibold">{formatarValor(numeros.faturamento)}</span>
              <span className="block text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                <span className="text-green-600 dark:text-green-400">
                  {numeros.clientes_ativos} ativo(s)
                </span>
                {' · '}
                <span
                  className={
                    numeros.clientes_perdidos > 0 ? 'text-red-600 dark:text-red-400' : undefined
                  }
                >
                  {numeros.clientes_perdidos} perdido(s)
                </span>
                {' · '}
                {numeros.usando_ainda} usando ainda · última {formatarData(numeros.ultima_venda)}
              </span>
            </>
          )}
        </p>
      )}

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
 * Admin → Afiliados → Aceitar pedido.
 *
 * Só o que precisa de você: quem pediu e espera resposta, e quem foi aceito
 * mas ainda não tem checkout. Liberou o link, o afiliado sai daqui e passa a
 * aparecer em Desempenho — esta lista existe para esvaziar.
 */
export function PedidosDeAfiliado() {
  const { cadastrados, carregando, erro, setErro, recarregar } = useAfiliadosCadastrados();
  const [busca, setBusca] = useState('');
  const [liberado, setLiberado] = useState('');

  const fila = cadastrados.filter(
    (a) => a.situacao === 'pendente' || (a.situacao === 'aprovado' && !podeDivulgar(a))
  );
  const encontrados = filtrar(fila, busca);
  const pendentes = encontrados.filter((a) => a.situacao === 'pendente');
  const semCheckout = encontrados.filter((a) => a.situacao === 'aprovado');

  const decidir = async (conta: string, aprovado: boolean) => {
    try {
      await decidirAfiliado(conta, aprovado);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível decidir.');
    }
  };

  return (
    <div className={CARTAO}>
      <Cabecalho titulo="Pedidos de afiliado">
        Cliente que já comprou pede para divulgar. Você aceita e cola os dois
        checkouts da conta dele — só aí o link dele nasce.
      </Cabecalho>

      {erro && <Erro mensagem={erro} />}

      {liberado && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-900/20 px-4 py-3 mb-4">
          <Check className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <p className="text-sm text-green-800 dark:text-green-300">
            Link de {liberado} liberado. Ele agora aparece em Afiliados → Desempenho.
          </p>
        </div>
      )}

      {carregando ? (
        <Carregando />
      ) : cadastrados.length === 0 ? (
        <Vazio titulo="Ninguém pediu para ser afiliado ainda">
          O pedido sai da conta do cliente, no fim de Configurações. Quando
          alguém pedir, ele aparece aqui esperando sua resposta.
        </Vazio>
      ) : fila.length === 0 ? (
        <Vazio titulo="Nada esperando você">
          Todo pedido já foi respondido e todo aceito já tem link. Quem está
          divulgando fica em Afiliados → Desempenho.
        </Vazio>
      ) : (
        <div className="space-y-5">
          <CampoDeBusca valor={busca} onChange={setBusca} />

          {encontrados.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-6">
              Nenhum pedido com “{busca.trim()}”. Confira a grafia ou busque pelo e-mail.
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

          {semCheckout.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
                Aceitos, falta o checkout
              </p>

              <div className="grid gap-3 lg:grid-cols-2">
                {semCheckout.map((afiliado) => (
                  <AfiliadoAceito
                    key={afiliado.conta}
                    afiliado={afiliado}
                    onSalvo={() => {
                      setLiberado(afiliado.nome || afiliado.email || afiliado.apelido);
                      recarregar();
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Admin → Afiliados → Desempenho.
 *
 * Em cima, quem está divulgando: link, e as vendas feitas nos checkouts dele.
 * Embaixo, as vendas que chegaram com `?code=` na URL — o jeito antigo de
 * indicar, que continua sendo contado para não sumir histórico.
 */
export function DesempenhoDosAfiliados() {
  const { cadastrados, carregando, erro, recarregar } = useAfiliadosCadastrados();
  const [busca, setBusca] = useState('');

  const [numeros, setNumeros] = useState<Record<string, NumerosDoAfiliado>>({});
  const [erroNumeros, setErroNumeros] = useState('');

  const [porCodigo, setPorCodigo] = useState<VendaPorCodigo[]>([]);
  const [carregandoCodigo, setCarregandoCodigo] = useState(true);
  const [erroCodigo, setErroCodigo] = useState('');

  const [detalhe, setDetalhe] = useState<VendaPorCodigo | null>(null);
  const [clientes, setClientes] = useState<ClienteDoAfiliado[]>([]);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const carregarNumeros = async () => {
    try {
      const lista = await desempenhoDosAfiliados();
      setNumeros(Object.fromEntries(lista.map((n) => [n.conta, n])));
      setErroNumeros('');
    } catch (e) {
      setErroNumeros(e instanceof Error ? e.message : 'Erro desconhecido.');
    }
  };

  useEffect(() => {
    carregarNumeros();

    const carregarPorCodigo = async () => {
      const { data, error } = await supabase.rpc('admin_afiliados');

      if (error) {
        setErroCodigo(error.message);
      } else {
        setPorCodigo((data as VendaPorCodigo[]) || []);
      }

      setCarregandoCodigo(false);
    };

    carregarPorCodigo();
  }, []);

  const abrirDetalhe = async (afiliado: VendaPorCodigo) => {
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

  const divulgando = cadastrados.filter(podeDivulgar);
  const encontrados = filtrar(divulgando, busca);

  return (
    <div className="space-y-6">
      <div className={CARTAO}>
        <Cabecalho titulo="Desempenho dos afiliados">
          Quem está divulgando, com as vendas feitas nos checkouts de cada um.
          A comissão continua sendo calculada e paga pela Applyfy.
        </Cabecalho>

        {erro && <Erro mensagem={erro} />}
        {erroNumeros && <Erro mensagem={`Não foi possível contar as vendas: ${erroNumeros}`} />}

        {carregando ? (
          <Carregando />
        ) : divulgando.length === 0 ? (
          <Vazio titulo="Nenhum afiliado divulgando ainda">
            Aceite um pedido em Afiliados → Aceitar pedido e cole os checkouts
            dele. Assim que o link liberar, ele aparece aqui.
          </Vazio>
        ) : (
          <div className="space-y-5">
            <CampoDeBusca valor={busca} onChange={setBusca} />

            {encontrados.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-6">
                Nenhum afiliado com “{busca.trim()}”. Confira a grafia ou busque pelo e-mail.
              </p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {encontrados.map((afiliado) => (
                  <AfiliadoAceito
                    key={afiliado.conta}
                    afiliado={afiliado}
                    numeros={numeros[afiliado.conta]}
                    onSalvo={() => {
                      recarregar();
                      carregarNumeros();
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {(carregandoCodigo || erroCodigo || porCodigo.length > 0) && (
        <div className={CARTAO}>
          <h2 className="text-lg font-semibold text-navy-900 dark:text-white">
            Vendas com código de indicação
          </h2>

          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 mb-5">
            Vendas que chegaram com <code className="font-mono">?code=</code> no
            endereço do checkout — o jeito antigo de indicar. O que aconteceu
            com o cliente depois da venda.
          </p>

          {erroCodigo && <Erro mensagem={erroCodigo} />}

          {carregandoCodigo ? (
            <Carregando />
          ) : (
            porCodigo.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-navy-600">
                      <th className="pb-3 pr-4 font-medium">Código</th>
                      <th className="pb-3 pr-4 font-medium">Vendas</th>
                      <th className="pb-3 pr-4 font-medium">Faturamento</th>
                      <th className="pb-3 pr-4 font-medium">Ativos</th>
                      <th className="pb-3 pr-4 font-medium">Perdidos</th>
                      <th className="pb-3 pr-4 font-medium">Usando ainda</th>
                      <th className="pb-3 font-medium">Última venda</th>
                    </tr>
                  </thead>

                  <tbody>
                    {porCodigo.map((item) => (
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
            )
          )}
        </div>
      )}

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
