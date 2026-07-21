import { Sun, Moon, RefreshCw } from 'lucide-react';

interface DashboardHeaderProps {
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
}

export default function DashboardHeader({ darkMode, setDarkMode }: DashboardHeaderProps) {
  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  return (
    <header className="bg-white dark:bg-navy-800 border-b border-gray-200 dark:border-navy-600 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-navy-900 dark:text-white text-xl font-semibold">
            {greeting()}, Lojista
          </h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm">Resumo da operação</p>
        </div>

        <div className="flex items-center gap-4">
          {/* Period filters */}
          <div className="hidden sm:flex items-center gap-2 bg-gray-100 dark:bg-navy-700 rounded-lg p-1">
            {['7d', '30d', '12m'].map((period) => (
              <button
                key={period}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  period === '7d'
                    ? 'bg-white dark:bg-navy-600 text-navy-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white'
                }`}
              >
                {period}
              </button>
            ))}
          </div>

          <button className="flex items-center gap-2 text-gray-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm hidden sm:inline">Atualizar</span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg bg-gray-100 dark:bg-navy-700 hover:bg-gray-200 dark:hover:bg-navy-600 transition-colors"
            aria-label="Toggle theme"
          >
            {darkMode ? (
              <Sun className="w-5 h-5 text-yellow-500" />
            ) : (
              <Moon className="w-5 h-5 text-navy-900" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
