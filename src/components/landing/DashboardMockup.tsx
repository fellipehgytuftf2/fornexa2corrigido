import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  TrendingUp,
  Settings,
} from 'lucide-react';

export default function DashboardMockup() {
  return (
    <section className="relative bg-black pb-32">
      <div className="max-w-6xl mx-auto px-6 -mt-8">
        <div className="relative bg-navy-800 rounded-2xl border border-navy-600 shadow-mockup overflow-hidden">
          {/* Window bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-navy-700 border-b border-navy-600">
            <div className="flex items-center gap-2">
              <div className="window-dot bg-red-500" />
              <div className="window-dot bg-yellow-500" />
              <div className="window-dot bg-green-500" />
            </div>
            <div className="flex-1 mx-4">
              <div className="bg-navy-800 rounded-md px-4 py-1.5 text-slate-500 text-sm text-center font-mono">
                app.fornexa.io/dashboard
              </div>
            </div>
            <div className="w-8" />
          </div>

          {/* Mock dashboard content */}
          <div className="flex min-h-[400px]">
            {/* Sidebar */}
            <div className="w-56 bg-white border-r border-gray-200 p-4 hidden md:block">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-7 h-7 bg-black rounded flex items-center justify-center">
                  <span className="text-white font-bold text-xs">F</span>
                </div>
                <span className="text-black font-semibold text-sm">FORNEXA</span>
              </div>

              <nav className="space-y-1">
                {[
                  { icon: LayoutDashboard, label: 'Dashboard', active: true },
                  { icon: Package, label: 'Catálogo' },
                  { icon: ShoppingCart, label: 'Pedidos' },
                  { icon: TrendingUp, label: 'Financeiro' },
                  { icon: Settings, label: 'Configurações' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      item.active
                        ? 'bg-gray-100 text-black font-medium'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </div>
                ))}
              </nav>
            </div>

            {/* Main content */}
            <div className="flex-1 bg-gray-50 p-6">
              <div className="mb-6">
                <p className="text-gray-500 text-sm mb-1">Bom dia, Lojista</p>
                <h2 className="text-black text-xl font-semibold">Resumo da operação</h2>
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Produtos disponíveis', value: '1,247' },
                  { label: 'Pedidos', value: '23' },
                  { label: 'ML Conectado', value: 'Ativo' },
                  { label: 'Lucro estimado', value: 'R$ 1.847' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-gray-500 text-xs mb-1">{stat.label}</p>
                    <p className="text-black text-xl font-bold">{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* Recent orders table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="text-black font-semibold text-sm">Pedidos recentes</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {[
                    { customer: 'Maria Silva', product: 'Fone Bluetooth', value: 'R$ 59,90', status: 'Processando' },
                    { customer: 'João Santos', product: 'Smartwatch Pro', value: 'R$ 129,90', status: 'Enviado' },
                    { customer: 'Ana Oliveira', product: 'Mochila Urbana', value: 'R$ 89,90', status: 'Entregue' },
                  ].map((order, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-black text-sm font-medium">{order.customer}</p>
                        <p className="text-gray-500 text-xs">{order.product}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-black text-sm font-medium">{order.value}</p>
                        <p className="text-xs text-gray-600">{order.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
