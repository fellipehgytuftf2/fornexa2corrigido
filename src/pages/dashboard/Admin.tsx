import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle,
  Edit,
  Image,
  Package,
  Plus,
  RefreshCw,
  Search,
  Store,
  Trash2,
  Truck,
  Upload,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Supplier {
  id: string;
  name: string;
  company_name: string;
  whatsapp: string;
  city: string;
  state: string;
  status: 'active' | 'inactive';
}

interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  image_url: string;
  supplier_price: number;
  stock: number;
  status: 'active' | 'inactive';
  supplier_id: string | null;
  created_at: string;
  suppliers?: Supplier | Supplier[] | null;
}

interface ProductForm {
  name: string;
  description: string;
  category: string;
  image_url: string;
  supplier_price: string;
  stock: string;
  status: 'active' | 'inactive';
  supplier_id: string;
}

const initialForm: ProductForm = {
  name: '',
  description: '',
  category: '',
  image_url: '',
  supplier_price: '',
  stock: '',
  status: 'active',
  supplier_id: '',
};

export default function Admin() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [checkingPermission, setCheckingPermission] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<ProductForm>(initialForm);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageUpload = async (file: File) => {
    setUploadingImage(true);
    setErrorMessage('');

    // Nome de arquivo único para evitar sobrescrever imagens de outros
    // produtos com o mesmo nome original.
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      setUploadingImage(false);
      setErrorMessage(`Não foi possível enviar a imagem: ${uploadError.message}`);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName);

    setForm((prev) => ({ ...prev, image_url: publicUrlData.publicUrl }));
    setUploadingImage(false);
  };

  const loadData = async () => {
    setLoading(true);
    setErrorMessage('');

    const [productsResult, suppliersResult] = await Promise.all([
      supabase
        .from('catalog_products')
        .select(`
          id,
          name,
          description,
          category,
          image_url,
          supplier_price,
          stock,
          status,
          supplier_id,
          created_at,
          suppliers (
            id,
            name,
            company_name,
            whatsapp,
            city,
            state,
            status
          )
        `)
        .order('created_at', { ascending: false }),

      supabase
        .from('suppliers')
        .select('id, name, company_name, whatsapp, city, state, status')
        .order('created_at', { ascending: false }),
    ]);

    setLoading(false);

    if (productsResult.error || suppliersResult.error) {
      console.error('Erro produtos:', productsResult.error);
      console.error('Erro fornecedores:', suppliersResult.error);
      setProducts([]);
      setSuppliers([]);
      setErrorMessage('Não foi possível carregar catálogo e fornecedores.');
      return;
    }

    setProducts((productsResult.data || []) as CatalogProduct[]);
    setSuppliers((suppliersResult.data || []) as Supplier[]);
  };

  useEffect(() => {
    const checkAdminPermission = async () => {
      setCheckingPermission(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setIsAdmin(false);
        setCheckingPermission(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (error || data?.role !== 'admin') {
        setIsAdmin(false);
        setCheckingPermission(false);
        return;
      }

      setIsAdmin(true);
      setCheckingPermission(false);

      await loadData();
    };

    checkAdminPermission();
  }, []);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);

    setTimeout(() => {
      setSuccessMessage('');
    }, 4000);
  };

  const getSupplier = (product: CatalogProduct) => {
    if (Array.isArray(product.suppliers)) {
      return product.suppliers[0];
    }

    return product.suppliers || null;
  };

  const activeSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => supplier.status === 'active');
  }, [suppliers]);

  const filteredProducts = useMemo(() => {
    const search = searchTerm.toLowerCase();

    return products.filter((product) => {
      const supplier = getSupplier(product);

      return (
        product.name.toLowerCase().includes(search) ||
        product.description.toLowerCase().includes(search) ||
        product.category.toLowerCase().includes(search) ||
        supplier?.name?.toLowerCase().includes(search) ||
        supplier?.company_name?.toLowerCase().includes(search)
      );
    });
  }, [products, searchTerm]);

  const summary = useMemo(() => {
    const activeProducts = products.filter((product) => product.status === 'active').length;
    const inactiveProducts = products.filter((product) => product.status === 'inactive').length;
    const linkedProducts = products.filter((product) => product.supplier_id).length;

    return {
      totalProducts: products.length,
      activeProducts,
      inactiveProducts,
      linkedProducts,
    };
  }, [products]);

  const formatCurrency = (value: number) => {
    return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
  };

  const formatDate = (value: string) => {
    return new Date(value).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingProductId(null);
  };

  const handleEditProduct = (product: CatalogProduct) => {
    setEditingProductId(product.id);

    setForm({
      name: product.name || '',
      description: product.description || '',
      category: product.category || '',
      image_url: product.image_url || '',
      supplier_price: String(product.supplier_price || ''),
      stock: String(product.stock || ''),
      status: product.status || 'active',
      supplier_id: product.supplier_id || '',
    });

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const validateForm = () => {
    if (!form.name.trim()) {
      return 'Informe o nome do produto.';
    }

    if (!form.description.trim()) {
      return 'Informe a descrição do produto.';
    }

    if (!form.category.trim()) {
      return 'Informe a categoria do produto.';
    }

    if (!form.image_url.trim()) {
      return 'Informe a URL da imagem do produto.';
    }

    if (!form.supplier_id) {
      return 'Escolha o fornecedor responsável pelo produto.';
    }

    if (Number(form.supplier_price) <= 0) {
      return 'Informe um preço de fornecedor válido.';
    }

    if (Number(form.stock) < 0) {
      return 'Informe um estoque válido.';
    }

    return '';
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSaving(true);
    setErrorMessage('');

    const validationError = validateForm();

    if (validationError) {
      setSaving(false);
      setErrorMessage(validationError);
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
      image_url: form.image_url.trim(),
      supplier_price: Number(form.supplier_price),
      stock: Number(form.stock),
      status: form.status,
      supplier_id: form.supplier_id,
    };

    if (editingProductId) {
      const { error } = await supabase
        .from('catalog_products')
        .update(payload)
        .eq('id', editingProductId);

      setSaving(false);

      if (error) {
        console.error('Erro ao atualizar produto:', error);
        setErrorMessage(`Não foi possível atualizar o produto: ${error.message}`);
        return;
      }

      resetForm();
      await loadData();
      showSuccess('Produto atualizado no catálogo.');
      return;
    }

    const { error } = await supabase.from('catalog_products').insert(payload);

    setSaving(false);

    if (error) {
      console.error('Erro ao cadastrar produto:', error);
      setErrorMessage(`Não foi possível cadastrar o produto: ${error.message}`);
      return;
    }

    resetForm();
    await loadData();
    showSuccess('Produto cadastrado no catálogo.');
  };

  const handleToggleStatus = async (product: CatalogProduct) => {
    setActionId(product.id);
    setErrorMessage('');

    const newStatus = product.status === 'active' ? 'inactive' : 'active';

    const { error } = await supabase
      .from('catalog_products')
      .update({
        status: newStatus,
      })
      .eq('id', product.id);

    setActionId(null);

    if (error) {
      console.error('Erro ao alterar status:', error);
      setErrorMessage(`Não foi possível alterar o status: ${error.message}`);
      return;
    }

    await loadData();
    showSuccess(newStatus === 'active' ? 'Produto ativado.' : 'Produto inativado.');
  };

  const handleDeleteProduct = async (productId: string) => {
    setActionId(productId);
    setErrorMessage('');

    const { error } = await supabase.from('catalog_products').delete().eq('id', productId);

    setActionId(null);

    if (error) {
      console.error('Erro ao excluir produto:', error);
      setErrorMessage(`Não foi possível excluir o produto: ${error.message}`);
      return;
    }

    if (editingProductId === productId) {
      resetForm();
    }

    await loadData();
    showSuccess('Produto excluído do catálogo.');
  };

  if (checkingPermission) {
    return (
      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-black dark:border-navy-700 dark:border-t-white rounded-full animate-spin mx-auto" />

        <p className="text-gray-500 dark:text-slate-400 text-sm mt-4">
          Verificando permissão de administrador...
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />

        <h1 className="text-2xl font-bold text-navy-900 dark:text-white">
          Acesso negado
        </h1>

        <p className="text-gray-500 dark:text-slate-400 text-sm mt-2 max-w-xl mx-auto">
          Esta área é exclusiva para administradores do FORNEXA. Você pode continuar usando o catálogo, produtos, pedidos e financeiro normalmente.
        </p>

        <Link
          to="/dashboard"
          className="inline-flex items-center justify-center mt-6 px-5 py-3 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors"
        >
          Voltar para o Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 dark:text-white">
            Gestão do Catálogo
          </h1>

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            Cadastre produtos reais, vincule fornecedores e controle o catálogo do FORNEXA.
          </p>
        </div>

        <button
          onClick={loadData}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar catálogo
        </button>
      </div>

      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />

          <p className="text-green-700 dark:text-green-400 text-sm font-medium">
            {successMessage}
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />

          <p className="text-red-700 dark:text-red-400 text-sm font-medium">
            {errorMessage}
          </p>
        </div>
      )}

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <p className="text-blue-700 dark:text-blue-400 text-sm font-medium">
          Catálogo administrável
        </p>

        <p className="text-blue-700 dark:text-blue-400 text-sm mt-1">
          Os produtos cadastrados aqui aparecem na tela Catálogo e podem ser salvos em Meus Produtos.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Produtos no catálogo</p>

          <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
            {summary.totalProducts}
          </p>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Produtos ativos</p>

          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
            {summary.activeProducts}
          </p>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Produtos inativos</p>

          <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
            {summary.inactiveProducts}
          </p>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Vinculados</p>

          <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
            {summary.linkedProducts}
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden"
      >
        <div className="p-5 border-b border-gray-200 dark:border-navy-700">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-navy-900 dark:text-white" />

            <h2 className="text-lg font-bold text-navy-900 dark:text-white">
              {editingProductId ? 'Editar produto do catálogo' : 'Cadastrar produto no catálogo'}
            </h2>
          </div>

          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            Preencha os dados do produto e escolha o fornecedor responsável.
          </p>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
              Nome do produto
            </label>

            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ex: Fone Bluetooth Sem Fio"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
              Categoria
            </label>

            <input
              type="text"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              placeholder="Ex: Eletrônicos"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
              Descrição
            </label>

            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Descreva o produto, uso, características e diferenciais."
              rows={4}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
              Imagem do produto
            </label>

            <div className="flex items-center gap-4">
              {form.image_url && (
                <img
                  src={form.image_url}
                  alt="Preview"
                  className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-navy-600 shrink-0"
                />
              )}

              <label
                className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-medium transition-colors cursor-pointer ${
                  uploadingImage ? 'opacity-60 pointer-events-none' : ''
                }`}
              >
                <Upload className="w-4 h-4" />
                {uploadingImage ? 'Enviando...' : 'Enviar imagem'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingImage}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      handleImageUpload(file);
                    }
                    // Permite selecionar o mesmo arquivo de novo depois,
                    // caso o usuário queira reenviar.
                    event.target.value = '';
                  }}
                />
              </label>
            </div>

            <div className="relative mt-3">
              <Image className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />

              <input
                type="url"
                value={form.image_url}
                onChange={(event) => setForm({ ...form, image_url: event.target.value })}
                placeholder="Ou cole uma URL de imagem externa: https://..."
                className="w-full pl-12 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
              Fornecedor
            </label>

            <select
              value={form.supplier_id}
              onChange={(event) => setForm({ ...form, supplier_id: event.target.value })}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            >
              <option value="">Escolha um fornecedor</option>

              {activeSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} — {supplier.company_name}
                </option>
              ))}
            </select>

            {activeSuppliers.length === 0 && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                Cadastre pelo menos um fornecedor ativo antes de criar produtos.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
              Preço do fornecedor
            </label>

            <input
              type="number"
              value={form.supplier_price}
              onChange={(event) => setForm({ ...form, supplier_price: event.target.value })}
              placeholder="39.90"
              min="0"
              step="0.01"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
              Estoque
            </label>

            <input
              type="number"
              value={form.stock}
              onChange={(event) => setForm({ ...form, stock: event.target.value })}
              placeholder="100"
              min="0"
              step="1"
              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
              Status
            </label>

            <select
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as 'active' | 'inactive' })
              }
              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
        </div>

        <div className="p-5 border-t border-gray-200 dark:border-navy-700 flex flex-col sm:flex-row gap-3 justify-end">
          {editingProductId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-3 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm font-semibold hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors"
            >
              Cancelar edição
            </button>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Salvando...
              </>
            ) : editingProductId ? (
              <>
                <Edit className="w-4 h-4" />
                Atualizar produto
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Cadastrar produto
              </>
            )}
          </button>
        </div>
      </form>

      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-4 shadow-sm">
        <div className="relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />

          <input
            type="text"
            placeholder="Buscar produto, categoria ou fornecedor..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-black dark:border-navy-700 dark:border-t-white rounded-full animate-spin mx-auto" />

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-4">
            Carregando catálogo...
          </p>
        </div>
      ) : filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {filteredProducts.map((product) => {
            const supplier = getSupplier(product);

            return (
              <div
                key={product.id}
                className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden"
              >
                <div className="p-5">
                  <div className="flex gap-4">
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-24 h-24 rounded-xl object-cover bg-gray-100 dark:bg-navy-700"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            product.status === 'active'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-700 dark:bg-navy-700 dark:text-slate-300'
                          }`}
                        >
                          {product.status === 'active' ? 'Ativo' : 'Inativo'}
                        </span>

                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-navy-700 dark:text-slate-300">
                          {product.category}
                        </span>
                      </div>

                      <h3 className="text-navy-900 dark:text-white font-bold mt-3 line-clamp-2">
                        {product.name}
                      </h3>

                      <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
                        Criado em {formatDate(product.created_at)}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-slate-400 mt-4 line-clamp-2">
                    {product.description}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                    <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-3">
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        Preço fornecedor
                      </p>

                      <p className="text-sm font-bold text-navy-900 dark:text-white mt-1">
                        {formatCurrency(product.supplier_price)}
                      </p>
                    </div>

                    <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-3">
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        Estoque
                      </p>

                      <p className="text-sm font-bold text-navy-900 dark:text-white mt-1">
                        {product.stock} un.
                      </p>
                    </div>

                    <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-3">
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        Fornecedor
                      </p>

                      <p className="text-sm font-bold text-navy-900 dark:text-white mt-1 line-clamp-1">
                        {supplier?.name || 'Não vinculado'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 bg-gray-50 dark:bg-navy-700 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Truck className="w-5 h-5 text-gray-600 dark:text-slate-400 mt-0.5" />

                      <div>
                        <p className="text-sm font-medium text-navy-900 dark:text-white">
                          {supplier?.company_name || 'Fornecedor não vinculado'}
                        </p>

                        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                          {supplier
                            ? `${supplier.city || ''}${
                                supplier.city && supplier.state ? '/' : ''
                              }${supplier.state || ''}`
                            : 'Escolha um fornecedor para este produto.'}
                        </p>

                        {supplier?.whatsapp && (
                          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                            WhatsApp: {supplier.whatsapp}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => handleEditProduct(product)}
                      disabled={actionId === product.id}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      <Edit className="w-4 h-4" />
                      Editar
                    </button>

                    <button
                      onClick={() => handleToggleStatus(product)}
                      disabled={actionId === product.id}
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      <Store className="w-4 h-4" />
                      {product.status === 'active' ? 'Inativar' : 'Ativar'}
                    </button>

                    <button
                      onClick={() => handleDeleteProduct(product.id)}
                      disabled={actionId === product.id}
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-16 text-center">
          <Package className="w-12 h-12 text-gray-300 dark:text-navy-600 mx-auto mb-4" />

          <h3 className="text-navy-900 dark:text-white font-semibold">
            Nenhum produto encontrado
          </h3>

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-2">
            Cadastre o primeiro produto real do catálogo.
          </p>
        </div>
      )}
    </div>
  );
}