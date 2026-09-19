import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';

import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import SupplierLogin from './pages/SupplierLogin';
import EsqueciSenha from './pages/EsqueciSenha';
import RedefinirSenha from './pages/RedefinirSenha';
import Assinar from './pages/Assinar';
import SupplierPortal from './pages/supplier/SupplierPortal';

import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/dashboard/Dashboard';
import Catalog from './pages/dashboard/Catalog';
import Suppliers from './pages/dashboard/Suppliers';
import MyProducts from './pages/dashboard/MyProducts';
import Orders from './pages/dashboard/Orders';
import Financial from './pages/dashboard/Financial';
import Integrations from './pages/dashboard/Integrations';
import AdminCatalogo from './pages/dashboard/AdminCatalogo';
import AdminAvisos from './pages/dashboard/AdminAvisos';
import AdminImpressao from './pages/dashboard/AdminImpressao';
import AdminContas from './pages/dashboard/AdminContas';
import { DesempenhoDosAfiliados, PedidosDeAfiliado } from './components/dashboard/AfiliadosAdmin';
import AdminRepasses from './pages/dashboard/AdminRepasses';
import AdminKanban from './pages/dashboard/AdminKanban';
import Tickets from './pages/dashboard/Tickets';
import Suporte from './pages/dashboard/Suporte';
import Tools from './pages/dashboard/Tools';
import Tutorials from './pages/dashboard/Tutorials';
import Settings from './pages/dashboard/Settings';

import { supabase } from './lib/supabase';
import { fetchSupplierAccount } from './lib/supplierAuth';
import { planoEmDia, capturarCodigoDoAfiliado } from './lib/planos';
import { buscarCheckoutDoAfiliado } from './lib/afiliados';
import LinkDeAfiliadoInativo from './pages/LinkDeAfiliadoInativo';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
}

interface Profile {
  name: string;
  email: string;
  plan: string;
  plan_status: string | null;
  plan_expira_em: string | null;
  role: string;
}

function SessionLoading({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-navy-900 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-black dark:border-navy-700 dark:border-t-white rounded-full animate-spin mx-auto" />

        <p className="text-sm text-gray-500 dark:text-slate-400 mt-4">{label}</p>
      </div>
    </div>
  );
}

/**
 * Guarda do Portal do Fornecedor: exige sessão E um cadastro em `suppliers`
 * ligado a ela. Vendedor logado que tentar a URL do portal cai no login do
 * fornecedor.
 */
function SupplierRoute({ children }: ProtectedRouteProps) {
  const [checking, setChecking] = useState(true);
  const [isSupplier, setIsSupplier] = useState(false);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (error || !data.session?.user) {
        localStorage.removeItem('fornexa_supplier');
        setIsSupplier(false);
        setChecking(false);
        return;
      }

      const supplier = await fetchSupplierAccount(data.session.user.id);

      if (!mounted) {
        return;
      }

      if (!supplier) {
        localStorage.removeItem('fornexa_supplier');
      }

      setIsSupplier(Boolean(supplier));
      setChecking(false);
    };

    check();

    return () => {
      mounted = false;
    };
  }, []);

  if (checking) {
    return <SessionLoading label="Verificando acesso do fornecedor..." />;
  }

  if (!isSupplier) {
    return <Navigate to="/fornecedor/login" replace />;
  }

  return children;
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [redirectToPortal, setRedirectToPortal] = useState(false);
  const [semPlano, setSemPlano] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (error || !data.session?.user) {
        localStorage.removeItem('fornexa_auth_user');
        setAuthenticated(false);
        setCheckingSession(false);
        return;
      }

      const user = data.session.user;

      // Fornecedor não usa o dashboard do vendedor: tem portal próprio.
      const supplier = await fetchSupplierAccount(user.id);

      if (!mounted) {
        return;
      }

      if (supplier) {
        setRedirectToPortal(true);
        setCheckingSession(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, email, plan, plan_status, plan_expira_em, role')
        .eq('id', user.id)
        .maybeSingle<Profile>();

      localStorage.setItem(
        'fornexa_auth_user',
        JSON.stringify({
          id: user.id,
          name:
            profile?.name ||
            user.user_metadata?.name ||
            user.email?.split('@')[0] ||
            'Usuário',
          email: profile?.email || user.email || '',
          plan: profile?.plan || 'free',
          role: profile?.role || 'user',
          loggedAt: new Date().toISOString(),
        })
      );

      // Sessão válida não é o bastante: o painel inteiro depende de plano em
      // dia. Quem não tem cai em /planos em vez de ver telas que não pode usar.
      setSemPlano(!planoEmDia(profile));

      setAuthenticated(true);
      setCheckingSession(false);
    };

    checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  if (checkingSession) {
    return <SessionLoading label="Verificando sessão..." />;
  }

  if (redirectToPortal) {
    return <Navigate to="/fornecedor" replace />;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  if (semPlano) {
    return <Navigate to="/planos" replace />;
  }

  return children;
}

/**
 * A mesma landing page, com os botões de comprar trocados pelo checkout do
 * afiliado dono do endereço — fornexa.site/joao vende no checkout do João.
 *
 * Só abre se o afiliado estiver ativo (aceito e com os dois checkouts).
 * Endereço inventado, afiliado removido ou ainda sem checkout mostra que o
 * link não está ativo, e o código NÃO fica guardado no navegador.
 *
 * Ativo, o endereço vira só fornexa.site/ — quem compra não vê de quem é o
 * link. A indicação segue junto no histórico da aba (sobrevive a F5 e a aba
 * anônima sem armazenamento) e no navegador: quem não comprar na hora e
 * voltar depois por /planos continua comprando no checkout dele.
 */
function LandingComCodigoDeAfiliado() {
  const { codigoAfiliado } = useParams();
  const navigate = useNavigate();
  const [inativo, setInativo] = useState(false);

  useEffect(() => {
    let vivo = true;
    setInativo(false);

    buscarCheckoutDoAfiliado(codigoAfiliado ?? '').then((checkout) => {
      if (!vivo) return;

      if (!checkout || !codigoAfiliado) {
        setInativo(true);
        return;
      }

      capturarCodigoDoAfiliado(codigoAfiliado);
      navigate('/', { replace: true, state: { afiliado: codigoAfiliado } });
    });

    return () => {
      vivo = false;
    };
  }, [codigoAfiliado, navigate]);

  if (inativo) {
    return <LinkDeAfiliadoInativo />;
  }

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-gold animate-spin" aria-hidden="true" />
    </div>
  );
}

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('fornexa_darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  // Roda uma vez, antes de qualquer rota — quem chega por /planos?ref=X em
  // vez da home também precisa ter o código guardado.
  useEffect(() => {
    capturarCodigoDoAfiliado();
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    localStorage.setItem('fornexa_darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Recuperação de senha, comum a vendedor e fornecedor */}
        <Route path="/esqueci-senha" element={<EsqueciSenha />} />
        <Route path="/redefinir-senha" element={<RedefinirSenha />} />

        {/* Escolha de plano: exige sessão, mas de propósito não passa pelo
            ProtectedRoute — é justamente para onde ele manda quem não pagou. */}
        <Route path="/planos" element={<Assinar />} />

        {/* Portal do Fornecedor — área separada, não usa o DashboardLayout */}
        <Route path="/fornecedor/login" element={<SupplierLogin />} />
        <Route
          path="/fornecedor"
          element={
            <SupplierRoute>
              <SupplierPortal />
            </SupplierRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
             <DashboardLayout />
            </ProtectedRoute>
          }
        >
         <Route index element={<Dashboard darkMode={darkMode} />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="my-products" element={<MyProducts />} />
          <Route path="orders" element={<Orders />} />
          <Route path="financial" element={<Financial />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="admin" element={<Navigate to="/dashboard/admin/catalogo" replace />} />
          <Route path="admin/catalogo" element={<AdminCatalogo />} />
          <Route path="admin/avisos" element={<AdminAvisos />} />
          <Route path="admin/impressao" element={<AdminImpressao />} />
          <Route path="admin/contas" element={<AdminContas />} />
          <Route
            path="admin/afiliados"
            element={<Navigate to="/dashboard/admin/afiliados/pedidos" replace />}
          />
          <Route path="admin/afiliados/pedidos" element={<PedidosDeAfiliado />} />
          <Route path="admin/afiliados/desempenho" element={<DesempenhoDosAfiliados />} />
          <Route path="admin/repasses" element={<AdminRepasses />} />
          <Route path="admin/kanban" element={<AdminKanban />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="suporte" element={<Suporte />} />
          <Route path="tools" element={<Tools />} />
          <Route path="tutorials" element={<Tutorials />} />
          <Route
            path="settings"
            element={<Settings darkMode={darkMode} setDarkMode={setDarkMode} />}
          />
        </Route>

        {/* fornexa.site/joao — o link que o afiliado divulga. Só pega
            endereço de um pedaço só (sem barra), então nunca esbarra em
            /dashboard, /fornecedor etc., que são rotas de verdade. */}
        <Route path=":codigoAfiliado" element={<LandingComCodigoDeAfiliado />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;