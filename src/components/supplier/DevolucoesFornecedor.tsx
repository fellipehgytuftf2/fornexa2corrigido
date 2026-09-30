import { useEffect, useState } from 'react';
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
}

const MOTIVOS: Record<string, string> = {
  arrependimento: 'Arrependimento do comprador',
  nao_entregue: 'Não entregue / devolvido pelos Correios',
  defeito: 'Defeito de fabricação',
  produto_errado: 'Produto errado',
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

      <ul className="space-y-3">
        {devolucoes.map((devolucao) => {
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
                  ser lido de longe, com o motorista esperando. */}
              {esperando && (
                <div
                  className={`mt-4 rounded-xl border p-4 ${
                    devolucao.codigo_autorizacao
                      ? 'border-emerald-500/30 bg-emerald-500/10'
                      : 'border-amber-500/30 bg-amber-500/10'
                  }`}
                >
                  {devolucao.codigo_autorizacao ? (
                    <>
                      <p className="text-xs text-emerald-300/80">
                        Código de autorização — informe ao motorista
                      </p>

                      <p className="font-mono text-2xl font-bold tracking-widest text-emerald-200 mt-1">
                        {devolucao.codigo_autorizacao}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-amber-200">
                        O vendedor ainda não mandou o código
                      </p>

                      <p className="text-sm text-amber-200/80 mt-1 leading-relaxed">
                        O Mercado Livre manda esse código a ele no dia da
                        entrega. Sem o código, o motorista não entrega — e são
                        duas tentativas.
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
    </div>
  );
}
