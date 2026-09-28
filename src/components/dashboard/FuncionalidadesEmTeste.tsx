import { useEffect, useState } from 'react';
import { FlaskConical, Loader2, Plus, RefreshCw, UserMinus, UserPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Funcionalidade {
  chave: string;
  titulo: string;
  descricao: string | null;
  para_todos: boolean;
  liberados: number;
  criada_em: string;
}

interface Liberado {
  user_id: string;
  email: string | null;
  nome: string | null;
  liberada_em: string;
}

/**
 * As novidades em teste, e quem as enxerga.
 *
 * POR QUE EXISTE
 *
 * Testar com dado de verdade exige estar em produção, e estar em produção
 * costumava significar todo mundo vendo metade pronta. Aqui a novidade sobe
 * desligada: o admin libera para si e para quem escolher, e abre para todos
 * quando estiver pronta — sem deploy, e podendo fechar de volta.
 */
export default function FuncionalidadesEmTeste() {
  const [lista, setLista] = useState<Funcionalidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [mexendo, setMexendo] = useState<string | null>(null);

  const [novaChave, setNovaChave] = useState('');
  const [novoTitulo, setNovoTitulo] = useState('');

  const [aberta, setAberta] = useState<string | null>(null);
  const [liberados, setLiberados] = useState<Liberado[]>([]);
  const [email, setEmail] = useState('');

  const carregar = async () => {
    setCarregando(true);
    setErro('');

    const { data, error } = await supabase.rpc('admin_funcionalidades');

    setCarregando(false);

    if (error) {
      setErro(`Não foi possível carregar: ${error.message}`);
      return;
    }

    setLista((data as Funcionalidade[]) || []);
  };

  useEffect(() => {
    carregar();
  }, []);

  /** Só busca. Quem abre e fecha é o `verLiberados`. */
  const buscarLiberados = async (chave: string) => {
    const { data } = await supabase.rpc('admin_liberados_da_funcionalidade', {
      p_chave: chave,
    });

    setLiberados((data as Liberado[]) || []);
  };

  const verLiberados = async (chave: string) => {
    const fechando = aberta === chave;

    setAberta(fechando ? null : chave);
    setEmail('');

    if (fechando) return;

    await buscarLiberados(chave);
  };

  const criar = async () => {
    setMexendo('nova');
    setErro('');

    const { data, error } = await supabase.rpc('admin_criar_funcionalidade', {
      p_chave: novaChave,
      p_titulo: novoTitulo,
      p_descricao: null,
    });

    setMexendo(null);

    const resposta = data as { ok?: boolean; erro?: string } | null;

    if (error || resposta?.ok === false) {
      setErro(error?.message ?? resposta?.erro ?? 'Não foi possível criar.');
      return;
    }

    setNovaChave('');
    setNovoTitulo('');
    await carregar();
  };

  const lancar = async (funcionalidade: Funcionalidade) => {
    setMexendo(funcionalidade.chave);
    setErro('');

    const { error } = await supabase.rpc('admin_lancar_funcionalidade', {
      p_chave: funcionalidade.chave,
      p_para_todos: !funcionalidade.para_todos,
    });

    setMexendo(null);

    if (error) {
      setErro(`Não foi possível: ${error.message}`);
      return;
    }

    await carregar();
  };

  const liberarConta = async (chave: string, liberar: boolean, alvo: string) => {
    setMexendo(chave);
    setErro('');

    const { data, error } = await supabase.rpc('admin_liberar_funcionalidade', {
      p_chave: chave,
      p_email: alvo,
      p_liberar: liberar,
    });

    setMexendo(null);

    const resposta = data as { ok?: boolean; erro?: string } | null;

    if (error || resposta?.ok === false) {
      setErro(error?.message ?? resposta?.erro ?? 'Não foi possível.');
      return;
    }

    setEmail('');
    await buscarLiberados(chave);
    await carregar();
  };

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-navy-900 dark:text-white flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-gold" aria-hidden="true" />
            Novidades em teste
          </h2>

          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Sobem desligadas. Você enxerga sempre; os outros, só quem você
            liberar — até abrir para todos.
          </p>
        </div>

        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {erro && <p className="text-sm text-red-600 dark:text-red-400 mt-3">{erro}</p>}

      {/* Criar vem primeiro: a lista só existe depois que alguém cria a
          primeira, e uma tela vazia sem caminho é uma tela quebrada. */}
      <div className="flex flex-col sm:flex-row gap-2 mt-5">
        <input
          id="nova-funcionalidade-titulo"
          value={novoTitulo}
          onChange={(evento) => setNovoTitulo(evento.target.value)}
          placeholder="Nome da novidade"
          className="flex-1 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-sm text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
        />

        <input
          id="nova-funcionalidade-chave"
          value={novaChave}
          onChange={(evento) => setNovaChave(evento.target.value)}
          placeholder="chave-no-codigo"
          className="flex-1 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-sm font-mono text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
        />

        <button
          type="button"
          onClick={criar}
          disabled={mexendo === 'nova' || !novoTitulo.trim() || !novaChave.trim()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-gold text-white dark:text-navy-900 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {mexendo === 'nova' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Criar
        </button>
      </div>

      <ul className="mt-5 space-y-3">
        {lista.length === 0 && !carregando && (
          <li className="text-sm text-gray-500 dark:text-slate-400">
            Nenhuma novidade em teste. Crie uma acima e use a chave no código.
          </li>
        )}

        {lista.map((funcionalidade) => (
          <li
            key={funcionalidade.chave}
            className="rounded-xl border border-gray-200 dark:border-navy-600 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-navy-900 dark:text-white">
                  {funcionalidade.titulo}

                  <span
                    className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      funcionalidade.para_todos
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                    }`}
                  >
                    {funcionalidade.para_todos ? 'No ar para todos' : 'Em teste'}
                  </span>
                </p>

                <p className="font-mono text-xs text-gray-500 dark:text-slate-400 mt-1">
                  {funcionalidade.chave}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => verLiberados(funcionalidade.chave)}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm font-semibold hover:bg-gray-50 dark:hover:bg-navy-700"
                >
                  {funcionalidade.liberados} liberado(s)
                </button>

                <button
                  type="button"
                  onClick={() => lancar(funcionalidade)}
                  disabled={mexendo === funcionalidade.chave}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${
                    funcionalidade.para_todos
                      ? 'border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700'
                      : 'bg-navy-900 dark:bg-gold text-white dark:text-navy-900 hover:opacity-90'
                  }`}
                >
                  {funcionalidade.para_todos ? 'Voltar para teste' : 'Lançar para todos'}
                </button>
              </div>
            </div>

            {aberta === funcionalidade.chave && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-navy-600">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id={`liberar-${funcionalidade.chave}`}
                    value={email}
                    onChange={(evento) => setEmail(evento.target.value)}
                    placeholder="e-mail da conta que vai testar"
                    className="flex-1 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-sm text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  />

                  <button
                    type="button"
                    onClick={() => liberarConta(funcionalidade.chave, true, email)}
                    disabled={!email.trim() || mexendo === funcionalidade.chave}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-gold text-white dark:text-navy-900 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    Liberar
                  </button>
                </div>

                <ul className="mt-3 space-y-2">
                  {liberados.length === 0 && (
                    <li className="text-sm text-gray-500 dark:text-slate-400">
                      Ninguém liberado além de você.
                    </li>
                  )}

                  {liberados.map((pessoa) => (
                    <li
                      key={pessoa.user_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-navy-700/60 px-3 py-2"
                    >
                      <span className="min-w-0 text-sm text-navy-900 dark:text-white truncate">
                        {pessoa.nome || pessoa.email}
                        <span className="text-gray-500 dark:text-slate-400"> · {pessoa.email}</span>
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          liberarConta(funcionalidade.chave, false, pessoa.email ?? '')
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:underline"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                        Tirar
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
