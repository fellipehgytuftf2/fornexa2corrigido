import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, UserCog } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * O perfil incompleto, cobrado antes de qualquer outra coisa.
 *
 * POR QUE ISTO É OBRIGATÓRIO, E NÃO UM AVISO
 *
 * Nome, loja e WhatsApp aparecem em todo pedido que chega ao fornecedor. Sem
 * eles, ele vê uma venda e não sabe de quem é — e com vários vendedores no
 * mesmo fornecedor, os pedidos viram um monte sem dono. Quando dá problema
 * numa entrega, não há a quem recorrer.
 *
 * Enquanto isso era um card em Configurações, metade das contas ficava pela
 * metade: ninguém abre Configurações sem motivo, e o custo de não preencher
 * caía sobre o fornecedor, não sobre quem deixou em branco.
 *
 * NÃO TEM BOTÃO DE FECHAR
 *
 * De propósito, e é o único lugar do FORNEXA assim. São três campos que o
 * vendedor sabe de cabeça, uma vez na vida da conta. Um "depois eu faço" aqui
 * é exatamente o que produziu as contas incompletas que existem hoje.
 */
export default function PerfilObrigatorio() {
  const [precisa, setPrecisa] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const [nome, setNome] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const conferir = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setCarregando(false);
        return;
      }

      const { data: perfil } = await supabase
        .from('profiles')
        .select('name, empresa, whatsapp, role')
        .eq('id', user.id)
        .maybeSingle<{
          name: string | null;
          empresa: string | null;
          whatsapp: string | null;
          role: string | null;
        }>();

      setCarregando(false);

      // Admin não vende, e fornecedor entra por outro portal. Cobrar dados de
      // contato comercial de quem não tem fornecedor seria pedir por pedir.
      if (!perfil || perfil.role === 'admin') return;

      setNome(perfil.name ?? '');
      setEmpresa(perfil.empresa ?? '');
      setWhatsapp(perfil.whatsapp ?? '');

      setPrecisa(
        !perfil.name?.trim() || !perfil.empresa?.trim() || !perfil.whatsapp?.trim()
      );
    };

    conferir();
  }, []);

  const salvar = async () => {
    setSalvando(true);
    setErro('');

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSalvando(false);
      setErro('Faça login novamente.');
      return;
    }

    // `.select()` para saber se alguma linha mudou de verdade: sem policy de
    // UPDATE o banco não devolve erro, só não altera nada — e a tela fecharia
    // achando que salvou.
    const { data, error } = await supabase
      .from('profiles')
      .update({
        name: nome.trim(),
        empresa: empresa.trim(),
        whatsapp: whatsapp.trim(),
      })
      .eq('id', user.id)
      .select('id');

    setSalvando(false);

    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }

    if (!data || data.length === 0) {
      setErro('Nada foi salvo. Recarregue a página e tente de novo.');
      return;
    }

    setPrecisa(false);
  };

  if (carregando || !precisa) return null;

  const completo = Boolean(nome.trim() && empresa.trim() && whatsapp.trim());

  const campo =
    'w-full mt-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-900 text-navy-900 dark:text-white text-sm';

  const rotulo =
    'block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide';

  return createPortal(
    <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-navy-700 w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto shadow-xl">
        <div className="p-6">
          <p className="font-semibold text-navy-900 dark:text-white text-lg flex items-center gap-2">
            <UserCog className="w-5 h-5 text-gold" aria-hidden="true" />
            Complete seu perfil
          </p>

          <p className="text-sm text-gray-600 dark:text-slate-300 mt-2 leading-relaxed">
            Estes dados vão em todo pedido que chega ao seu fornecedor. Sem eles
            ele vê a venda e não sabe que foi você — e se der problema numa
            entrega, não tem a quem recorrer.
          </p>

          <div className="space-y-4 mt-5">
            <div>
              <label htmlFor="perfil-nome" className={rotulo}>
                Seu nome
              </label>

              <input
                id="perfil-nome"
                value={nome}
                onChange={(evento) => setNome(evento.target.value)}
                className={campo}
              />
            </div>

            <div>
              <label htmlFor="perfil-empresa" className={rotulo}>
                Nome da sua loja ou empresa
              </label>

              <input
                id="perfil-empresa"
                value={empresa}
                onChange={(evento) => setEmpresa(evento.target.value)}
                placeholder="Ex.: Teodoro Comércio"
                className={campo}
              />
            </div>

            <div>
              <label htmlFor="perfil-whatsapp" className={rotulo}>
                WhatsApp
              </label>

              <input
                id="perfil-whatsapp"
                value={whatsapp}
                onChange={(evento) => setWhatsapp(evento.target.value)}
                placeholder="(11) 90000-0000"
                inputMode="tel"
                className={campo}
              />

              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                O fornecedor vê este número. O comprador nunca.
              </p>
            </div>
          </div>

          {erro && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 mt-4">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed">{erro}</p>
            </div>
          )}

          <button
            type="button"
            onClick={salvar}
            disabled={salvando || !completo}
            className="inline-flex items-center gap-2 mt-6 px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-gold text-white dark:text-navy-900 text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar e continuar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
