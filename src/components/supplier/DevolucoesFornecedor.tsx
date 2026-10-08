import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, PackageSearch, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface DevolucaoDoFornecedor {
  id: string;
  produto: string;
  imagem: string | null;
  rastreio: string | null;
  motivo: string;
  codigo_devolucao: string | null;
  status: 'avisada' | 'recebida' | 'avariada' | 'nao_chegou' | 'revendida';
  avisada_em: string;
  prazo_cd: string | null;
  /** O que libera o motorista na portaria. Vem do vendedor. */
  codigo_autorizacao: string | null;
  tentativas: number | null;
  ultima_tentativa_em: string | null;
  /** O número impresso na etiqueta de ida, quando é o ML que devolve. */
  ml_order_id: string | null;
  vendedor: string | null;
  vendedor_whatsapp: string | null;
  /** O nome impresso na etiqueta de devolução do comprador. */
  quem_recebe: string | null;
  /** Quem comprou: é o nome que vem impresso na etiqueta da devolução. */
  comprador: string | null;
  /** O nome da conta do vendedor no ML, que é o destino na etiqueta. */
  conta_ml: string | null;
  /**
   * O código de hoje deste vendedor.
   *
   * O Mercado Livre gera um por vendedor e por dia, e ele libera todas as
   * devoluções daquele vendedor naquele dia — por isso vem igual em várias
   * linhas desta lista, e não é engano.
   */
  codigo_do_dia: string | null;
  codigo_do_dia_em: string | null;
  /** O código que a equipe carimbou na separação. */
  codigo_interno: string | null;
  /** O pedido por trás da devolução — é nele que o reembolso é marcado. */
  order_id: string;
  /** Quando o vendedor pagou este pedido. Nulo = não há o que devolver. */
  pago_em: string | null;
  reembolsado_em: string | null;
}

interface VendaEncontrada {
  order_id: string;
  produto: string;
  quantidade: number;
  ml_order_id: string | null;
  codigo_interno: string | null;
  vendedor: string | null;
  vendedor_whatsapp: string | null;
  quem_recebe: string | null;
  /** Quem comprou — o nome que vem impresso na etiqueta da devolução. */
  comprador: string | null;
  /** A conta do vendedor no ML, que é o destino impresso na etiqueta. */
  conta_ml: string | null;
  status: string;
  devolucao_id: string | null;
  devolucao_status: string | null;
  devolucao_codigo: string | null;
}

const MOTIVOS: Record<string, string> = {
  arrependimento: 'Arrependimento do comprador',
  nao_entregue: 'Não entregue / devolvido pelos Correios',
  defeito: 'Defeito de fabricação',
  produto_errado: 'Produto errado',
  cancelado_flex: 'Cancelado (Flex)',
};

const SITUACOES: Record<DevolucaoDoFornecedor['status'], string> = {
  avisada: 'Esperando chegar',
  recebida: 'Recebida',
  avariada: 'Recebida com avaria',
  nao_chegou: 'Não chegou',
  revendida: 'Vendida de novo',
};

/**
 * O que o fornecedor tem para receber de volta.
 *
 * O vendedor avisa daqui do outro lado; esta tela é onde o fornecedor confirma
 * o que chegou no CD. A resposta sobre a EMBALAGEM é a parte que só ele pode
 * dar: as regras dizem que muito comprador rasga ou descarta a embalagem, e é
 * isso que decide se o produto pode ser vendido de novo.
 */
export default function DevolucoesFornecedor() {
  const [devolucoes, setDevolucoes] = useState<DevolucaoDoFornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  /** A busca pelo numero da etiqueta. */
  const [numeroBuscado, setNumeroBuscado] = useState("");
  const [encontradas, setEncontradas] = useState<VendaEncontrada[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  /**
   * As devoluções separadas por vendedor.
   *
   * O código de autorização é um por vendedor e por dia. Numa lista corrida
   * ele aparecia repetido em cartões soltos, e quem recebe pacotes de dois
   * vendedores no mesmo dia tinha que conferir cartão a cartão de quem era
   * cada código. Agrupado, o código fica uma vez no topo e vale para tudo que
   * está abaixo dele.
   *
   * A ordem de dentro do grupo é a que veio do banco — mais recente primeiro.
   */
  const porVendedor = useMemo(() => {
    const grupos = new Map<
      string,
      {
        chave: string;
        vendedor: string | null;
        contaMl: string | null;
        codigoDoDia: string | null;
        itens: DevolucaoDoFornecedor[];
      }
    >();

    devolucoes.forEach((devolucao) => {
      const chave = `${devolucao.vendedor ?? '?'}|${devolucao.conta_ml ?? '?'}`;

      const grupo = grupos.get(chave) ?? {
        chave,
        vendedor: devolucao.vendedor,
        contaMl: devolucao.conta_ml,
        codigoDoDia: devolucao.codigo_do_dia,
        itens: [],
      };

      // O código vem igual em todas as linhas do mesmo vendedor; basta a
      // primeira que tiver.
      grupo.codigoDoDia = grupo.codigoDoDia ?? devolucao.codigo_do_dia;
      grupo.itens.push(devolucao);

      grupos.set(chave, grupo);
    });

    return [...grupos.values()];
  }, [devolucoes]);

  const carregar = async () => {
    setCarregando(true);
    setErro('');

    const { data, error } = await supabase.rpc('fornecedor_minhas_devolucoes');

    setCarregando(false);

    if (error) {
      setErro(`Não foi possível carregar as devoluções: ${error.message}`);
      return;
    }

    setDevolucoes((data as DevolucaoDoFornecedor[]) || []);
  };

  useEffect(() => {
    carregar();
  }, []);

  /**
   * O motorista veio e foi embora sem entregar.
   *
   * Registrar isso avisa o vendedor na hora e deixa claro quando a proxima
   * tentativa e a ultima -- a diferenca entre as duas e o produto inteiro.
   */
  const registrarTentativa = async (devolucao: DevolucaoDoFornecedor) => {
    setSalvandoId(devolucao.id);
    setErro("");

    const { data, error } = await supabase.rpc("fornecedor_registra_tentativa", {
      p_devolucao: devolucao.id,
    });

    setSalvandoId(null);

    const resposta = data as { ok?: boolean; erro?: string } | null;

    if (error || resposta?.ok === false) {
      setErro(error?.message ?? resposta?.erro ?? "Não foi possível registrar.");
      return;
    }

    await carregar();
  };

  /**
   * O dinheiro de volta ao vendedor.
   *
   * Cancelado depois de despachado saiu da aba Cancelados e veio para cá — e
   * levaria junto o botão de reembolso, que é a única marca de quem ainda deve
   * dinheiro. O produto voltando e o valor voltando são duas contas separadas:
   * uma pode andar sem a outra.
   */
  const marcarReembolso = async (
    devolucao: DevolucaoDoFornecedor,
    reembolsado: boolean
  ) => {
    setSalvandoId(devolucao.id);
    setErro('');

    const { data, error } = await supabase.rpc('fornecedor_marca_reembolso', {
      p_order_id: devolucao.order_id,
      p_reembolsado: reembolsado,
    });

    setSalvandoId(null);

    const resposta = data as { ok?: boolean; erro?: string } | null;

    if (error || resposta?.ok === false) {
      setErro(error?.message ?? resposta?.erro ?? 'Não foi possível marcar o reembolso.');
      return;
    }

    await carregar();
  };

  const responder = async (
    devolucao: DevolucaoDoFornecedor,
    situacao: 'recebida' | 'avariada' | 'nao_chegou'
  ) => {
    setSalvandoId(devolucao.id);
    setErro('');

    const { error } = await supabase.rpc('fornecedor_recebe_devolucao', {
      p_devolucao: devolucao.id,
      p_situacao: situacao,
    });

    setSalvandoId(null);

    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }

    setDevolucoes((atuais) =>
      atuais.map((item) =>
        item.id === devolucao.id ? { ...item, status: situacao } : item
      )
    );
  };

  /**
   * Acha a venda pelo numero impresso na etiqueta.
   *
   * Quando e o Mercado Livre que devolve, o pacote volta com a etiqueta de
   * ida -- e o numero da venda nela e o unico identificador confiavel.
   */
  const buscarVenda = async () => {
    setBuscando(true);
    setErro("");

    const { data, error } = await supabase.rpc("fornecedor_busca_venda", {
      p_numero: numeroBuscado,
    });

    setBuscando(false);

    if (error) {
      setErro(`Não foi possível procurar: ${error.message}`);
      return;
    }

    setEncontradas((data as VendaEncontrada[]) || []);
  };

  const formatarData = (valor: string | null) =>
    valor ? new Date(valor).toLocaleDateString('pt-BR') : '—';

  if (carregando) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="w-8 h-8 text-slate-600 animate-spin mx-auto" />
        <p className="text-slate-400 mt-4">Carregando devoluções...</p>
      </div>
    );
  }

  if (devolucoes.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center">
        <PackageSearch className="w-8 h-8 text-slate-600 mx-auto" aria-hidden="true" />

        <p className="text-slate-400 mt-4 max-w-md mx-auto leading-relaxed">
          Nenhuma devolução avisada. Quando um vendedor registrar uma, ela
          aparece aqui com o código de rastreio para você conferir na bancada.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {erro && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-red-300">{erro}</p>
        </div>
      )}

      {/* Quando é o Mercado Livre que devolve, o pacote volta com a etiqueta
          de ida — e nela está o número da venda. Digitando esse número, a
          equipe descobre de quem é sem depender de nome nenhum. */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm font-semibold text-white">
          Chegou um pacote e você não sabe de quem é?
        </p>

        {/* A etiqueta de devolução não traz número de venda nem produto: traz
            o nome de quem devolve. Dizer isso aqui evita o fornecedor procurar
            na etiqueta um número que não existe. */}
        <p className="text-sm text-slate-400 mt-1 leading-relaxed">
          Procure pelo <strong className="text-white">nome do comprador</strong> impresso
          na etiqueta — é o que a etiqueta de devolução traz. Número da venda, rastreio e
          código interno também funcionam.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <input
            id="buscar-venda"
            value={numeroBuscado}
            onChange={(evento) => setNumeroBuscado(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter') buscarVenda();
            }}
            placeholder="Nome do comprador, número da venda ou rastreio"
            className="flex-1 min-w-0 rounded-xl border border-white/10 bg-navy-900/60 px-4 py-2.5 text-sm font-mono text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
          />

          <button
            type="button"
            onClick={buscarVenda}
            disabled={buscando || numeroBuscado.trim().length < 6}
            className="rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-navy-900 hover:bg-gold-hover disabled:opacity-50 shrink-0"
          >
            {buscando ? 'Procurando...' : 'Procurar'}
          </button>
        </div>

        {encontradas !== null && encontradas.length === 0 && (
          <p className="text-sm text-amber-300 mt-3">
            Nenhuma venda sua com isso. Tente o nome do comprador como está escrito na
            etiqueta — basta parte dele.
          </p>
        )}

        {encontradas?.map((venda) => (
          <div
            key={venda.order_id}
            className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4"
          >
            <p className="text-sm font-semibold text-white">{venda.produto}</p>

            <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Vendedor</dt>
                <dd className="text-slate-200 break-words">{venda.vendedor || '—'}</dd>
              </div>

              <div>
                <dt className="text-xs text-emerald-300/80">Comprador</dt>
                <dd className="text-white font-semibold break-words">
                  {venda.comprador || '—'}
                </dd>
              </div>

              <div>
                <dt
                  className="text-xs text-slate-500"
                  title="O nome que aparece como destino na etiqueta de devolução"
                >
                  Conta do vendedor no ML
                </dt>
                <dd className="text-slate-200 break-words">
                  {venda.conta_ml || venda.quem_recebe || '—'}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-slate-500">Cód. interno</dt>
                <dd className="text-slate-200 font-mono">{venda.codigo_interno || '—'}</dd>
              </div>

              <div>
                <dt className="text-xs text-slate-500">Devolução</dt>
                <dd className="text-slate-200">
                  {venda.devolucao_id
                    ? SITUACOES[venda.devolucao_status as DevolucaoDoFornecedor['status']] ??
                      venda.devolucao_status
                    : 'não aberta pelo vendedor'}
                </dd>
              </div>
            </dl>

            {venda.devolucao_codigo && (
              <p className="font-mono text-xl font-bold tracking-widest text-emerald-200 mt-3">
                {venda.devolucao_codigo}
              </p>
            )}

            {venda.vendedor_whatsapp && (
              <a
                href={`https://wa.me/55${venda.vendedor_whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-sm font-semibold text-gold hover:underline mt-3"
              >
                Falar com o vendedor no WhatsApp
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Agrupado por vendedor, e não numa lista corrida.
          O código é um por vendedor e por dia: numa lista misturada ele
          aparecia repetido em cartões soltos, e quem recebe dois pacotes de
          vendedores diferentes no mesmo dia precisava conferir linha a linha de
          quem era cada código. Separado, o código fica uma vez no topo do
          grupo e vale para tudo que está embaixo dele. */}
      {porVendedor.map(({ chave, vendedor, contaMl, codigoDoDia, itens }) => (
        <section key={chave} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold text-white truncate">{vendedor ?? 'Vendedor'}</p>

              <p className="text-xs text-slate-400">
                {contaMl ? `Conta no ML: ${contaMl} · ` : ''}
                {itens.length === 1 ? '1 devolução' : `${itens.length} devoluções`}
              </p>
            </div>

            {codigoDoDia ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
                <p className="text-[11px] text-emerald-300/80">
                  Código de hoje — vale para todas abaixo
                </p>

                <p className="font-mono text-xl font-bold tracking-widest text-emerald-200">
                  {codigoDoDia}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2">
                <p className="text-xs font-semibold text-amber-200">
                  Sem código de hoje deste vendedor
                </p>
              </div>
            )}
          </div>

      <ul className="space-y-3">
        {itens.map((devolucao) => {
          const esperando = devolucao.status === 'avisada';

          return (
            <li
              key={devolucao.id}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="flex items-start gap-4">
                {devolucao.imagem ? (
                  <img
                    src={devolucao.imagem}
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover bg-white/5 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-white/5 shrink-0" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-white font-medium">{devolucao.produto}</p>

                  <p className="text-sm text-slate-400 mt-1">
                    {MOTIVOS[devolucao.motivo] ?? devolucao.motivo}
                  </p>

                  {/* O rastreio vem primeiro de propósito: é por ele que o
                      pacote é encontrado, não pelo nome do produto. */}
                  <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Rastreio</dt>
                      <dd className="text-slate-200 font-mono break-all mt-0.5">
                        {devolucao.rastreio || '—'}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs text-slate-500">Cód. devolução</dt>
                      <dd className="text-slate-200 font-mono break-all mt-0.5">
                        {devolucao.codigo_devolucao || '—'}
                      </dd>
                    </div>

                    {/* O número da venda é o que está impresso na etiqueta de
                        ida: quando é o Mercado Livre que devolve, o pacote
                        volta com ela, e é por aqui que se acha o dono. */}
                    <div>
                      <dt className="text-xs text-slate-500">Nº da venda</dt>
                      <dd className="text-slate-200 font-mono break-all mt-0.5">
                        {devolucao.ml_order_id || '—'}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs text-slate-500">Vendedor</dt>
                      <dd className="text-slate-200 break-words mt-0.5">
                        {devolucao.vendedor || '—'}
                      </dd>
                    </div>

                    {/* O comprador é a ÚNICA identificação que o pacote traz.
                        A etiqueta de devolução não tem número de venda, nem
                        produto, nem o rastreio da ida: tem o nome de quem
                        devolve, o Pack ID e o nome da conta do vendedor como
                        destino. Chegando dois pacotes no mesmo dia, é esse
                        nome que diz qual é qual. */}
                    <div>
                      <dt className="text-xs text-emerald-300/80">
                        Comprador (remetente na etiqueta)
                      </dt>
                      <dd className="text-white font-semibold break-words mt-0.5">
                        {devolucao.comprador || '—'}
                      </dd>
                    </div>

                    <div>
                      <dt
                        className="text-xs text-slate-500"
                        title="O nome que aparece como destino na etiqueta de devolução"
                      >
                        Conta do vendedor no ML
                      </dt>
                      <dd className="text-slate-200 break-words mt-0.5">
                        {devolucao.conta_ml || devolucao.quem_recebe || '—'}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs text-slate-500">Cód. interno</dt>
                      <dd className="text-slate-200 font-mono break-all mt-0.5">
                        {devolucao.codigo_interno || '—'}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs text-slate-500">Avisada em</dt>
                      <dd className="text-slate-200 mt-0.5">
                        {formatarData(devolucao.avisada_em)}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs text-slate-500">Situação</dt>
                      <dd
                        className={`mt-0.5 ${
                          esperando ? 'text-gold' : 'text-slate-200'
                        }`}
                      >
                        {SITUACOES[devolucao.status]}
                      </dd>
                    </div>
                  </dl>
                </div>

                <RotateCcw
                  className="w-4 h-4 text-slate-600 shrink-0 mt-1"
                  aria-hidden="true"
                />
              </div>

              {/* O código de autorização é o que a portaria precisa ter na mão
                  quando o motorista chega. Fica em destaque, e grande: é para
                  ser lido de longe, com o motorista esperando.
                  Havendo código de hoje, ele já está no topo do grupo deste
                  vendedor e aqui só repetiria — este bloco fica para o código
                  antigo, colado numa devolução específica, e para o aviso de
                  que ainda não há código nenhum. */}
              {esperando && !devolucao.codigo_do_dia && (
                <div
                  className={`mt-4 rounded-xl border p-4 ${
                    devolucao.codigo_do_dia || devolucao.codigo_autorizacao
                      ? 'border-emerald-500/30 bg-emerald-500/10'
                      : 'border-amber-500/30 bg-amber-500/10'
                  }`}
                >
                  {/* O código do dia manda.
                      O Mercado Livre gera um por vendedor e por dia, e ele
                      libera todas as devoluções daquele vendedor naquele dia.
                      O código guardado na devolução é do modelo antigo —
                      continua aparecendo quando não há o de hoje, para não
                      perder o que o vendedor já informou. */}
                  {devolucao.codigo_do_dia || devolucao.codigo_autorizacao ? (
                    <>
                      <p className="text-xs text-emerald-300/80">
                        {devolucao.codigo_do_dia
                          ? 'Código de hoje deste vendedor — informe ao motorista'
                          : 'Código informado nesta devolução — informe ao motorista'}
                      </p>

                      <p className="font-mono text-2xl font-bold tracking-widest text-emerald-200 mt-1">
                        {devolucao.codigo_do_dia ?? devolucao.codigo_autorizacao}
                      </p>

                      {devolucao.codigo_do_dia && (
                        <p className="text-xs text-emerald-300/70 mt-1">
                          Vale para todas as devoluções deste vendedor hoje.
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-amber-200">
                        O vendedor ainda não mandou o código de hoje
                      </p>

                      <p className="text-sm text-amber-200/80 mt-1 leading-relaxed">
                        O Mercado Livre gera um código por dia para ele, e esse
                        mesmo código libera todas as devoluções dele hoje. Sem
                        ele o motorista não entrega — e são duas tentativas.
                      </p>

                      {devolucao.vendedor_whatsapp && (
                        <a
                          href={`https://wa.me/55${devolucao.vendedor_whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                            `Olá! Chegou a devolução de "${devolucao.produto}" aqui no nosso CD. Preciso do código de autorização que o Mercado Livre te enviou para liberar o motorista. Pode mandar? Você também pode colar o código direto no FORNEXA, na tela de Pedidos.`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 mt-3 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-95"
                        >
                          Cobrar o código no WhatsApp
                        </a>
                      )}
                    </>
                  )}

                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <button
                      type="button"
                      onClick={() => registrarTentativa(devolucao)}
                      disabled={salvandoId === devolucao.id}
                      className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5 disabled:opacity-50"
                    >
                      Motorista veio e não entregou
                    </button>

                    {Number(devolucao.tentativas ?? 0) > 0 && (
                      <span
                        className={`text-xs font-semibold ${
                          Number(devolucao.tentativas) >= 2
                            ? 'text-red-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {Number(devolucao.tentativas) >= 2
                          ? 'Duas tentativas usadas — o produto pode estar perdido'
                          : '1 tentativa usada, resta uma'}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* O valor pago fica à vista enquanto não voltar: é o que
                  separa a devolução resolvida da que ainda deve dinheiro. */}
              {devolucao.pago_em && (
                <div className="flex flex-wrap items-center gap-3 mt-4">
                  {devolucao.reembolsado_em ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                        Reembolsado em{' '}
                        {new Date(devolucao.reembolsado_em).toLocaleDateString('pt-BR')}
                      </span>

                      <button
                        type="button"
                        onClick={() => marcarReembolso(devolucao, false)}
                        disabled={salvandoId === devolucao.id}
                        className="text-xs font-semibold text-slate-400 underline underline-offset-2 hover:text-white disabled:opacity-50"
                      >
                        desfazer
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => marcarReembolso(devolucao, true)}
                      disabled={salvandoId === devolucao.id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/30 px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {salvandoId === devolucao.id && (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      )}
                      Marcar reembolso
                    </button>
                  )}
                </div>
              )}

              {esperando && (
                <div className="flex flex-col sm:flex-row gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => responder(devolucao, 'recebida')}
                    disabled={salvandoId === devolucao.id}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-navy-900 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50"
                  >
                    {salvandoId === devolucao.id && (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    )}
                    Recebi — embalagem ok
                  </button>

                  <button
                    type="button"
                    onClick={() => responder(devolucao, 'avariada')}
                    disabled={salvandoId === devolucao.id}
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50"
                  >
                    Recebi — embalagem danificada
                  </button>

                  <button
                    type="button"
                    onClick={() => responder(devolucao, 'nao_chegou')}
                    disabled={salvandoId === devolucao.id}
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50"
                  >
                    Não chegou
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
        </section>
      ))}
    </div>
  );
}
