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
