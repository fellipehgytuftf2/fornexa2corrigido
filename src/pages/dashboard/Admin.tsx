import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle,
  Copy,
  Download,
  FileSpreadsheet,
  Edit,
  Image,
  KeyRound,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Store,
  Trash2,
  Truck,
  Upload,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  CSV_MODELO,
  lerArquivo,
  lerPlanilha,
  type ErroDeLinha,
  type ProdutoImportado,
} from '../../lib/importarCatalogo';

interface Supplier {
  id: string;
  name: string;
  company_name: string;
  whatsapp: string;
  city: string;
  state: string;
  status: 'active' | 'inactive';

  // Só vêm na listagem de fornecedores, não no join do catálogo.
  email?: string | null;
  auth_user_id?: string | null;
}

/** Credenciais recém-criadas. Só existem em memória, some ao sair da tela. */
interface CreatedAccess {
  supplierName: string;
  email: string;
  password: string;
  warning: string | null;
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

  // --- Acesso do fornecedor ao Portal ---
  const [accessSupplierId, setAccessSupplierId] = useState<string | null>(null);
  const [accessEmail, setAccessEmail] = useState('');
  const [creatingAccess, setCreatingAccess] = useState(false);
  const [createdAccess, setCreatedAccess] = useState<CreatedAccess | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const openAccessForm = (supplier: Supplier) => {
    setAccessSupplierId(supplier.id);
    setAccessEmail(supplier.email || '');
    setCreatedAccess(null);
    setErrorMessage('');
  };

  const closeAccessForm = () => {
    setAccessSupplierId(null);
    setAccessEmail('');
  };

  const copyToClipboard = async (value: string, field: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      setErrorMessage('Não foi possível copiar. Selecione o texto e copie manualmente.');
    }
  };

  // --- Importação de catálogo por planilha ---
  const [importAberto, setImportAberto] = useState(false);
  const [importFornecedor, setImportFornecedor] = useState('');
  const [importArquivo, setImportArquivo] = useState('');
  const [importProdutos, setImportProdutos] = useState<ProdutoImportado[]>([]);
  const [importErros, setImportErros] = useState<ErroDeLinha[]>([]);
  const [importando, setImportando] = useState(false);

  const baixarModelo = () => {
    // BOM na frente para o Excel abrir com os acentos certos em vez de
    // interpretar o arquivo como ANSI.
    const blob = new Blob(['﻿', CSV_MODELO], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'modelo-catalogo-fornexa.csv';
    link.click();

    URL.revokeObjectURL(url);
  };

  const lerArquivoDaPlanilha = async (arquivo: File) => {
    setErrorMessage('');
    setImportArquivo(arquivo.name);

    const texto = await lerArquivo(arquivo);
    const { produtos, erros } = lerPlanilha(texto);

    setImportProdutos(produtos);
    setImportErros(erros);
  };

  const confirmarImportacao = async () => {
    if (!importFornecedor || importProdutos.length === 0) {
      return;
    }

    setImportando(true);
    setErrorMessage('');

    const payload = importProdutos.map((produto) => ({
      ...produto,
      supplier_id: importFornecedor,
      status: 'active' as const,
    }));

    const { error } = await supabase.from('catalog_products').insert(payload);

    setImportando(false);

    if (error) {
      console.error('Erro ao importar catálogo:', error);
      setErrorMessage(`Não foi possível importar: ${error.message}`);
      return;
    }

    const total = importProdutos.length;

    setImportProdutos([]);
    setImportErros([]);
    setImportArquivo('');
    setImportAberto(false);

    await loadData();
    showSuccess(`${total} produto(s) importado(s) para o catálogo.`);
  };

  const handleRevokeAccess = async (supplier: Supplier) => {
    setRevokingId(supplier.id);
    setErrorMessage('');
    setCreatedAccess(null);

    const { data, error } = await supabase.functions.invoke<{
      supplier_name?: string;
      account_was_missing?: boolean;
      error?: string;
    }>('supplier-revoke-access', {
      body: { supplier_id: supplier.id },
    });

    if (error || !data?.supplier_name) {
      let specificMessage: string | undefined = data?.error;

      const errorContext = (
        error as { context?: { json?: () => Promise<{ error?: string }> } } | null
      )?.context;

      if (!specificMessage && errorContext?.json) {
        try {
          const errorBody = await errorContext.json();
          specificMessage = errorBody?.error;
        } catch {
          // segue com a mensagem genérica
        }
      }

      setRevokingId(null);
      setErrorMessage(specificMessage ?? 'Não foi possível remover o acesso do fornecedor.');
      return;
    }

    setRevokingId(null);
    setConfirmRevokeId(null);
    await loadData();
    showSuccess(
      data.account_was_missing
        ? `Vínculo removido de ${data.supplier_name}. A conta de login já não existia.`
        : `Acesso removido de ${data.supplier_name}. A conta de login foi apagada.`
    );
  };

  const handleCreateAccess = async (supplier: Supplier) => {
    setCreatingAccess(true);
    setErrorMessage('');
    setCreatedAccess(null);

    const { data, error } = await supabase.functions.invoke<{
      email?: string;
      password?: string;
      supplier_name?: string;
      profile_warning?: string | null;
      error?: string;
    }>('supplier-create-access', {
      body: {
        supplier_id: supplier.id,
        email: accessEmail.trim().toLowerCase(),
      },
    });

    if (error || !data?.password) {
      // Em respostas não-2xx o supabase-js não popula "data" — o corpo real
      // vem em error.context. Mesmo tratamento usado em Pedidos.
      let specificMessage: string | undefined = data?.error;

      const errorContext = (
        error as { context?: { json?: () => Promise<{ error?: string }> } } | null
      )?.context;

      if (!specificMessage && errorContext?.json) {
        try {
          const errorBody = await errorContext.json();
          specificMessage = errorBody?.error;
        } catch {
          // segue com a mensagem genérica
        }
      }

      setCreatingAccess(false);
      setErrorMessage(specificMessage ?? 'Não foi possível criar o acesso do fornecedor.');
      return;
    }

    setCreatingAccess(false);
    setCreatedAccess({
      supplierName: data.supplier_name || supplier.company_name || supplier.name,
      email: data.email || accessEmail.trim().toLowerCase(),
      password: data.password,
      warning: data.profile_warning ?? null,
    });

    closeAccessForm();
    await loadData();
  };

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
        .select('id, name, company_name, whatsapp, city, state, status, email, auth_user_id')
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

      {/* --------------------------------------------------------------
          Acessos ao Portal do Fornecedor
         -------------------------------------------------------------- */}
      <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-navy-700">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-navy-900 dark:text-white" />

            <h2 className="text-lg font-bold text-navy-900 dark:text-white">
              Acesso ao Portal do Fornecedor
            </h2>
          </div>

          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            Crie o login do fornecedor para ele acompanhar os próprios pedidos. A senha
            aparece uma única vez — copie e repasse ao fornecedor.
          </p>
        </div>

        {createdAccess && (
          <div className="m-5 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                  Acesso criado para {createdAccess.supplierName}
                </p>

                <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                  Esta senha não pode ser consultada depois. Copie agora e envie ao
                  fornecedor por um canal privado.
                </p>

                <div className="mt-4 space-y-2">
                  {[
                    { label: 'E-mail', value: createdAccess.email, field: 'email' },
                    { label: 'Senha', value: createdAccess.password, field: 'password' },
                  ].map((item) => (
                    <div
                      key={item.field}
                      className="flex items-center gap-3 rounded-lg bg-white dark:bg-navy-800 border border-green-200 dark:border-green-800 px-3 py-2.5"
                    >
                      <span className="text-xs text-gray-500 dark:text-slate-400 w-14 shrink-0">
                        {item.label}
                      </span>

                      <code className="text-sm font-mono text-navy-900 dark:text-white break-all flex-1">
                        {item.value}
                      </code>

                      <button
                        type="button"
                        onClick={() => copyToClipboard(item.value, item.field)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-navy-600 text-xs font-medium text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors shrink-0"
                      >
                        {copiedField === item.field ? (
                          <>
                            <CheckCircle className="w-3.5 h-3.5" />
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copiar
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>

                {createdAccess.warning && (
                  <p className="text-xs text-yellow-700 dark:text-yellow-500 mt-3">
                    {createdAccess.warning}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setCreatedAccess(null)}
                  className="mt-4 text-sm font-semibold text-green-800 dark:text-green-300 hover:underline"
                >
                  Já copiei, pode esconder
                </button>
              </div>
            </div>
          </div>
        )}

        {suppliers.length === 0 ? (
          <p className="p-5 text-sm text-gray-500 dark:text-slate-400">
            Nenhum fornecedor cadastrado ainda.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-navy-700">
            {suppliers.map((supplier) => {
              const hasAccess = Boolean(supplier.auth_user_id);
              const isEditing = accessSupplierId === supplier.id;

              return (
                <li key={supplier.id} className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-navy-900 dark:text-white truncate">
                        {supplier.company_name || supplier.name}
                      </p>

                      <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 truncate">
                        {supplier.email || 'Sem e-mail cadastrado'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {hasAccess ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Acesso ativo
                          </span>

                          <button
                            type="button"
                            onClick={() => setConfirmRevokeId(supplier.id)}
                            disabled={revokingId === supplier.id}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-semibold transition-colors disabled:opacity-50"
                          >
                            <ShieldOff className="w-4 h-4" />
                            Remover acesso
                          </button>
                        </>
                      ) : isEditing ? null : (
                        <button
                          type="button"
                          onClick={() => openAccessForm(supplier)}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors"
                        >
                          <KeyRound className="w-4 h-4" />
                          Criar acesso
                        </button>
                      )}
                    </div>
                  </div>

                  {confirmRevokeId === supplier.id && hasAccess && (
                    <div className="mt-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />

                        <div>
                          <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                            Remover o acesso de {supplier.company_name || supplier.name}?
                          </p>

                          <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                            A conta de login é apagada e a senha atual deixa de valer. O
                            cadastro do fornecedor e os pedidos continuam intactos, e o
                            e-mail volta a ficar livre para criar um acesso novo.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 mt-4">
                        <button
                          type="button"
                          onClick={() => handleRevokeAccess(supplier)}
                          disabled={revokingId === supplier.id}
                          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                          {revokingId === supplier.id ? (
                            <>
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Removendo...
                            </>
                          ) : (
                            <>
                              <ShieldOff className="w-4 h-4" />
                              Sim, remover o acesso
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setConfirmRevokeId(null)}
                          disabled={revokingId === supplier.id}
                          className="px-4 py-3 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm font-semibold hover:bg-white dark:hover:bg-navy-800 transition-colors disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {isEditing && !hasAccess && (
                    <div className="mt-4 rounded-xl bg-gray-50 dark:bg-navy-700 p-4">
                      <label
                        htmlFor={`access-email-${supplier.id}`}
                        className="block text-sm font-medium text-navy-900 dark:text-white mb-2"
                      >
                        E-mail de login do fornecedor
                      </label>

                      <input
                        id={`access-email-${supplier.id}`}
                        type="email"
                        autoComplete="off"
                        value={accessEmail}
                        onChange={(event) => setAccessEmail(event.target.value)}
                        placeholder="fornecedor@empresa.com.br"
                        className="w-full px-4 py-3 rounded-xl bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                      />

                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                        A conta é criada já confirmada, com uma senha forte gerada pelo
                        sistema.
                      </p>

                      <div className="flex flex-col sm:flex-row gap-3 mt-4">
                        <button
                          type="button"
                          onClick={() => handleCreateAccess(supplier)}
                          disabled={creatingAccess || !accessEmail.trim()}
                          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {creatingAccess ? (
                            <>
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Criando...
                            </>
                          ) : (
                            <>
                              <KeyRound className="w-4 h-4" />
                              Criar acesso e gerar senha
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={closeAccessForm}
                          disabled={creatingAccess}
                          className="px-4 py-3 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm font-semibold hover:bg-white dark:hover:bg-navy-800 transition-colors disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* --------------------------------------------------------------
          Importar catálogo por planilha
         -------------------------------------------------------------- */}
      <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-navy-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-navy-900 dark:text-white" />

              <h2 className="text-lg font-bold text-navy-900 dark:text-white">
                Importar catálogo por planilha
              </h2>
            </div>

            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              Cadastre o catálogo inteiro de um fornecedor de uma vez, em vez de
              produto por produto.
            </p>
          </div>

          <div className="flex gap-3 shrink-0">
            <button
              type="button"
              onClick={baixarModelo}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Modelo
            </button>

            <button
              type="button"
              onClick={() => setImportAberto((aberto) => !aberto)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors"
            >
              <Upload className="w-4 h-4" />
              {importAberto ? 'Fechar' : 'Importar'}
            </button>
          </div>
        </div>

        {importAberto && (
          <div className="p-5 space-y-5">
            <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                Baixe o modelo e mande para o fornecedor preencher. Aceita CSV do
                Excel, com ponto e vírgula ou vírgula, e preço com vírgula decimal.
              </p>

              <p className="text-sm text-blue-700 dark:text-blue-400 mt-2">
                Colunas: <strong>nome</strong> e <strong>preco</strong> são
                obrigatórias. Descrição, categoria, estoque, foto e fotos são
                opcionais. Em <strong>fotos</strong>, separe várias URLs por{' '}
                <code>|</code>.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="import-fornecedor"
                  className="block text-sm font-medium text-navy-900 dark:text-white mb-2"
                >
                  Fornecedor de todos os produtos da planilha
                </label>

                <select
                  id="import-fornecedor"
                  value={importFornecedor}
                  onChange={(event) => setImportFornecedor(event.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                >
                  <option value="">Escolha um fornecedor</option>

                  {activeSuppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name} — {supplier.company_name}
                    </option>
                  ))}
                </select>

                <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                  Vale para a planilha inteira, então não precisa repetir em cada
                  linha.
                </p>
              </div>

              <div>
                <span className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                  Arquivo
                </span>

                <label className="inline-flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border border-dashed border-gray-300 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-medium transition-colors cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {importArquivo || 'Escolher planilha (.csv)'}

                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => {
                      const arquivo = event.target.files?.[0];
                      if (arquivo) {
                        lerArquivoDaPlanilha(arquivo);
                      }
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>

            {importErros.length > 0 && (
              <div className="rounded-xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 p-4">
                <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-400">
                  {importErros.length} linha(s) não serão importadas
                </p>

                <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {importErros.map((erro, indice) => (
                    <li
                      key={`${erro.linha}-${indice}`}
                      className="text-sm text-yellow-700 dark:text-yellow-500"
                    >
                      {erro.linha > 0 ? `Linha ${erro.linha}: ` : ''}
                      {erro.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {importProdutos.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-navy-900 dark:text-white mb-3">
                  {importProdutos.length} produto(s) prontos para importar
                </p>

                <div className="rounded-xl border border-gray-200 dark:border-navy-700 overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-navy-700 sticky top-0">
                        <tr>
                          {['Produto', 'Categoria', 'Preço', 'Estoque', 'Fotos'].map(
                            (coluna) => (
                              <th
                                key={coluna}
                                className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase"
                              >
                                {coluna}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-gray-200 dark:divide-navy-700">
                        {importProdutos.map((produto, indice) => (
                          <tr key={`${produto.name}-${indice}`}>
                            <td className="px-4 py-2.5 text-navy-900 dark:text-white">
                              {produto.name}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 dark:text-slate-400">
                              {produto.category}
                            </td>
                            <td className="px-4 py-2.5 text-navy-900 dark:text-white">
                              {formatCurrency(produto.supplier_price)}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 dark:text-slate-400">
                              {produto.stock}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 dark:text-slate-400">
                              {(produto.image_url ? 1 : 0) + produto.images.length}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={confirmarImportacao}
                  disabled={importando || !importFornecedor}
                  className="mt-4 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-black hover:bg-gray-900 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importando ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Importar {importProdutos.length} produto(s)
                    </>
                  )}
                </button>

                {!importFornecedor && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    Escolha o fornecedor antes de importar.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
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