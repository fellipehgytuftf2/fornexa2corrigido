import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  CreditCard,
  Lock,
  Mail,
  Moon,
  Phone,
  Store,
  Sun,
  User,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface SettingsProps {
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
}

const planoLabels: Record<string, string> = {
  free: 'Gratuito',
  basico: 'Básico',
  start: 'Start',
  pro: 'Pro',
  premium: 'Premium',
  enterprise: 'Enterprise',
  lifetime: 'Vitalício',
};

/**
 * O nome do plano diz o que a pessoa comprou; o status diz se ela pode usar
 * hoje. Mostrar só o nome esconderia justamente a informação que ela procura
 * quando vem parar nesta tela.
 */
const statusLabels: Record<string, { texto: string; cor: string }> = {
  ativo: {
    texto: 'Em dia',
    cor: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  },
  vencido: {
    texto: 'Vencido',
    cor: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  cancelado: {
    texto: 'Cancelado',
    cor: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  },
  reembolsado: {
    texto: 'Reembolsado',
    cor: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  },
  inativo: {
    texto: 'Sem assinatura',
    cor: 'bg-gray-100 text-gray-600 dark:bg-navy-600 dark:text-slate-300',
  },
};

export default function Settings({ darkMode, setDarkMode }: SettingsProps) {
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  /**
   * Se o FORNEXA emite a Declaração de Conteúdo sozinho, quando a venda chega.
   *
   * Ligado por padrão, e é decisão, não descuido: sem a DC-e o envio fica
   * parado e o Mercado Livre cancela o pedido em 3 dias. Quem não sabe o que é
   * DC-e — a maioria — não ligaria a chave, e perderia venda por prazo.
   */
  const [dceAutomatica, setDceAutomatica] = useState(true);
  const [salvandoDce, setSalvandoDce] = useState(false);

  const [salvandoContato, setSalvandoContato] = useState(false);
  const [contatoSalvo, setContatoSalvo] = useState(false);
  const [email, setEmail] = useState('');
  const [plano, setPlano] = useState('free');
  const [statusPlano, setStatusPlano] = useState('inativo');
  const [expiraEm, setExpiraEm] = useState<string | null>(null);
  const [origemPlano, setOrigemPlano] = useState('nenhum');

  const [salvandoNome, setSalvandoNome] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const avisar = (mensagem: string) => {
    setSucesso(mensagem);
    setTimeout(() => setSucesso(''), 4000);
  };

  useEffect(() => {
    const carregar = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setCarregando(false);
        return;
      }

      setEmail(user.email || '');

      const { data: perfil } = await supabase
        .from('profiles')
        .select(
          'name, empresa, whatsapp, plan, plan_status, plan_expira_em, plan_origem, dce_automatica'
        )
        .eq('id', user.id)
        .maybeSingle<{
          name: string | null;
          empresa: string | null;
          whatsapp: string | null;
          plan: string | null;
          plan_status: string | null;
          plan_expira_em: string | null;
          plan_origem: string | null;
          dce_automatica: boolean | null;
        }>();

      const nomeAtual = perfil?.name || user.user_metadata?.name || '';

      setNome(nomeAtual);
        setEmpresa(perfil?.empresa || '');
      setWhatsapp(perfil?.whatsapp || '');
      setPlano(perfil?.plan || 'free');
      setStatusPlano(perfil?.plan_status || 'inativo');
      setExpiraEm(perfil?.plan_expira_em || null);
      setOrigemPlano(perfil?.plan_origem || 'nenhum');
      setDceAutomatica(perfil?.dce_automatica !== false);
      setCarregando(false);
    };

    carregar();
  }, []);

  /**
   * Guarda como o vendedor quer ser encontrado pelo fornecedor.
   *
   * Separado do nome de propósito: o nome é identidade da conta, isto é dado
   * comercial que aparece do outro lado, no pedido que chega ao fornecedor.
   */
  const trocarDceAutomatica = async (ligada: boolean) => {
    setSalvandoDce(true);
    setErro('');

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSalvandoDce(false);
      setErro('Faça login novamente.');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ dce_automatica: ligada })
      .eq('id', user.id);

    setSalvandoDce(false);

    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }

    setDceAutomatica(ligada);
  };

  /**
   * Salva o perfil inteiro: nome, empresa e WhatsApp.
   *
   * Um botão só porque é uma coisa só. Eram dois cards e dois botões — o
   * vendedor salvava o nome, achava que tinha terminado, e o fornecedor
   * continuava recebendo pedido sem saber de quem era.
   */
  const salvarPerfil = async () => {
    await salvarNome();
    await salvarContato();
  };

  /**
   * Os três que o fornecedor precisa, e por isso não podem ficar em branco.
   *
   * Nome, loja e WhatsApp aparecem em todo pedido que chega até ele. Sem eles
   * ele vê a venda e não sabe de quem é — e com vários vendedores no mesmo
   * fornecedor, os pedidos viram um monte sem dono.
   *
   * A exigência é só aqui, na hora de salvar. Travar publicação ou pedido por
   * causa disto atrapalharia quem está tentando trabalhar, e o problema é de
   * cadastro, não de venda.
   */
  const perfilCompleto = Boolean(nome.trim() && empresa.trim() && whatsapp.trim());

  const salvarContato = async () => {
    setSalvandoContato(true);
    setErro('');
    setContatoSalvo(false);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSalvandoContato(false);
      setErro('Faça login novamente.');
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        empresa: empresa.trim() || null,
        whatsapp: whatsapp.trim() || null,
      })
      .eq('id', user.id)
      .select('id');

    setSalvandoContato(false);

    if (error) {
      console.error('Erro ao salvar contato:', error);
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }

    if (!data || data.length === 0) {
      setErro('Nada foi salvo. Recarregue a página e tente de novo.');
      return;
    }

    setContatoSalvo(true);
    setTimeout(() => setContatoSalvo(false), 3000);
  };

  const salvarNome = async () => {
    setSalvandoNome(true);
    setErro('');

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSalvandoNome(false);
      setErro('Faça login novamente.');
      return;
    }

    // `.select()` para saber se alguma linha foi de fato alterada: sem policy
    // de UPDATE o banco não devolve erro, apenas não altera nada, e o usuário
    // acharia que salvou.
    const { data, error } = await supabase
      .from('profiles')
      .update({ name: nome.trim() })
      .eq('id', user.id)
      .select('id');

    setSalvandoNome(false);

    if (error) {
      setErro(`Não foi possível salvar o nome: ${error.message}`);
      return;
    }

    if (!data || data.length === 0) {
      setErro('O nome não foi alterado. Sua conta não tem permissão para editar o perfil.');
      return;
    }

    // O cabeçalho e a barra lateral leem daqui.
    const salvo = localStorage.getItem('fornexa_auth_user');

    if (salvo) {
      try {
        localStorage.setItem(
          'fornexa_auth_user',
          JSON.stringify({ ...JSON.parse(salvo), name: nome.trim() })
        );
      } catch {
        // sem problema: na próxima entrada o valor é reescrito
      }
    }

    avisar('Perfil atualizado.');
  };

  const salvarSenha = async () => {
    setErro('');

    if (novaSenha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }

    if (novaSenha !== confirmaSenha) {
      setErro('As duas senhas não são iguais.');
      return;
    }

    setSalvandoSenha(true);

    const { error } = await supabase.auth.updateUser({ password: novaSenha });

    setSalvandoSenha(false);

    if (error) {
      setErro(`Não foi possível trocar a senha: ${error.message}`);
      return;
    }

    setNovaSenha('');
    setConfirmaSenha('');
    avisar('Senha alterada. Ela já vale no próximo acesso.');
  };

  const campo =
    'w-full px-4 py-2.5 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-lg text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white disabled:opacity-60';

  const rotulo =
    'flex items-center gap-2 text-sm font-medium text-navy-900 dark:text-white mb-2';

  if (carregando) {
    return (
      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-black dark:border-navy-700 dark:border-t-white rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-4">
          Carregando suas informações...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-navy-900 dark:text-white">Configurações</h1>
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
          Gerencie sua conta e preferências
        </p>
      </div>

      {sucesso && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
          <p className="text-green-700 dark:text-green-400 text-sm font-medium">{sucesso}</p>
        </div>
      )}

      {erro && (
        <div
          role="alert"
          className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
          <p className="text-red-700 dark:text-red-400 text-sm font-medium">{erro}</p>
        </div>
      )}

      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-navy-900 dark:text-white mb-1">
          Seu perfil
        </h2>

        <p className="text-sm text-gray-500 dark:text-slate-400 mb-5 leading-relaxed">
          Estes dados aparecem em todo pedido que chega ao seu fornecedor. Sem
          eles ele vê a venda, mas não sabe que foi você — e com vários
          vendedores no mesmo fornecedor, os pedidos viram um monte sem dono.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="config-nome" className={rotulo}>
              <User className="w-4 h-4" />
              Nome
              <span className="text-amber-500" aria-hidden="true">*</span>
            </label>

            <input
              id="config-nome"
              type="text"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              className={campo}
              disabled={salvandoNome}
            />
          </div>

          <div>
            <label htmlFor="empresa" className={rotulo}>
              <Store className="w-4 h-4" />
              Nome da sua loja ou empresa
              <span className="text-amber-500" aria-hidden="true">*</span>
            </label>

            <input
              id="empresa"
              value={empresa}
              onChange={(evento) => setEmpresa(evento.target.value)}
              placeholder="Ex.: Teodoro Comércio"
              className={campo}
              disabled={carregando}
            />

            <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
              É como o fornecedor vai te chamar, em todo pedido que chega até ele.
            </p>
          </div>

          <div>
            <label htmlFor="whatsapp" className={rotulo}>
              <Phone className="w-4 h-4" />
              WhatsApp
              <span className="text-amber-500" aria-hidden="true">*</span>
            </label>

            <input
              id="whatsapp"
              value={whatsapp}
              onChange={(evento) => setWhatsapp(evento.target.value)}
              placeholder="(11) 90000-0000"
              inputMode="tel"
              className={campo}
              disabled={carregando}
            />

            <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
              Para urgência que não pode esperar chamado. O fornecedor vê este
              número; o comprador nunca.
            </p>
          </div>

          <div>
            <label htmlFor="config-email" className={rotulo}>
              <Mail className="w-4 h-4" />
              E-mail
            </label>

            <input id="config-email" type="email" value={email} className={campo} disabled />

            <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
              Para trocar o e-mail, abra um chamado. A mudança exige confirmação nos dois
              endereços.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={salvarPerfil}
              disabled={salvandoNome || salvandoContato || carregando || !perfilCompleto}
              className="px-5 py-2.5 rounded-lg bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {salvandoNome || salvandoContato ? 'Salvando...' : 'Salvar perfil'}
            </button>

            {contatoSalvo && (
              <span className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="w-4 h-4" />
                Salvo
              </span>
            )}

            {!perfilCompleto && !carregando && (
              <span className="text-sm text-amber-600 dark:text-amber-400">
                Preencha os três campos para salvar.
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-navy-900 dark:text-white mb-6">Senha</h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="config-senha" className={rotulo}>
              <Lock className="w-4 h-4" />
              Nova senha
            </label>

            <input
              id="config-senha"
              type="password"
              value={novaSenha}
              onChange={(event) => setNovaSenha(event.target.value)}
              autoComplete="new-password"
              placeholder="Pelo menos 8 caracteres"
              className={campo}
              disabled={salvandoSenha}
            />
          </div>

          <div>
            <label htmlFor="config-senha-confirma" className={rotulo}>
              <Lock className="w-4 h-4" />
              Repita a nova senha
            </label>

            <input
              id="config-senha-confirma"
              type="password"
              value={confirmaSenha}
              onChange={(event) => setConfirmaSenha(event.target.value)}
              autoComplete="new-password"
              className={campo}
              disabled={salvandoSenha}
            />
          </div>

          <button
            onClick={salvarSenha}
            disabled={salvandoSenha || !novaSenha || !confirmaSenha}
            className="px-5 py-2.5 rounded-lg bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvandoSenha ? 'Alterando...' : 'Alterar senha'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-navy-900 dark:text-white mb-1">
          Declaração de Conteúdo (DC-e)
        </h2>

        <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed">
          Toda venda precisa de uma, por lei, desde abril de 2026. Sem ela a
          etiqueta não é liberada e o Mercado Livre cancela o pedido em 3 dias.
          O documento sai no seu nome, com os seus dados — o FORNEXA só aperta o
          botão por você.
        </p>

        <div className="flex items-start gap-3 mt-4 p-4 bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-lg">
          <input
            id="dce-automatica"
            type="checkbox"
            checked={dceAutomatica}
            disabled={salvandoDce || carregando}
            onChange={(evento) => trocarDceAutomatica(evento.target.checked)}
            className="mt-1 w-4 h-4 accent-navy-900 dark:accent-gold"
          />

          <label htmlFor="dce-automatica" className="cursor-pointer">
            <span className="block text-navy-900 dark:text-white font-medium">
              Emitir automaticamente quando a venda chegar
            </span>

            <span className="block text-sm text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
              Desligando, você emite na mão pelo botão em Pedidos — e o prazo de
              3 dias passa a ser sua responsabilidade.
            </span>
          </label>
        </div>
      </div>

      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-navy-900 dark:text-white mb-4">Plano atual</h2>

        <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-lg">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-gray-600 dark:text-slate-400" />

            <div>
              <p className="text-navy-900 dark:text-white font-medium">
                {planoLabels[plano] || plano}
              </p>

              <p className="text-sm text-gray-500 dark:text-slate-400">
                {origemPlano === 'cortesia'
                  ? 'Acesso de cortesia, sem data para acabar'
                  : expiraEm
                    ? `Renova em ${new Date(expiraEm).toLocaleDateString('pt-BR')}`
                    : statusPlano === 'ativo'
                      ? 'Pagamento único, sem mensalidade'
                      : 'Plano registrado na sua conta'}
              </p>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
              (statusLabels[statusPlano] || statusLabels.inativo).cor
            }`}
          >
            {(statusLabels[statusPlano] || statusLabels.inativo).texto}
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-navy-900 dark:text-white mb-4">Aparência</h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-navy-900 dark:text-white font-medium">Modo escuro</p>

            <p className="text-sm text-gray-500 dark:text-slate-400">
              Alternar entre tema claro e escuro
            </p>
          </div>

          <button
            onClick={() => setDarkMode(!darkMode)}
            aria-label={darkMode ? 'Desativar modo escuro' : 'Ativar modo escuro'}
            className={`relative w-14 h-8 rounded-full transition-colors ${
              darkMode ? 'bg-black dark:bg-white' : 'bg-gray-300'
            }`}
          >
            <div
              className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform flex items-center justify-center ${
                darkMode ? 'translate-x-7' : 'translate-x-1'
              }`}
            >
              {darkMode ? (
                <Moon className="w-3.5 h-3.5 text-navy-900" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-yellow-500" />
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
