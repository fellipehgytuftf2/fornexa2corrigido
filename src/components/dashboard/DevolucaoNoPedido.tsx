import { useState } from 'react';
import { AlertCircle, Check, Copy, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ModalPortal from '../ui/modal-portal';

export interface Devolucao {
  id: string;
  order_id: string;
  motivo: string;
  codigo_devolucao: string | null;
  status: 'avisada' | 'recebida' | 'avariada' | 'nao_chegou' | 'revendida';
  avisada_em: string;
  prazo_cd: string | null;
  recebida_em: string | null;
  observacao_fornecedor: string | null;
}

interface Props {
  order: {
    id: string;
    product_name: string;
    tracking_code: string | null;
  };
  devolucao?: Devolucao;
  onMudou: () => void;
}

const MOTIVOS: { valor: string; rotulo: string }[] = [
  { valor: 'arrependimento', rotulo: 'Arrependimento do comprador' },
  { valor: 'nao_entregue', rotulo: 'Não entregue / devolvido pelos Correios' },
  { valor: 'defeito', rotulo: 'Defeito de fabricação' },
  { valor: 'produto_errado', rotulo: 'Produto errado' },
];

const rotuloDoMotivo = (valor: string) =>
  MOTIVOS.find((motivo) => motivo.valor === valor)?.rotulo ?? valor;

const ETAPAS: Record<Devolucao['status'], string> = {
  avisada: 'Avisada',
  recebida: 'Recebida no CD',
  avariada: 'Recebida com avaria',
  nao_chegou: 'Não chegou',
  revendida: 'Vendida de novo',
};

/**
 * Quantos dias úteis faltam até a data — negativo quando já passou.
 *
 * Conta do mesmo jeito que o banco: pula sábado e domingo, ignora feriado. Um
 * prazo um dia mais curto que o real erra para o lado seguro.
 */
function diasUteisAte(data: string): number {
  const alvo = new Date(`${data}T00:00:00`);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  if (alvo.getTime() === hoje.getTime()) {
    return 0;
  }

  const paraFrente = alvo > hoje;
  const passo = paraFrente ? 1 : -1;
  const cursor = new Date(hoje);
  let dias = 0;

  while (cursor.getTime() !== alvo.getTime()) {
    cursor.setDate(cursor.getDate() + passo);

    const semana = cursor.getDay();
    if (semana !== 0 && semana !== 6) {
      dias += 1;
    }
  }

  return paraFrente ? dias : -dias;
}

/**
 * A devolução dentro do pedido.
 *
 * Sem devolução aberta, é só um botão. Com uma aberta, vira o acompanhamento —
 * onde está, e quanto falta do prazo que o fornecedor dá para o produto chegar
 * no CD dele.
 *
 * O prazo é o coração disto. A regra da MS Digital é de 2 dias úteis a partir
 * da confirmação da entrega, e passar dele significa perder o produto que o
 * vendedor já pagou.
 */
export default function DevolucaoNoPedido({
  order,
  devolucao,
  onMudou,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState(MOTIVOS[0].valor);
  const [codigo, setCodigo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);

  const mensagem = (dados: { motivo: string; codigo: string | null }) =>
    [
      `Cód Rastreio: ${order.tracking_code || '—'}`,
      `Nº Pedido: ${order.id.slice(0, 8)}`,
      `Produto: ${order.product_name}`,
      `Motivo da devolução: ${rotuloDoMotivo(dados.motivo)}`,
      `Cód devolução se houver: ${dados.codigo || '—'}`,
    ].join('\n');

  const registrar = async () => {
    setSalvando(true);
    setErro('');

    const { error } = await supabase.rpc('registrar_devolucao', {
      p_order_id: order.id,
      p_motivo: motivo,
      p_codigo: codigo.trim() || null,
    });

    setSalvando(false);

    if (error) {
      setErro(`Não foi possível registrar: ${error.message}`);
      return;
    }

    setAberto(false);
    setCodigo('');
    onMudou();
  };

  const copiar = async (texto: string) => {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1600);
  };

  // Já registrada: mostra onde está e quanto falta.
  if (devolucao) {
    const texto = mensagem({
      motivo: devolucao.motivo,
      codigo: devolucao.codigo_devolucao,
    });

    const esperando = devolucao.status === 'avisada';
    const restam = devolucao.prazo_cd ? diasUteisAte(devolucao.prazo_cd) : null;
    const venceu = esperando && restam !== null && restam < 0;

    return (
      <div
        className={`mt-5 rounded-xl border p-4 ${
          venceu
            ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
            : 'border-gray-200 dark:border-navy-600 bg-gray-50 dark:bg-navy-700/40'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <RotateCcw className="w-4 h-4 text-gray-500 dark:text-slate-400" aria-hidden="true" />

          <span className="text-sm font-semibold text-navy-900 dark:text-white">
            Devolução · {ETAPAS[devolucao.status]}
          </span>

          <span className="text-sm text-gray-500 dark:text-slate-400">
            {rotuloDoMotivo(devolucao.motivo)}
          </span>
        </div>

        {esperando && restam !== null && (
          <p
            className={`text-sm mt-2 ${
              venceu
                ? 'text-red-700 dark:text-red-400 font-medium'
                : 'text-gray-600 dark:text-slate-300'
            }`}
          >
            {venceu
              ? `Prazo do CD venceu em ${new Date(
                  `${devolucao.prazo_cd}T00:00:00`
                ).toLocaleDateString('pt-BR')}. Fale com o fornecedor antes de contar com este produto.`
              : restam === 0
                ? 'Prazo do CD vence hoje.'
                : `Prazo do CD: falta${restam > 1 ? 'm' : ''} ${restam} dia${
                    restam > 1 ? 's' : ''
                  } útil${restam > 1 ? 'eis' : ''}.`}
          </p>
        )}

        {devolucao.status === 'avariada' && (
          <p className="text-sm text-amber-700 dark:text-amber-400 mt-2">
            O fornecedor recebeu com a embalagem danificada. Confirme com ele se
            ainda dá para vender de novo.
          </p>
        )}

        {devolucao.observacao_fornecedor && (
          <p className="text-sm text-gray-600 dark:text-slate-300 mt-2">
            Fornecedor: {devolucao.observacao_fornecedor}
          </p>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={() => copiar(texto)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-white dark:hover:bg-navy-700 text-xs font-semibold transition-colors"
          >
            {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copiado ? 'Copiado' : 'Copiar mensagem'}
          </button>
        </div>
      </div>
    );
  }

  const previa = mensagem({ motivo, codigo: codigo.trim() || null });

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors"
      >
        <RotateCcw className="w-4 h-4" />
        Registrar devolução
      </button>

      {aberto && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-navy-800 rounded-2xl w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto shadow-2xl">
              <div className="p-5 border-b border-gray-200 dark:border-navy-700">
                <h3 className="text-lg font-semibold text-navy-900 dark:text-white">
                  Registrar devolução
                </h3>

                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                  Avise o fornecedor assim que a devolução for confirmada. O prazo
                  para o produto chegar no CD é de 2 dias úteis.
                </p>
              </div>

              <div className="p-5 space-y-5">
                {erro && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300">{erro}</p>
                  </div>
                )}

                <fieldset>
                  <legend className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                    Motivo
                  </legend>

                  <div className="space-y-2">
                    {MOTIVOS.map((item) => (
                      <label
                        key={item.valor}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-navy-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-navy-700"
                      >
                        <input
                          type="radio"
                          name="motivo-devolucao"
                          value={item.valor}
                          checked={motivo === item.valor}
                          onChange={(evento) => setMotivo(evento.target.value)}
                          className="accent-black dark:accent-white"
                        />

                        <span className="text-sm text-navy-900 dark:text-white">
                          {item.rotulo}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label
                    htmlFor="codigo-devolucao"
                    className="block text-sm font-medium text-navy-900 dark:text-white mb-2"
                  >
                    Código da devolução (se houver)
                  </label>

                  <input
                    id="codigo-devolucao"
                    value={codigo}
                    onChange={(evento) => setCodigo(evento.target.value)}
                    placeholder="Ex: DEV99201"
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  />
                </div>

                {/* A mensagem já montada, no formato que o fornecedor pediu. É
                    o ponto todo desta tela: o vendedor não digita nada disso. */}
                <div>
                  <p className="text-sm font-medium text-navy-900 dark:text-white mb-2">
                    Mensagem para o fornecedor
                  </p>

                  <pre className="text-xs text-navy-900 dark:text-slate-200 bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-xl p-4 whitespace-pre-wrap break-words">
                    {previa}
                  </pre>

                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => copiar(previa)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-xs font-semibold transition-colors"
                    >
                      {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiado ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-5 border-t border-gray-200 dark:border-navy-700 flex flex-col sm:flex-row gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  disabled={salvando}
                  className="px-4 py-3 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={registrar}
                  disabled={salvando}
                  className="px-4 py-3 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {salvando ? 'Registrando...' : 'Registrar devolução'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
