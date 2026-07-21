import { User, Mail, Lock, CreditCard, Sun, Moon } from 'lucide-react';

interface SettingsProps {
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
}

export default function Settings({ darkMode, setDarkMode }: SettingsProps) {
  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-navy-900 dark:text-white">Configurações</h1>
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
          Gerencie sua conta e preferências
        </p>
      </div>

      {/* Profile section */}
      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-navy-900 dark:text-white mb-6">Perfil</h2>

        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-navy-900 dark:text-white mb-2">
              <User className="w-4 h-4" />
              Nome
            </label>
            <input
              type="text"
              defaultValue="Demo User"
              className="w-full px-4 py-2.5 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-lg text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-navy-900 dark:text-white mb-2">
              <Mail className="w-4 h-4" />
              Email
            </label>
            <input
              type="email"
              defaultValue="demo@fornexa.io"
              className="w-full px-4 py-2.5 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-lg text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-navy-900 dark:text-white mb-2">
              <Lock className="w-4 h-4" />
              Senha
            </label>
            <input
              type="password"
              defaultValue="••••••••"
              className="w-full px-4 py-2.5 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-lg text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>
      </div>

      {/* Plan section */}
      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-navy-900 dark:text-white mb-4">Plano atual</h2>

        <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-navy-900 dark:text-white font-medium">Plano Vitalício</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">Acesso completo</p>
            </div>
          </div>
          <span className="px-3 py-1 bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-400 text-sm font-medium rounded-full">
            Ativo
          </span>
        </div>
      </div>

      {/* Appearance section */}
      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-navy-900 dark:text-white mb-4">Aparência</h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-navy-900 dark:text-white font-medium">Modo escuro</p>
            <p className="text-sm text-gray-500 dark:text-slate-400">Alternar entre tema claro e escuro</p>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`relative w-14 h-8 rounded-full transition-colors ${
              darkMode ? 'bg-white' : 'bg-gray-300 dark:bg-navy-600'
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

      {/* Save button */}
      <button className="w-full px-4 py-3 bg-white hover:bg-gray-100 text-black rounded-lg font-medium transition-colors">
        Salvar alterações
      </button>
    </div>
  );
}
