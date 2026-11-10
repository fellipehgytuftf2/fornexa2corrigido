import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import AvisoDoSistema from '../components/dashboard/AvisoDoSistema';
import Notificacoes from '../components/dashboard/Notificacoes';
import SuporteFlutuante from '../components/dashboard/SuporteFlutuante';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Bell,
  ChevronDown,
  Columns3,
  DollarSign,
  HandCoins,
  Printer,
  ShieldCheck,
  UserCog,
  UsersRound,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  LogOut,
  Menu,
  Moon,
  Package,
  Settings,
  Megaphone,
  ShoppingCart,
  Sun,
  Trophy,
  Truck,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useFuncionalidades } from '../lib/funcionalidades';
import BarraDeFaturamento from '../components/conquistas/BarraDeFaturamento';
import AvisoDeConexaoMl from '../components/dashboard/AvisoDeConexaoMl';

interface NavigationSubItem {
  path: string;
  label: string;
  /** Submenu dentro do submenu (ex.: Admin → Afiliados → Desempenho). */
  children?: NavigationSubItem[];
}

interface NavigationItem {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  /** Chave da novidade em teste. Sem liberação, o item não aparece. */
  funcionalidade?: string;
  /** Item vira um grupo expansível na barra lateral em vez de um link direto. */
  children?: NavigationSubItem[];
}

const navigationItems: NavigationItem[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    path: '/dashboard/catalog',
    label: 'Catálogo',
    icon: Package,
  },

  {
    path: '/dashboard/my-products',
    // "Anúncios" e não "Produtos": o que mora aqui é o que foi publicado no
    // marketplace, e produto solto quem tem é o Catálogo.
    label: 'Meus Anúncios',
    // Carrinho ficou para Pedidos. Dois itens do menu com o mesmo desenho um
    // embaixo do outro não distinguem nada.
    icon: Megaphone,
  },

  {
    path: '/dashboard/orders',
    label: 'Pedidos',
    icon: ShoppingCart,
  },
  {
    path: '/dashboard/top-vendedores',
    label: 'Top Vendedores',
    icon: Trophy,
    // Novidade em teste: só quem estiver liberado no Admin vê. O admin
    // enxerga sempre, e o lançamento é um clique lá — sem deploy.
    funcionalidade: 'top-vendedores',
  },
  {
    path: '/dashboard/financial',
    label: 'Financeiro',
    icon: DollarSign,
  },
  {
    path: '/dashboard/integrations',
    label: 'Integrações',
    icon: Link2,
  },
  {
    path: '/dashboard/tickets',
    label: 'Chamados',
    icon: LifeBuoy,
  },
  // Tutoriais (/dashboard/tutorials) e Ferramentas (/dashboard/tools) estão
  // fora do menu por decisão do produto. As rotas continuam de pé e as telas
  // seguem acessíveis pela URL — para voltarem, basta reinserir aqui.
  {
    path: '/dashboard/settings',
    label: 'Configurações',
    icon: Settings,
  },
  // Fornecedores e as telas de Admin moram no Painel admin, que é uma tela
  // própria (/admin). Aqui fica só a porta de entrada.
  // Aponta para Números, e não para /admin: é a primeira tela que os dois
  // papéis abrem. Mandar o co-produtor para /admin seria mandá-lo para uma
  // porta que o recusa.
  {
    path: '/gestao/numeros',
    label: 'Painel admin',
    icon: ShieldCheck,
    adminOnly: true,
  },
];

/**
 * Quem entra em cada área, pelo endereço.
 *
 * Antes isto estava espalhado: a tela ficava sob `/admin` e ganhava uma
 * marca `coprodutor` avulsa, e havia ainda uma lista de caminhos liberados em
 * outro ponto do arquivo. Para responder "quem abre esta tela?" era preciso
 * cruzar os três lugares, e tela nova entrava com a marca errada sem ninguém
 * notar.
 *
 * Agora o endereço responde sozinho: `/admin` é do dono, `/gestao` é o que o
 * co-produtor também abre, `/afiliados` é a área de parceria. Mover uma tela
 * de área é mover o endereço dela, e a permissão vai junto.
 */
const PAPEIS_DA_AREA: Record<string, readonly string[]> = {
  '/admin': ['admin'],
  '/gestao': ['admin', 'coprodutor'],
  '/afiliados': ['admin', 'coprodutor'],
};

/** A área a que um endereço pertence, ou nada se for tela de vendedor. */
const areaDoCaminho = (caminho: string) =>
  Object.keys(PAPEIS_DA_AREA).find(
    (area) => caminho === area || caminho.startsWith(`${area}/`)
  );

/** Só do dono: nada aqui o co-produtor abre. */
const adminNavigationItems: NavigationItem[] = [
  { path: '/admin/catalogo', label: 'Catálogo', icon: Package },
  { path: '/admin/fornecedores', label: 'Fornecedores', icon: Truck },
  { path: '/admin/avisos', label: 'Avisos', icon: Bell },
  { path: '/admin/impressao', label: 'Impressão', icon: Printer },
  { path: '/admin/repasses', label: 'Repasses', icon: HandCoins },
  { path: '/admin/kanban', label: 'Kanban', icon: Columns3 },
];

/** O dono e o co-produtor, juntos. */
const gestaoNavigationItems: NavigationItem[] = [
  { path: '/gestao/numeros', label: 'Números', icon: BarChart3 },
  { path: '/gestao/contas', label: 'Contas e acessos', icon: UserCog },
];

/** A parceria, que os dois tocam por inteiro. */
const afiliadosNavigationItems: NavigationItem[] = [
  { path: '/afiliados/gerenciar', label: 'Gerenciar', icon: UsersRound },
  { path: '/afiliados/pedidos', label: 'Aceitar pedido', icon: UserCog },
  { path: '/afiliados/desempenho', label: 'Desempenho', icon: BarChart3 },
];

/** O menu de quem está numa área de gestão, já filtrado pelo papel. */
const menuDaGestao = (papel: string | null): NavigationItem[] => [
  ...(papel === 'admin' ? adminNavigationItems : []),
  ...gestaoNavigationItems,
  ...afiliadosNavigationItems,
];

/**
 * Telas de gestão que não moram numa das três áreas.
 *
 * `/dashboard/suppliers` e os endereços antigos de `/dashboard/admin` só
 * existem para redirecionar — ficam fechados ao vendedor do mesmo jeito.
 */
const CAMINHOS_SO_DO_DONO = ['/dashboard/admin', '/dashboard/suppliers'];

/** Se este papel abre este endereço. */
const papelAbre = (papel: string | null, caminho: string) => {
  if (papel === 'admin') return true;

  const area = areaDoCaminho(caminho);

  return Boolean(area && PAPEIS_DA_AREA[area].includes(papel ?? ''));
};

interface SavedUser {
  id?: string;
  name?: string;
  email?: string;
  plan?: string;
  role?: string;
}

const getGreeting = () => {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return 'Bom dia';
  }

  if (hour >= 12 && hour < 18) {
    return 'Boa tarde';
  }

  return 'Boa noite';
};

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [savedUser, setSavedUser] = useState<SavedUser | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [userRole, setUserRole] = useState<string>('user');

  /** Novidades em teste liberadas para esta conta. Ver src/lib/funcionalidades. */
  const { liberadas } = useFuncionalidades();

  /**
   * Grupos da barra lateral abertos (ex: "Admin", com os seis submenus).
   * Abre sozinho ao entrar numa página do grupo — recarregar em
   * /dashboard/admin/contas não pode esconder o link em que a pessoa está.
   */
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(() => {
    const abertos = new Set<string>();
    [...navigationItems, ...menuDaGestao('admin')].forEach((item) => {
      item.children?.forEach((filho) => {
        if (location.pathname.startsWith(filho.path)) {
          abertos.add(item.path);
          if (filho.children) abertos.add(filho.path);
        }
      });
    });
    return abertos;
  });

  /**
   * Respostas de chamado que o vendedor ainda não leu.
   *
   * Mesma cadência do suporte, e pelo mesmo motivo: é aviso de que alguém
   * respondeu, não conversa ao vivo. E confere de novo quando a aba volta a
   * ficar visível — a resposta costuma chegar enquanto a pessoa está no
   * Mercado Livre, em outra janela.
   */
  const [chamadosNaoLidos, setChamadosNaoLidos] = useState(0);

  /**
   * Pedido Flex parado por falta de cadastro na transportadora.
   *
   * Aqui é ponto, e não número: o quanto está parado se lê dentro da tela, e
   * dois contadores no mesmo menu viram dois números para ignorar. O ponto
   * responde a única pergunta que o menu precisa responder — tem algo aí.
   */
  const [temFlexParado, setTemFlexParado] = useState(false);

  useEffect(() => {
    let vivo = true;

    const contar = async () => {
      const [chamados, flex] = await Promise.all([
        supabase.rpc('chamados_nao_lidos'),
        supabase.rpc('meus_pedidos_flex_parados_total'),
      ]);

      if (!vivo) return;

      setChamadosNaoLidos(Number(chamados.data ?? 0));
      setTemFlexParado(Number(flex.data ?? 0) > 0);
    };

    contar();

    const relogio = window.setInterval(contar, 60000);

    const aoVoltar = () => {
      if (document.visibilityState === 'visible') contar();
    };

    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      vivo = false;
      window.clearInterval(relogio);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [location.pathname]);
  const [checkingRole, setCheckingRole] = useState(true);

  useEffect(() => {
    const loadUserData = async () => {
      setCheckingRole(true);

      const userFromStorage = localStorage.getItem('fornexa_auth_user');

      if (userFromStorage) {
        try {
          setSavedUser(JSON.parse(userFromStorage));
        } catch {
          setSavedUser(null);
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setUserRole('user');
        setCheckingRole(false);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle<{ role: string | null }>();

      // Só o papel: o plano deixou de aparecer no menu e agora é lido
      // direto do banco em Configurações, que é onde ele é mostrado.
      setUserRole(data?.role || 'user');

      setCheckingRole(false);
    };

    loadUserData();

    const savedTheme = localStorage.getItem('fornexa_darkMode');

    if (savedTheme) {
      const parsedTheme = JSON.parse(savedTheme);
      setDarkMode(parsedTheme);

      if (parsedTheme) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, []);

  const handleToggleTheme = () => {
    const nextValue = !darkMode;

    setDarkMode(nextValue);
    localStorage.setItem('fornexa_darkMode', JSON.stringify(nextValue));

    if (nextValue) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();

    localStorage.removeItem('fornexa_auth_user');
    localStorage.removeItem('fornexa:modo-suporte');

    navigate('/login');
  };

  /**
   * Quem o admin está vendo de dentro, quando entrou por "Entrar na conta".
   *
   * Sem este aviso, o admin esqueceria em que conta está e faria mudanças na
   * conta do cliente achando que eram dele. A sessão é do cliente de verdade,
   * então a tela não tem outro jeito de contar isso.
   */
  const modoSuporte = (() => {
    try {
      const guardado = localStorage.getItem('fornexa:modo-suporte');

      return guardado ? (JSON.parse(guardado) as { nome?: string; email?: string }) : null;
    } catch {
      return null;
    }
  })();

  /**
   * Volta o admin para a própria conta.
   *
   * A sessão do admin foi guardada antes da troca. Restaurando os tokens, ele
   * volta ao lugar sem digitar senha — que era o incômodo real de dar suporte
   * dentro da conta de alguém.
   *
   * Falhando (sessão velha demais, tokens já invalidados), cai no logout
   * normal. Deixar o admin preso na conta do cliente seria pior do que pedir
   * um login.
   */
  const sairDoModoSuporte = async () => {
    localStorage.removeItem('fornexa:modo-suporte');

    let guardada: { access_token?: string; refresh_token?: string } | null = null;

    try {
      const bruto = localStorage.getItem('fornexa:sessao-admin');
      guardada = bruto ? JSON.parse(bruto) : null;
    } catch {
      guardada = null;
    }

    localStorage.removeItem('fornexa:sessao-admin');

    if (guardada?.access_token && guardada?.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: guardada.access_token,
        refresh_token: guardada.refresh_token,
      });

      if (!error) {
        // Recarrega em vez de navegar: as telas já montadas carregaram os
        // dados do cliente, e trocar de usuário por baixo delas deixaria
        // resto da conta antiga na tela.
        window.location.assign('/admin/contas');
        return;
      }
    }

    await handleLogout();
  };

  /**
   * Nas três áreas de gestão a tela troca de menu, de cor e de cabeçalho.
   * Quem vende nunca passa por aqui.
   */
  const naAreaAdmin = Boolean(areaDoCaminho(location.pathname));

  const isAdminOnlyRoute =
    naAreaAdmin || CAMINHOS_SO_DO_DONO.some((path) => location.pathname.startsWith(path));

  const shouldBlockAdminRoute =
    !checkingRole && isAdminOnlyRoute && !papelAbre(userRole, location.pathname);

  const firstName = savedUser?.name?.split(' ')[0] || 'Vendedor';

  /** Iniciais para o selo da conta: primeira e última palavra do nome. */
  const iniciaisDaConta = (() => {
    const partes = (savedUser?.name || '').trim().split(/\s+/).filter(Boolean);

    if (partes.length === 0) {
      return 'U';
    }

    const primeira = partes[0][0];
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';

    return (primeira + ultima).toUpperCase();
  })();

  const isDashboardHome = location.pathname === '/dashboard';

  const headerSubtitle = naAreaAdmin
    ? 'Painel administrativo do FORNEXA.'
    : isDashboardHome
    ? 'Vamos aumentar seu faturamento hoje? Seu próximo anúncio pode ser seu próximo lucro.'
    : 'Escolha produtos, prepare anúncios e acompanhe pedidos.';
  const renderAccessDenied = () => {
    return (
      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />

        <h1 className="text-2xl font-bold text-navy-900 dark:text-white">
          Acesso negado
        </h1>

        <p className="text-gray-500 dark:text-slate-400 text-sm mt-2 max-w-xl mx-auto">
          Esta área é exclusiva para administradores do FORNEXA. Você pode continuar usando catálogo, produtos, pedidos e financeiro normalmente.
        </p>

        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center justify-center mt-6 px-5 py-3 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors"
        >
          Voltar para o Dashboard
        </button>
      </div>
    );
  };

  const renderCheckingPermission = () => {
    return (
      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-black dark:border-navy-700 dark:border-t-white rounded-full animate-spin mx-auto" />

        <p className="text-gray-500 dark:text-slate-400 text-sm mt-4">
          Verificando permissão...
        </p>
      </div>
    );
  };

  const alternarGrupo = (path: string) => {
    setGruposAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(path)) {
        proximo.delete(path);
      } else {
        proximo.add(path);
      }
      return proximo;
    });
  };

  const renderNavigation = () => {

    // O Painel admin tem barra escura com destaque amarelo, nos dois temas:
    // é o jeito de saber, de relance, que se está mexendo no FORNEXA inteiro
    // e não na própria loja.
    const corAtiva = naAreaAdmin
      ? 'bg-gold text-navy-900'
      : 'bg-black text-white dark:bg-white dark:text-navy-900';
    const corInativa = naAreaAdmin
      ? 'text-slate-400 hover:bg-white/5 hover:text-white'
      : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-800 hover:text-navy-900 dark:hover:text-white';
    const corDoSubgrupoAtivo = naAreaAdmin ? 'text-white' : 'text-navy-900 dark:text-white';
    const linhaDoGrupo = naAreaAdmin ? 'border-white/10' : 'border-gray-200 dark:border-navy-700';

    /**
     * O menu não precisa mais podar nada.
     *
     * Antes cada item carregava a marca de quem o via, e o menu peneirava
     * item a item — inclusive submenu dentro de submenu. Agora cada área tem
     * a sua lista, e `menuDaGestao` devolve só as listas do papel: o que não
     * é dele nunca chega aqui.
     */
    const visibleItems = (naAreaAdmin ? menuDaGestao(userRole) : navigationItems)
      .filter((item) => {
        if (item.adminOnly && !papelAbre(userRole, item.path)) {
          return false;
        }

        if (item.funcionalidade && !liberadas.has(item.funcionalidade)) {
          return false;
        }

        return true;
      })
      .filter((item) => !item.children || item.children.length > 0);

    return (
      <nav className="space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;

          if (item.children) {
            const grupoAberto = gruposAbertos.has(item.path);
            const grupoAtivo = item.children.some((filho) =>
              location.pathname.startsWith(filho.path)
            );

            return (
              <div key={item.path}>
                <button
                  type="button"
                  onClick={() => alternarGrupo(item.path)}
                  aria-expanded={grupoAberto}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    grupoAtivo
                      ? corAtiva
                      : corInativa
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                  <ChevronDown
                    className={`w-4 h-4 ml-auto transition-transform ${grupoAberto ? 'rotate-180' : ''}`}
                  />
                </button>

                {grupoAberto && (
                  <div className={`mt-1 ml-4 pl-4 border-l ${linhaDoGrupo} space-y-1`}>
                    {item.children.map((filho) => {
                      if (filho.children) {
                        const subAberto = gruposAbertos.has(filho.path);
                        const subAtivo = location.pathname.startsWith(filho.path);

                        return (
                          <div key={filho.path}>
                            <button
                              type="button"
                              onClick={() => alternarGrupo(filho.path)}
                              aria-expanded={subAberto}
                              className={`w-full flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                subAtivo
                                  ? corDoSubgrupoAtivo
                                  : corInativa
                              }`}
                            >
                              {filho.label}
                              <ChevronDown
                                className={`w-3.5 h-3.5 ml-auto transition-transform ${subAberto ? 'rotate-180' : ''}`}
                              />
                            </button>

                            {subAberto && (
                              <div className={`mt-1 ml-3 pl-3 border-l ${linhaDoGrupo} space-y-1`}>
                                {filho.children.map((neto) => (
                                  <NavLink
                                    key={neto.path}
                                    to={neto.path}
                                    onClick={() => setSidebarOpen(false)}
                                    className={({ isActive }) =>
                                      `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        isActive
                                          ? corAtiva
                                          : corInativa
                                      }`
                                    }
                                  >
                                    {neto.label}
                                  </NavLink>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <NavLink
                          key={filho.path}
                          to={filho.path}
                          onClick={() => setSidebarOpen(false)}
                          className={({ isActive }) =>
                            `block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              isActive
                                ? corAtiva
                                : corInativa
                            }`
                          }
                        >
                          {filho.label}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/dashboard'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? corAtiva
                    : corInativa
                }`
              }
            >
              <Icon className={`w-5 h-5 ${item.path === '/admin' ? 'text-gold' : ''}`} />
              {item.label}

              {/* O fornecedor responde e o vendedor não vê: a contagem existia
                  dentro da página, e quem não abre a página não sabe que tem
                  resposta. Aqui ela alcança quem não foi procurar. */}
              {item.path === '/dashboard/tickets' && chamadosNaoLidos > 0 && (
                <span className="ml-auto min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center tabular-nums">
                  {chamadosNaoLidos}
                </span>
              )}

              {item.path === '/dashboard/orders' && temFlexParado && (
                <span
                  title="Pedido Flex parado por falta de cadastro na transportadora"
                  aria-label="Há pedidos parados"
                  className="ml-auto w-2.5 h-2.5 rounded-full bg-red-500 shrink-0"
                />
              )}

            </NavLink>
          );
        })}
      </nav>
    );
  };

  const corDaBarra = naAreaAdmin
    ? 'bg-navy-950 text-white border-white/10'
    : 'bg-white dark:bg-navy-900 border-gray-200 dark:border-navy-700';

  const renderMarcaDaBarra = () =>
    naAreaAdmin ? (
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold text-white">FORNEXA</h1>
          <span className="px-2 py-0.5 rounded-md bg-gold text-navy-900 text-[11px] font-bold uppercase tracking-wider">
            Admin
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">Painel administrativo</p>
      </div>
    ) : (
      <div className="p-6 border-b border-gray-200 dark:border-navy-700">
        <h1 className="text-xl font-bold text-navy-900 dark:text-white">FORNEXA</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Área do vendedor</p>
      </div>
    );

  /** No Painel admin, a volta para a loja fica sempre à mão, no pé do menu. */
  const renderRodapeDaBarra = () =>
    naAreaAdmin ? (
      <div className="p-4 border-t border-white/10">
        <Link
          to="/dashboard"
          onClick={() => setSidebarOpen(false)}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-white border border-white/15 hover:bg-white/5 hover:border-white/30 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Área do vendedor
        </Link>
      </div>
    ) : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-navy-900">
      <aside className={`hidden lg:flex fixed inset-y-0 left-0 w-72 border-r flex-col z-40 ${corDaBarra}`}>
        {renderMarcaDaBarra()}

        {/* O rodapé do menu sumiu por inteiro: nome, e-mail e plano foram para
            o topo ou para Configurações, e o Sair já existe lá em cima. Dois
            botões de sair na mesma tela só dividem a atenção. */}
        <div className="flex-1 overflow-y-auto p-4">{renderNavigation()}</div>
        {renderRodapeDaBarra()}
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />

          <aside className={`absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] border-r flex flex-col ${corDaBarra}`}>
            <div className="relative">
              {renderMarcaDaBarra()}

              <button
                onClick={() => setSidebarOpen(false)}
                aria-label="Fechar menu"
                className={`absolute top-4 right-4 p-2 rounded-xl transition-colors ${
                  naAreaAdmin ? 'text-slate-300 hover:bg-white/10' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-800'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">{renderNavigation()}</div>
            {renderRodapeDaBarra()}
          </aside>
        </div>
      )}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 bg-white dark:bg-navy-900 border-b border-gray-200 dark:border-navy-700">
          <div className="h-16 px-4 sm:px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
              >
                <Menu className="w-5 h-5 text-gray-600 dark:text-slate-400" />
              </button>

              <div>
                <p className="text-sm font-semibold text-navy-900 dark:text-white flex items-center gap-2">
                  {getGreeting()}, {firstName}
                  {naAreaAdmin && (
                    <span className="px-1.5 py-0.5 rounded bg-gold text-navy-900 text-[10px] font-bold uppercase tracking-wider">
                      Admin
                    </span>
                  )}
                </p>

                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {headerSubtitle}
                </p>
              </div>
            </div>

            {/* No cabeçalho, e não numa faixa abaixo dele: faturamento e meta
                são o placar do dia, e placar fica junto do nome de quem joga.
                Some no celular, onde a linha não comporta os dois. */}
            {!naAreaAdmin && liberadas.has('top-vendedores') && (
              <div className="hidden md:flex flex-1 justify-center px-4 min-w-0">
                <BarraDeFaturamento />
              </div>
            )}

            <div className="flex items-center gap-2 sm:gap-3">
              {/* Antes do tema: o sino é sobre o que mudou na conta, e o tema é
                  preferência pessoal. O que pede ação vem primeiro. */}
              {!naAreaAdmin && <Notificacoes />}

              <button
                onClick={handleToggleTheme}
                aria-label={darkMode ? 'Usar tema claro' : 'Usar tema escuro'}
                className="p-2 rounded-xl border border-gray-200 dark:border-navy-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-navy-800 transition-colors"
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              {/* Identidade da conta.
                  Sobe da barra lateral para cá, e sem e-mail nem plano: quem
                  usa o painel na frente de um cliente ou numa gravação de tela
                  não precisa expor os dois. Eles continuam em Configurações,
                  que é onde se vai para conferir isso de propósito. */}
              <Link
                to="/dashboard/settings"
                title="Ver conta e plano em Configurações"
                className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-xl border border-gray-200 dark:border-navy-700 hover:bg-gray-50 dark:hover:bg-navy-800 transition-colors"
              >
                <span className="w-8 h-8 rounded-lg bg-navy-900 dark:bg-gold text-white dark:text-navy-900 flex items-center justify-center text-xs font-bold shrink-0">
                  {iniciaisDaConta}
                </span>

                <span className="hidden sm:flex flex-col leading-tight text-left">
                  <span className="text-sm font-semibold text-navy-900 dark:text-white max-w-[140px] truncate">
                    {savedUser?.name || 'Usuário'}
                  </span>

                  {userRole === 'admin' && (
                    <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">
                      Administrador
                    </span>
                  )}
                </span>
              </Link>

              <button
                onClick={handleLogout}
                aria-label="Sair da conta"
                className="p-2 rounded-xl border border-gray-200 dark:border-navy-700 text-gray-600 dark:text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-900/20 dark:hover:text-red-400 dark:hover:border-red-800 transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {modoSuporte && (
          <div className="flex flex-wrap items-center gap-3 bg-amber-500 px-4 sm:px-6 py-2.5">
            <p className="text-sm font-semibold text-amber-950 flex-1 min-w-0">
              Modo suporte — você está dentro da conta de{' '}
              {modoSuporte.nome || modoSuporte.email}. Tudo o que fizer aqui é
              como se fosse ela.
            </p>

            <button
              type="button"
              onClick={sairDoModoSuporte}
              className="shrink-0 rounded-lg bg-amber-950 px-3 py-1.5 text-xs font-semibold text-amber-50 transition-opacity hover:opacity-90"
            >
              Voltar para minha conta
            </button>
          </div>
        )}

        {/* A volta da autorização do Mercado Livre cai no painel, não na tela
            de Integrações: o aviso precisa morar aqui para ser visto. */}
        {!naAreaAdmin && <AvisoDeConexaoMl />}

        <main className="p-4 sm:p-6 bg-gray-50 dark:bg-navy-900 min-h-[calc(100vh-4rem)]">
          {isAdminOnlyRoute && checkingRole
            ? renderCheckingPermission()
            : shouldBlockAdminRoute
              ? renderAccessDenied()
              : <Outlet />}
        </main>
      </div>

      {/* Fora do <main> e por portal: é um recado do FORNEXA sobre a conta,
          não conteúdo da tela em que a pessoa está. Aparece uma vez, em
          qualquer página do painel — quem precisa ser avisado do endereço de
          remetente raramente abre Integrações por conta própria. */}
      {!naAreaAdmin && <AvisoDoSistema />}

      {/* O suporte fica onde a dúvida nasce — no meio de um anúncio, num
          pedido travado. Item de menu obrigava a sair de onde o problema
          estava, e quem sai perde o print que ia mandar. */}
      {!naAreaAdmin && <SuporteFlutuante />}
    </div>
  );
}