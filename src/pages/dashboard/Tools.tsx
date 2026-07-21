import { Calculator, FileText } from 'lucide-react';
import { useState } from 'react';

const tools = [
  { id: 'ml-calc', name: 'Calculadora Mercado Livre', icon: Calculator, type: 'calculator' },
  { id: 'shopee-calc', name: 'Calculadora Shopee', icon: Calculator, type: 'calculator' },
  { id: 'title-gen', name: 'Gerador de título', icon: FileText, type: 'generator' },
  { id: 'desc-gen', name: 'Gerador de descrição', icon: FileText, type: 'generator' },
  { id: 'margin-calc', name: 'Calculadora de margem', icon: Calculator, type: 'calculator' },
];

export default function Tools() {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [result, setResult] = useState<{ ml: number; profit: number } | null>(null);

  const calculateML = () => {
    const basePrice = parseFloat(price);

    if (isNaN(basePrice)) {
      return;
    }

    const mlFee = basePrice * 0.14;
    const profit = basePrice - mlFee;

    setResult({ ml: mlFee, profit });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-navy-900 dark:text-white">Ferramentas</h1>
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
          Calculadoras e geradores para suas vendas
        </p>
      </div>

      {/* Tools grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            className={`bg-white dark:bg-navy-800 rounded-xl border ${
              activeTool === tool.id
                ? 'border-accent ring-2 ring-accent/20'
                : 'border-gray-200 dark:border-navy-700'
            } p-5 shadow-sm hover:shadow-md transition-all text-left`}
          >
            <div className="p-3 bg-gray-100 dark:bg-navy-700 rounded-xl inline-block mb-4">
              <tool.icon className="w-6 h-6 text-gray-600 dark:text-slate-400" />
            </div>

            <h3 className="text-navy-900 dark:text-white font-semibold">{tool.name}</h3>

            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              {tool.type === 'calculator' ? 'Calcule taxas e margens' : 'Gere títulos e descrições'}
            </p>
          </button>
        ))}
      </div>

      {/* Calculator panel */}
      {activeTool === 'ml-calc' && (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-white/10 rounded-lg">
              <Calculator className="w-5 h-5 text-white" />
            </div>

            <h2 className="text-lg font-semibold text-navy-900 dark:text-white">
              Calculadora Mercado Livre
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                Preço de venda
              </label>

              <div className="flex items-center">
                <span className="text-gray-500 dark:text-slate-400 mr-2">R$</span>

                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0,00"
                  className="flex-1 px-4 py-2.5 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-lg text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <button
                onClick={calculateML}
                className="mt-4 w-full px-4 py-2.5 bg-white hover:bg-gray-100 text-black rounded-lg text-sm font-medium transition-colors"
              >
                Calcular
              </button>
            </div>

            {result && (
              <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-5">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 dark:text-slate-400">
                      Taxa ML (~14%)
                    </span>

                    <span className="text-red-600 dark:text-red-400 font-semibold">
                      -R$ {result.ml.toFixed(2).replace('.', ',')}
                    </span>
                  </div>

                  <div className="border-t border-gray-200 dark:border-navy-600 pt-4 flex justify-between items-center">
                    <span className="text-sm font-medium text-navy-900 dark:text-white">
                      Seu lucro
                    </span>

                    <span className="text-green-600 dark:text-green-400 text-xl font-bold">
                      R$ {result.profit.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}