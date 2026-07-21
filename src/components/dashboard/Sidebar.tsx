import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  DollarSign,
  LayoutDashboard,
  Link2,
  Package,
  ShoppingCart,
  Truck,
  Users,
} from 'lucide-react';

const menuItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/dashboard/catalog', icon: Package, label: 'Catálogo' },
  { to: '/dashboard/admin', icon: Package, label: 'Gestão do Catálogo' },
  { to: '/dashboard/my-products', icon: ShoppingCart, label: 'Meus Produtos' },
  { to: '/dashboard/suppliers', icon: Truck, label: 'Fornecedores' },
  { to: '/dashboard/orders', icon: ShoppingCart, label: 'Pedidos' },
  { to: '/dashboard/financial', icon: DollarSign, label: 'Financeiro' },
  { to: '/dashboard/integrations', icon: Link2, label: 'Integrações' },
  { to: '/dashboard/reports', icon: BarChart3, label: 'Relatórios' },
  { to: '/dashboard/customers', icon: Users, label: 'Clientes' },
];

export default function Sidebar() {
  return (
    <aside className="hidden lg:flex w-72 min-h-screen bg-white dark:bg-navy-900 border-r border-gray-200 dark:border-navy-700 flex-col">
      <div className="p-6 border-b border-gray-200 dark:border-navy-700">
        <h1 className="text-xl font-bold text-navy-900 dark:text-white">
          FORNEXA
        </h1>

        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          Área do vendedor
        </p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
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
    </aside>
  );
}