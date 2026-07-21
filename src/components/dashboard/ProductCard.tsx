import { Product } from '../../types';

interface ProductCardProps {
  product: Product;
  onRegister: () => void;
}

export default function ProductCard({ product, onRegister }: ProductCardProps) {
  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 overflow-hidden hover:shadow-lg transition-shadow">
      <div className="aspect-[4/3] overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
        />
      </div>

      <div className="p-4">
        <h3 className="text-navy-900 dark:text-white font-semibold text-sm mb-2 line-clamp-2">
          {product.name}
        </h3>

        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
            Em estoque: {product.stock}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Preço fornecedor
            </p>
            <p className="text-lg font-bold text-navy-900 dark:text-white">
              R$ {product.supplierPrice.toFixed(2).replace('.', ',')}
            </p>
          </div>

          <button
            onClick={onRegister}
            className="px-4 py-2 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-lg text-sm font-medium text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-600 transition-colors"
          >
            Cadastrar
          </button>
        </div>
      </div>
    </div>
  );
}