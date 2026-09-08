import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, UserCog, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Perfil {
  user_id: string;
  nome: string | null;
  email: string | null;
  empresa: string | null;
  whatsapp: string | null;
  papel: string | null;
  plano: string | null;
  plano_status: string | null;
  criado_em: string;
}

/**
 * O perfil de um cliente, para o admin ver e corrigir.
 *
 * Nome, loja e WhatsApp aparecem em todo pedido que chega ao fornecedor. Vindo
 * errados, quem sofre é o fornecedor — que não acha o vendedor — e o vendedor
 * não descobre sozinho que o problema é esse.
 *
 * Vive em dois lugares: na conversa de suporte, onde o erro costuma aparecer, e
 * na lista de contas. Uma conversa serve para descobrir o problema; corrigir
 * ali mesmo é o que a encerra.
 *
 * O e-mail tem botão próprio: é a chave da conta, não um dado de contato, e
 * trocar errado tranca a pessoa do lado de fora. A senha fica de fora, e é
 * decisão — ninguém deve poder trocar a senha do outro. Para entrar na conta
 * existe o modo suporte, que é explícito e registrado.
 */
export default function PerfilDoCliente({
  userId,
  onFechar,
}: {
  userId: string;
  onFechar: () => void;
}) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState('');

  const [nome, setNome] = useState('');

  /**
   * O e-mail de entrada.
   *
   * Separado dos outros três porque é outra natureza: nome e loja são como o
   * fornecedor te chama; o e-mail é a chave da conta. Trocar errado tranca a
   * pessoa do lado de fora, então tem botão próprio e confirmação.
   */
  const [email, setEmail] = useState('');
  const [trocandoEmail, setTrocandoEmail] = useState(false);
  const [empresa, setEmpresa] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  useEffect(() => {
    const carregar = async () => {
      const { data, error } = await supabase.rpc('admin_perfil_do_usuario', {
        p_user_id: userId,
      });

      setCarregando(false);

      if (error) {
        setErro(`Não foi possível carregar: ${error.message}`);
        return;
      }

      const linha = (data as Perfil[] | null)?.[0];

      if (!linha) {
        setErro('Perfil não encontrado.');
        return;
      }

      setPerfil(linha);
      setNome(linha.nome ?? '');
      setEmail(linha.email ?? '');
      setEmpresa(linha.empresa ?? '');
      setWhatsapp(linha.whatsapp ?? '');
    };

    carregar();
  }, [userId]);

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    setSalvo(false);

    const { data, error } = await supabase.rpc('admin_atualiza_perfil', {
      p_user_id: userId,
      p_nome: nome,
      p_empresa: empresa,
      p_whatsapp: whatsapp,
    });

    setSalvando(false);

    const resposta = data as { ok?: boolean; erro?: string } | null;

    if (error || !resposta?.ok) {
      setErro(error?.message ?? resposta?.erro ?? 'Não foi possível salvar.');
      return;
    }

    setSalvo(true);
    window.setTimeout(() => setSalvo(false), 3000);
  };

  const trocarEmail = async () => {
    if (!perfil) return;

    const novo = email.trim().toLowerCase();

    if (novo === (perfil.email ?? '').toLowerCase()) return;

    const certeza = window.confirm(
      `Trocar o e-mail de entrada de ${perfil.email} para ${novo}?

` +
        'A pessoa passa a entrar com o endereço novo, e o antigo deixa de ' +
        'funcionar na hora. A senha continua a mesma.'
    );

    if (!certeza) return;

    setTrocandoEmail(true);
    setErro('');
    setSalvo(false);

    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
      'admin-trocar-email',
      { body: { user_id: userId, email: novo } }
    );

    setTrocandoEmail(false);

    if (error || !data?.ok) {
      // Em resposta não-2xx o supabase-js não popula "data": o corpo real vem
      // em error.context. Mesmo cuidado das outras telas.
      let mensagem = data?.error;

      const contexto = (
        error as { context?: { json?: () => Promise<{ error?: string }> } } | null
      )?.context;

      if (!mensagem && contexto?.json) {
        try {
          mensagem = (await contexto.json())?.error;
        } catch {
          // segue com a genérica
        }
      }

      setErro(mensagem ?? 'Não foi possível trocar o e-mail.');
      return;
    }

    setPerfil({ ...perfil, email: novo });
    setSalvo(true);
    window.setTimeout(() => setSalvo(false), 3000);
  };

  const campo =
    'w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-900 text-navy-900 dark:text-white text-sm';

  const rotulo =
    'block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide';

  return (
    <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-navy-700 w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto shadow-xl">
        <div className="p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold text-navy-900 dark:text-white text-lg flex items-center gap-2">
              <UserCog className="w-5 h-5 text-gold" aria-hidden="true" />
              Perfil do cliente
            </p>

            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar"
              className="p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {carregando ? (
            <div className="py-10 text-center">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin mx-auto" />
            </div>
          ) : (
            <>
              {perfil && (
                <div className="mt-4 rounded-xl bg-gray-50 dark:bg-navy-700 px-4 py-3">
                  <label htmlFor="cliente-email" className={rotulo}>
                    E-mail de entrada
                  </label>

                  <div className="flex items-center gap-2 mt-1">
                    <input
                      id="cliente-email"
                      value={email}
                      onChange={(evento) => setEmail(evento.target.value)}
                      inputMode="email"
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-900 text-navy-900 dark:text-white text-sm"
                    />

                    <button
                      type="button"
                      onClick={trocarEmail}
                      disabled={
                        trocandoEmail ||
                        !email.trim() ||
                        email.trim().toLowerCase() === (perfil.email ?? '').toLowerCase()
                      }
                      className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-xs font-semibold transition-colors disabled:opacity-40"
                    >
                      {trocandoEmail && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Trocar
                    </button>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 leading-relaxed">
                    É com ele que a pessoa entra. Trocando, o antigo para de
                    funcionar na hora e a senha continua a mesma.
                  </p>

                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 pt-2 border-t border-gray-200 dark:border-navy-600">
                    {perfil.papel === 'admin' ? 'Administrador' : 'Vendedor'}
                    {perfil.plano ? ` · ${perfil.plano} (${perfil.plano_status || '—'})` : ''}
                    {' · desde '}
                    {new Date(perfil.criado_em).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              )}

              <p className="text-sm text-gray-500 dark:text-slate-400 mt-4 leading-relaxed">
                Estes três aparecem em todo pedido que chega ao fornecedor. É o
                que ele usa para saber de quem é a venda.
              </p>

              <div className="space-y-3 mt-4">
                <div>
                  <label htmlFor="cliente-nome" className={rotulo}>
                    Nome
                  </label>

                  <input
                    id="cliente-nome"
                    value={nome}
                    onChange={(evento) => setNome(evento.target.value)}
                    className={campo}
                  />
                </div>

                <div>
                  <label htmlFor="cliente-empresa" className={rotulo}>
                    Loja ou empresa
                  </label>

                  <input
                    id="cliente-empresa"
                    value={empresa}
                    onChange={(evento) => setEmpresa(evento.target.value)}
                    className={campo}
                  />
                </div>

                <div>
                  <label htmlFor="cliente-whatsapp" className={rotulo}>
                    WhatsApp
                  </label>

                  <input
                    id="cliente-whatsapp"
                    value={whatsapp}
                    onChange={(evento) => setWhatsapp(evento.target.value)}
                    inputMode="tel"
                    className={campo}
                  />
                </div>
              </div>

              {erro && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 mt-4">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed">
                    {erro}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3 mt-5">
                <button
                  type="button"
                  onClick={salvar}
                  disabled={salvando || !nome.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-gold text-white dark:text-navy-900 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                  Salvar
                </button>

                {salvo && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                    <Check className="w-4 h-4" />
                    Salvo
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-500 dark:text-slate-400 mt-4 leading-relaxed">
                A senha não é alterada por aqui, e nem deveria: ninguém deve
                poder trocar a senha do outro. Se a pessoa não lembra, ela usa
                "esqueci minha senha" — que agora vai para o endereço certo.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
