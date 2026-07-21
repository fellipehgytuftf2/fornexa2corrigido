import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  DollarSign,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Moon,
  Package,
  ShoppingCart,
  Sun,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface NavigationItem {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
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
    label: 'Meus Produtos',
    icon: ShoppingCart,
  },

  {
    path: '/dashboard/orders',
    label: 'Pedidos',
    icon: ShoppingCart,
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
];

const adminOnlyPaths = ['/dashboard/admin', '/dashboard/suppliers'];

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
        .maybeSingle();

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

    navigate('/login');
  };

  const isAdminOnlyRoute = adminOnlyPaths.some((path) =>
    location.pathname.startsWith(path)
  );

  const shouldBlockAdminRoute =
    !checkingRole && isAdminOnlyRoute && userRole !== 'admin';

  const firstName = savedUser?.name?.split(' ')[0] || 'Vendedor';
const isDashboardHome = location.pathname === '/dashboard';

  const headerSubtitle = isDashboardHome
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

  const renderNavigation = () => {
    const visibleItems = navigationItems.filter((item) => {
      if (item.adminOnly && userRole !== 'admin') {
        return false;
      }

      return true;
    });

    return (
      <nav className="space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/dashboard'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-black text-white dark:bg-white dark:text-navy-900'
                    : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-800 hover:text-navy-900 dark:hover:text-white'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-navy-900">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-72 bg-white dark:bg-navy-900 border-r border-gray-200 dark:border-navy-700 flex-col z-40">
        <div className="p-6 border-b border-gray-200 dark:border-navy-700">
          <h1 className="text-xl font-bold text-navy-900 dark:text-white">
            FORNEXA
          </h1>

          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            Área do vendedor
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">{renderNavigation()}</div>

        <div className="p-4 border-t border-gray-200 dark:border-navy-700">
          <div className="mb-4">
            <p className="text-sm font-semibold text-navy-900 dark:text-white truncate">
              {savedUser?.name || 'Usuário'}
            </p>

            <p className="text-xs text-gray-500 dark:text-slate-400 truncate mt-1">
              {savedUser?.email || 'Conta FORNEXA'}
            </p>

            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Plano: {savedUser?.plan || 'free'}
            </p>

            {userRole === 'admin' && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">
                Admin FORNEXA
              </p>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-semibold transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />

          <aside className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-navy-900 border-r border-gray-200 dark:border-navy-700 flex flex-col">
            <div className="p-5 border-b border-gray-200 dark:border-navy-700 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-navy-900 dark:text-white">
                  FORNEXA
                </h1>

                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                  Área do vendedor
                </p>
              </div>

              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">{renderNavigation()}</div>

            <div className="p-4 border-t border-gray-200 dark:border-navy-700">
              <button
                onClick={handleLogout}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-semibold transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 bg-white/90 dark:bg-navy-900/90 backdrop-blur border-b border-gray-200 dark:border-navy-700">
          <div className="h-16 px-4 sm:px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
              >
                <Menu className="w-5 h-5 text-gray-600 dark:text-slate-400" />
              </button>

              <div>
                <p className="text-sm font-semibold text-navy-900 dark:text-white">
                  {getGreeting()}, {firstName}
                </p>

                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {headerSubtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleTheme}
                className="p-2 rounded-xl border border-gray-200 dark:border-navy-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-navy-800 transition-colors"
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              <button
                onClick={handleLogout}
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-navy-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-navy-800 text-sm font-medium transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 bg-gray-50 dark:bg-navy-900 min-h-[calc(100vh-4rem)]">
          {isAdminOnlyRoute && checkingRole
            ? renderCheckingPermission()
            : shouldBlockAdminRoute
              ? renderAccessDenied()
              : <Outlet />}
        </main>
      </div>
    </div>
  );
}