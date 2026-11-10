import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';

import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import SupplierLogin from './pages/SupplierLogin';
import EsqueciSenha from './pages/EsqueciSenha';
import RedefinirSenha from './pages/RedefinirSenha';
import Assinar from './pages/Assinar';
import Obrigado from './pages/Obrigado';
const SupplierPortal = lazy(() => import('./pages/supplier/SupplierPortal'));

const DashboardLayout = lazy(() => import('./layouts/DashboardLayout'));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const Catalog = lazy(() => import('./pages/dashboard/Catalog'));
const Suppliers = lazy(() => import('./pages/dashboard/Suppliers'));
const MyProducts = lazy(() => import('./pages/dashboard/MyProducts'));
const Orders = lazy(() => import('./pages/dashboard/Orders'));
const TopVendedores = lazy(() => import('./pages/dashboard/TopVendedores'));
const Financial = lazy(() => import('./pages/dashboard/Financial'));
const Integrations = lazy(() => import('./pages/dashboard/Integrations'));
const AdminCatalogo = lazy(() => import('./pages/dashboard/AdminCatalogo'));
const AdminAvisos = lazy(() => import('./pages/dashboard/AdminAvisos'));
const AdminImpressao = lazy(() => import('./pages/dashboard/AdminImpressao'));
const AdminContas = lazy(() => import('./pages/dashboard/AdminContas'));
const AdminNumeros = lazy(() => import('./pages/dashboard/AdminNumeros'));
const GerenciarAfiliados = lazy(() => import('./components/dashboard/GerenciarAfiliados'));
const DesempenhoDosAfiliados = lazy(() =>
  import('./components/dashboard/AfiliadosAdmin').then((m) => ({ default: m.DesempenhoDosAfiliados }))
);
const PedidosDeAfiliado = lazy(() =>
  import('./components/dashboard/AfiliadosAdmin').then((m) => ({ default: m.PedidosDeAfiliado }))
);
const AdminRepasses = lazy(() => import('./pages/dashboard/AdminRepasses'));
const AdminKanban = lazy(() => import('./pages/dashboard/AdminKanban'));
const Tickets = lazy(() => import('./pages/dashboard/Tickets'));
const Suporte = lazy(() => import('./pages/dashboard/Suporte'));
const Tools = lazy(() => import('./pages/dashboard/Tools'));
const Tutorials = lazy(() => import('./pages/dashboard/Tutorials'));
const Settings = lazy(() => import('./pages/dashboard/Settings'));

/**
 * /dashboard/admin/<tela> → /admin/<tela>.
 *
 * O Admin saiu de dentro da área do vendedor e virou tela própria. Este
 * desvio mantém vivos os endereços antigos — favoritos, links em mensagem,
 * o "voltar" do portal do fornecedor —, levando junto a busca e o estado.
 */
function RedirecionaParaPainelAdmin() {
  const { '*': resto } = useParams();
  const location = useLocation();
  const destino = `/admin${resto ? `/${resto}` : ''}${location.search}${location.hash}`;
  return <Navigate to={destino} replace state={location.state} />;
}

import { supabase } from './lib/supabase';
import { fetchSupplierAccount } from './lib/supplierAuth';
import { planoEmDia, capturarCodigoDoAfiliado } from './lib/planos';
import { buscarCheckoutDoAfiliado } from './lib/afiliados';
import LinkDeAfiliadoInativo from './pages/LinkDeAfiliadoInativo';
import { Loader2 } from 'lucide-react';
import ToastProvider from './components/ui/ToastProvider';

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
 * O endereço FICA. Antes ele era trocado por fornexa.site/ assim que a
 * conferência passava, e o afiliado perdia a própria página: o link que ele
 * divulgava sumia da barra no primeiro segundo. Agora a landing é servida
 * ali mesmo, em /paulo, e é dele enquanto estiver aberta.
 *
 * Isso também segura a indicação quando o navegador não guarda nada -- aba
 * anônima, navegador de dentro do Instagram, armazenamento bloqueado. Com o
 * código só no localStorage, a venda dele viraria venda da casa; no endereço,
 * ele continua lá.
 *
 * O código é guardado assim mesmo, para quem sai da landing e volta depois
 * por /planos continuar comprando no checkout dele.
 */
function LandingComCodigoDeAfiliado() {
  const { codigoAfiliado } = useParams();
  const [inativo, setInativo] = useState(false);
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    let vivo = true;
    setInativo(false);
    setAtivo(false);

    buscarCheckoutDoAfiliado(codigoAfiliado ?? '').then((checkout) => {
      if (!vivo) return;

      if (!checkout || !codigoAfiliado) {
        setInativo(true);
        return;
      }

      capturarCodigoDoAfiliado(codigoAfiliado);
      setAtivo(true);
    });

    return () => {
      vivo = false;
    };
  }, [codigoAfiliado]);

  if (inativo) {
    return <LinkDeAfiliadoInativo />;
  }

  if (ativo) {
    return <LandingPage codigoDaRota={codigoAfiliado} />;
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
    <ToastProvider>
      <BrowserRouter>
      {/* O painel e o Portal só são baixados quando alguém entra neles.
          Antes vinha tudo num arquivo só de 1,6 MB: quem abria a landing no
          celular baixava junto os gráficos do financeiro, o kanban do admin e
          o Portal do Fornecedor — e o telefone ficava sem responder até
          terminar de processar. Era isso o "trava e depois de um tempo
          funciona". */}
      <Suspense fallback={<SessionLoading label="Carregando..." />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/obrigado" element={<Obrigado />} />

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
          <Route path="suppliers" element={<Navigate to="/admin/fornecedores" replace />} />
          <Route path="my-products" element={<MyProducts />} />
          <Route path="orders" element={<Orders />} />
          <Route path="top-vendedores" element={<TopVendedores />} />
          <Route path="financial" element={<Financial />} />
          <Route path="integrations" element={<Integrations />} />
          {/* O Admin virou tela própria, em /admin. Endereço antigo salvo nos
              favoritos ou escrito em algum link continua chegando. */}
          <Route path="admin/*" element={<RedirecionaParaPainelAdmin />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="suporte" element={<Suporte />} />
          <Route path="tools" element={<Tools />} />
          <Route path="tutorials" element={<Tutorials />} />
          <Route
            path="settings"
            element={<Settings darkMode={darkMode} setDarkMode={setDarkMode} />}
          />
        </Route>

        {/* Painel admin: tela própria, com menu, cor e cabeçalho dela. Usa o
            mesmo DashboardLayout, que troca tudo isso quando o endereço começa
            com /admin — e mantém a mesma trava de quem pode entrar. */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/catalogo" replace />} />
          <Route path="catalogo" element={<AdminCatalogo />} />
          <Route path="fornecedores" element={<Suppliers />} />
          <Route path="avisos" element={<AdminAvisos />} />
          <Route path="impressao" element={<AdminImpressao />} />
          <Route path="repasses" element={<AdminRepasses />} />
          <Route path="kanban" element={<AdminKanban />} />

          {/* Endereços antigos, de quando tudo morava sob /admin. Quem tem
              link salvo ou aba aberta não cai em tela de erro. */}
          <Route path="numeros" element={<Navigate to="/gestao/numeros" replace />} />
          <Route path="contas" element={<Navigate to="/gestao/contas" replace />} />
          <Route path="afiliados" element={<Navigate to="/afiliados/pedidos" replace />} />
          <Route path="afiliados/pedidos" element={<Navigate to="/afiliados/pedidos" replace />} />
          <Route
            path="afiliados/desempenho"
            element={<Navigate to="/afiliados/desempenho" replace />}
          />
          <Route
            path="afiliados/gerenciar"
            element={<Navigate to="/afiliados/gerenciar" replace />}
          />
        </Route>

        {/* Gestão: o que o dono e o co-produtor abrem juntos. */}
        <Route
          path="/gestao"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/gestao/numeros" replace />} />
          <Route path="numeros" element={<AdminNumeros />} />
          <Route path="contas" element={<AdminContas />} />
        </Route>

        {/* Parceria: a área de afiliados, que os dois tocam por inteiro. */}
        <Route
          path="/afiliados"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/afiliados/pedidos" replace />} />
          <Route path="pedidos" element={<PedidosDeAfiliado />} />
          <Route path="desempenho" element={<DesempenhoDosAfiliados />} />
          <Route path="gerenciar" element={<GerenciarAfiliados />} />
        </Route>

        {/* fornexa.site/joao — o link que o afiliado divulga. Só pega
            endereço de um pedaço só (sem barra), então nunca esbarra em
            /dashboard, /fornecedor etc., que são rotas de verdade. */}
        <Route path=":codigoAfiliado" element={<LandingComCodigoDeAfiliado />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;