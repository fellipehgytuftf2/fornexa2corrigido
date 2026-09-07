import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AvisoNaLista {
  id: string;
  titulo: string;
  corpo: string;
  ativo: boolean;
  criado_em: string;
  alvo_criados_ate: string | null;
  alvo_criados_desde: string | null;
  leram: number;
  alcance: number;
}

/**
 * Onde o admin escreve os avisos que aparecem uma vez para cada vendedor.
 *
 * O recorte é por data de criação da conta porque é o que estes avisos pedem:
 * "quem entrou antes de X" são as pessoas que configuraram alguma coisa sob a
 * regra antiga. Quem chegou depois já encontrou o sistema pronto.
 *
 * A contagem de leituras é o que torna isto útil depois de publicar: sem ela
 * não há como saber se o recado chegou nem a quem cobrar.
 */
export default function AvisosAdmin() {
  const [avisos, setAvisos] = useState<AvisoNaLista[]>([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [abrirFormulario, setAbrirFormulario] = useState(false);

  const [titulo, setTitulo] = useState('');
  const [corpo, setCorpo] = useState('');
  const [linkRotulo, setLinkRotulo] = useState('');
  const [linkPara, setLinkPara] = useState('');
  const [criadosAte, setCriadosAte] = useState('');

  const carregar = async () => {
    const { data, error } = await supabase.rpc('admin_listar_avisos');

    if (error) {
      setErro(`Não foi possível carregar os avisos: ${error.message}`);
      return;
    }

    setAvisos((data as AvisoNaLista[]) || []);
  };

  useEffect(() => {
    carregar();
  }, []);

  const publicar = async () => {
    setSalvando(true);
    setErro('');

    const { data, error } = await supabase.rpc('admin_criar_aviso', {
      p_titulo: titulo,
      p_corpo: corpo,
      p_link_rotulo: linkRotulo || null,
      p_link_para: linkPara || null,
      // Fim do dia escolhido: quem criou a conta às 23h daquele dia entrou sob
      // a regra antiga tanto quanto quem criou às 8h.
      p_alvo_criados_ate: criadosAte ? `${criadosAte}T23:59:59` : null,
      p_alvo_criados_desde: null,
    });

    setSalvando(false);

    const resposta = data as { ok?: boolean; erro?: string } | null;

    if (error || !resposta?.ok) {
      setErro(error?.message ?? resposta?.erro ?? 'Não foi possível publicar.');
      return;
    }

    setTitulo('');
    setCorpo('');
    setLinkRotulo('');
    setLinkPara('');
    setCriadosAte('');
    setAbrirFormulario(false);
    carregar();
  };

  const alternar = async (aviso: AvisoNaLista) => {
    await supabase.rpc('admin_alternar_aviso', {
      p_aviso_id: aviso.id,
      p_ativo: !aviso.ativo,
    });

    carregar();
  };

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-navy-900 dark:text-white flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-gold" aria-hidden="true" />
            Avisos
          </h2>

          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Aparecem uma vez para cada vendedor, ao abrir o painel.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAbrirFormulario((aberto) => !aberto)}
          className="px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-gold text-white dark:text-navy-900 text-sm font-semibold hover:opacity-90"
        >
          {abrirFormulario ? 'Cancelar' : 'Novo aviso'}
        </button>
      </div>

      {erro && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-3 leading-relaxed">{erro}</p>
      )}

      {abrirFormulario && (
        <div className="mt-5 space-y-3 rounded-xl border border-gray-200 dark:border-navy-600 p-4">
          <input
            value={titulo}
            onChange={(evento) => setTitulo(evento.target.value)}
            placeholder="Título"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-900 text-navy-900 dark:text-white"
          />

          <textarea
            value={corpo}
            onChange={(evento) => setCorpo(evento.target.value)}
            placeholder="O que o vendedor precisa fazer, e por quê."
            rows={5}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-900 text-navy-900 dark:text-white leading-relaxed"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                Botão (opcional)
              </label>

              <input
                value={linkRotulo}
                onChange={(evento) => setLinkRotulo(evento.target.value)}
                placeholder="Ver integrações"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-900 text-navy-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                Leva para
              </label>

              <input
                value={linkPara}
                onChange={(evento) => setLinkPara(evento.target.value)}
                placeholder="/dashboard/integrations"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-900 text-navy-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
              Só para contas criadas até
            </label>

            <input
              type="date"
              value={criadosAte}
              onChange={(evento) => setCriadosAte(evento.target.value)}
              className="mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-900 text-navy-900 dark:text-white"
            />

            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
              Vazio = todos os vendedores. Com data, só quem já tinha conta
              nesse dia — quem chegou depois não vê.
            </p>
          </div>

          <button
            type="button"
            onClick={publicar}
            disabled={salvando || !titulo.trim() || !corpo.trim()}
            className="px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-gold text-white dark:text-navy-900 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? 'Publicando...' : 'Publicar aviso'}
          </button>
        </div>
      )}

      <ul className="mt-5 space-y-2">
        {avisos.length === 0 && (
          <li className="text-sm text-gray-500 dark:text-slate-400">
            Nenhum aviso publicado ainda.
          </li>
        )}

        {avisos.map((aviso) => (
          <li
            key={aviso.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-navy-600 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-medium text-navy-900 dark:text-white">{aviso.titulo}</p>

              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                {aviso.leram} de {aviso.alcance} leram
                {aviso.alvo_criados_ate &&
                  ` · contas criadas até ${new Date(
                    aviso.alvo_criados_ate
                  ).toLocaleDateString('pt-BR')}`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => alternar(aviso)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-xs font-semibold transition-colors"
            >
              {aviso.ativo ? 'Parar de mostrar' : 'Mostrar de novo'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
