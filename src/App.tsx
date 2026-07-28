import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';

import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';

import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/dashboard/Dashboard';
import Catalog from './pages/dashboard/Catalog';
import Suppliers from './pages/dashboard/Suppliers';
import MyProducts from './pages/dashboard/MyProducts';
import Orders from './pages/dashboard/Orders';
import Financial from './pages/dashboard/Financial';
import Integrations from './pages/dashboard/Integrations';
import Admin from './pages/dashboard/Admin';
import Tickets from './pages/dashboard/Tickets';
import Tools from './pages/dashboard/Tools';
import Tutorials from './pages/dashboard/Tutorials';
import Settings from './pages/dashboard/Settings';

import { supabase } from './lib/supabase';

interface ProtectedRouteProps {
  children: ReactNode;
}

interface Profile {
  name: string;
  email: string;
  plan: string;
  role: string;
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

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

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, email, plan, role')
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

      setAuthenticated(true);
      setCheckingSession(false);
    };

    checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-navy-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-black dark:border-navy-700 dark:border-t-white rounded-full animate-spin mx-auto" />

          <p className="text-sm text-gray-500 dark:text-slate-400 mt-4">
            Verificando sessão...
          </p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('fornexa_darkMode');
    return saved ? JSON.parse(saved) : false;
  });

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
          <Route path="admin" element={<Admin />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="tools" element={<Tools />} />
          <Route path="tutorials" element={<Tutorials />} />
          <Route
            path="settings"
            element={<Settings darkMode={darkMode} setDarkMode={setDarkMode} />}
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;