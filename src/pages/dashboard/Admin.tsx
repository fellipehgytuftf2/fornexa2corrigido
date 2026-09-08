import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  Copy,
  Download,
  FileSpreadsheet,
  Globe,
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
import RepassesAdmin from '../../components/dashboard/RepassesAdmin';
import ModalPortal from '../../components/ui/modal-portal';
import AcessosAdmin from '../../components/dashboard/AcessosAdmin';
import AvisosAdmin from '../../components/dashboard/AvisosAdmin';
import SuporteAdmin from '../../components/dashboard/SuporteAdmin';
import AfiliadosAdmin from '../../components/dashboard/AfiliadosAdmin';
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

  /** Formulário começa fechado: quem abre o Admin quase sempre vem ver a lista. */
  const [formAberto, setFormAberto] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);

  // --- Acesso do fornecedor ao Portal ---
  const [accessSupplierId, setAccessSupplierId] = useState<string | null>(null);
  const [accessEmail, setAccessEmail] = useState('');
  const [creatingAccess, setCreatingAccess] = useState(false);
  const [createdAccess, setCreatedAccess] = useState<CreatedAccess | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  /** Remoção do catálogo inteiro de um fornecedor. */
  const [catalogoAlvo, setCatalogoAlvo] = useState<Supplier | null>(null);
  const [previaCatalogo, setPreviaCatalogo] = useState<{
    produtos: number;
    anuncios_ligados: number;
    devolucoes_ligadas: number;
  } | null>(null);
  const [confirmacaoDigitada, setConfirmacaoDigitada] = useState('');
  const [removendoCatalogo, setRemovendoCatalogo] = useState(false);

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

  // --- Importação pelo site do fornecedor ---
  const [importLink, setImportLink] = useState('');
  const [lendoSite, setLendoSite] = useState(false);
  const [resumoDoSite, setResumoDoSite] = useState('');

  /**
   * O que a função de leitura devolve.
   *
   * Nomeada em vez de escrita direto na chamada porque a resposta carrega o
   * ponto de continuação, que volta como argumento da chamada seguinte — e o
   * TypeScript não consegue inferir um tipo que depende de si mesmo.
   */
  interface RespostaDoSite {
    produtos?: ProdutoImportado[];
    paginas_lidas?: number;
    total_disponivel?: number;
    proximo_offset?: number | null;
    origem_da_lista?: string;
    sem_preco?: number;
    aviso?: string | null;
    error?: string;
  }

  /**
   * Lê o catálogo direto do site do fornecedor.
   *
   * A função do servidor procura os dados estruturados que o Google exige —
   * JSON-LD ou microdata —, por isso funciona em lojas diferentes sem código
   * específico para cada uma.
   *
   * Catálogo grande não cabe numa chamada só: o servidor devolve de onde
   * continuar e esta função vai pedindo o resto até acabar, mostrando o
   * progresso. Sem isso, uma loja de trezentos itens trazia os primeiros e
   * parecia que o site estava incompleto.
   */
  const lerSiteDoFornecedor = async () => {
    setLendoSite(true);
    setErrorMessage('');
    setResumoDoSite('');
    setImportProdutos([]);
    setImportErros([]);

    const acumulados: ProdutoImportado[] = [];
    let offset: number | null = 0;
    let paginas = 0;
    let semPreco = 0;
    let ultimoAviso: string | null = null;

    // Teto de segurança: se o servidor devolvesse sempre o mesmo ponto de
    // continuação, isto impede a tela de ficar pedindo para sempre.
    for (let rodada = 0; rodada < 40 && offset !== null; rodada++) {
      const resposta: {
        data: RespostaDoSite | null;
        error: unknown;
      } = await supabase.functions.invoke<RespostaDoSite>(
        'importar-catalogo-por-link',
        { body: { url: importLink.trim(), offset } }
      );

      const { data, error } = resposta;

      if (error || !data) {
        let mensagem: string | undefined = data?.error;

        const contexto = (
          error as { context?: { json?: () => Promise<{ error?: string }> } } | null
        )?.context;

        if (!mensagem && contexto?.json) {
          try {
            const corpo = await contexto.json();
            mensagem = corpo?.error;
          } catch {
            // segue com a mensagem genérica
          }
        }

        setLendoSite(false);

        // Falha no meio não descarta o que já veio: melhor entregar parte do
        // catálogo do que obrigar a começar tudo de novo.
        if (acumulados.length > 0) {
          setImportProdutos(acumulados);
          setResumoDoSite(
            `${acumulados.length} produto(s) lidos antes da leitura falhar. ` +
              'Você pode importar estes e rodar de novo para pegar o resto.'
          );
          return;
        }

        setErrorMessage(mensagem ?? 'Não foi possível ler o site do fornecedor.');
        return;
      }

      acumulados.push(...(data.produtos ?? []));
      paginas += data.paginas_lidas ?? 0;
      semPreco += data.sem_preco ?? 0;
      ultimoAviso = data.aviso ?? null;
      offset = data.proximo_offset ?? null;

      // Mostra o andamento a cada rodada, para catálogo grande não parecer
      // travado enquanto o servidor trabalha.
      if (offset !== null) {
        setResumoDoSite(
          `Lendo... ${acumulados.length} produto(s) até agora, de ${data.total_disponivel ?? '?'} páginas do site.`
        );
      }
    }

    setLendoSite(false);
    setImportArquivo('');
    setImportProdutos(acumulados);

    if (acumulados.length === 0 && ultimoAviso) {
      setImportErros([{ linha: 0, motivo: ultimoAviso }]);
      setResumoDoSite('');
      return;
    }

    const partes = [
      `${acumulados.length} produto(s) encontrados em ${paginas} página(s)`,
    ];

    if (semPreco) {
      partes.push(`${semPreco} sem preço, ignorados`);
    }

    partes.push('estoque vem zerado: o site não informa quantidade');

    setResumoDoSite(`${partes.join(' · ')}.`);
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

    // Campo a campo, não espalhando: a leitura pelo site devolve extras como
    // sku e origem, que não são colunas da tabela e fariam o insert falhar.
    const payload = importProdutos.map((produto) => ({
      name: produto.name,
      description: produto.description,
      category: produto.category,
      supplier_price: produto.supplier_price,
      stock: produto.stock,
      image_url: produto.image_url,
      images: produto.images,
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

  /**
   * Abre a remoção do catálogo já com os números na mão.
   *
   * A prévia vem antes da confirmação de propósito: apagar catálogo é o tipo
   * de coisa que se faz uma vez e não se desfaz, e "tem certeza?" sem número
   * não ajuda ninguém a decidir.
   */
  const abrirRemocaoDeCatalogo = async (supplier: Supplier) => {
    setCatalogoAlvo(supplier);
    setPreviaCatalogo(null);
    setConfirmacaoDigitada('');
    setErrorMessage('');

    const { data, error } = await supabase.rpc('admin_previa_remocao_catalogo', {
      p_fornecedor: supplier.id,
    });

    if (error) {
      setErrorMessage(`Não foi possível ler o catálogo: ${error.message}`);
      return;
    }

    const linha = Array.isArray(data) ? data[0] : data;

    setPreviaCatalogo(linha ?? { produtos: 0, anuncios_ligados: 0, devolucoes_ligadas: 0 });
  };

  const removerCatalogo = async () => {
    if (!catalogoAlvo) {
      return;
    }

    setRemovendoCatalogo(true);
    setErrorMessage('');

    const { data, error } = await supabase.rpc('admin_remover_catalogo_do_fornecedor', {
      p_fornecedor: catalogoAlvo.id,
    });

    setRemovendoCatalogo(false);

    if (error) {
      setErrorMessage(`Não foi possível remover o catálogo: ${error.message}`);
      return;
    }

    const nome = catalogoAlvo.company_name || catalogoAlvo.name;

    setCatalogoAlvo(null);
    setPreviaCatalogo(null);
    setConfirmacaoDigitada('');

    await loadData();
    showSuccess(`${data ?? 0} produto(s) de ${nome} foram removidos do catálogo.`);
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
        error as {
          context?: {
            status?: number;
            json?: () => Promise<{ error?: string }>;
            text?: () => Promise<string>;
          };
        } | null
      )?.context;

      if (!specificMessage && errorContext?.json) {
        try {
          const errorBody = await errorContext.json();
          specificMessage = errorBody?.error;
        } catch {
          // Resposta sem JSON — é o caso em que a função quebrou antes de
          // responder. O texto cru diz mais do que a frase genérica.
          try {
            const cru = await errorContext.text?.();
            specificMessage = cru?.slice(0, 300) || undefined;
          } catch {
            // segue para a mensagem genérica, agora com o código HTTP
          }
        }
      }

      setRevokingId(null);
      setErrorMessage(
        specificMessage ??
          `Não foi possível remover o acesso do fornecedor${
            errorContext?.status ? ` (erro ${errorContext.status})` : ''
          }.`
      );
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
    // Sem isto, clicar em Editar rolaria para um formulário fechado.
    setFormAberto(true);

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

                      <button
                        type="button"
                        onClick={() => abrirRemocaoDeCatalogo(supplier)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-semibold transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remover catálogo
                      </button>
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
                  Planilha
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

            {/* Caminho alternativo: em vez de planilha, o site do fornecedor. */}
            <div className="rounded-xl border border-gray-200 dark:border-navy-700 p-4">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-navy-900 dark:text-white" />

                <p className="text-sm font-medium text-navy-900 dark:text-white">
                  Ou leia direto do site do fornecedor
                </p>
              </div>

              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">
                Funciona quando a loja publica os dados no padrão que o Google exige
                para mostrar preço na busca — o caso da maioria. Se não publicar, o
                sistema avisa em vez de inventar produto.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mt-3">
                <input
                  type="url"
                  value={importLink}
                  onChange={(event) => setImportLink(event.target.value)}
                  placeholder="https://loja-do-fornecedor.com.br"
                  className="flex-1 px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  disabled={lendoSite}
                />

                <button
                  type="button"
                  onClick={lerSiteDoFornecedor}
                  disabled={lendoSite || !importLink.trim()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {lendoSite ? (
                    <>
                      <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                      Lendo o site...
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4" />
                      Ler catálogo
                    </>
                  )}
                </button>
              </div>

              {resumoDoSite && (
                <p className="text-sm text-green-700 dark:text-green-400 mt-3">
                  {resumoDoSite}
                </p>
              )}
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
                  <div className="max-h-72 overflow-y-auto overflow-x-auto">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead className="bg-gray-50 dark:bg-navy-700 sticky top-0">
                        <tr>
                          {['Produto', 'Categoria', 'Preço', 'Fotos'].map(
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
                            <td className="px-4 py-2.5 text-navy-900 dark:text-white align-top max-w-md">
                              {produto.name}

                              {/* A descrição é o que vai virar o texto do
                                  anúncio. Conferir depois de importar custa
                                  bem mais caro do que conferir agora. */}
                              {produto.description &&
                                produto.description !== produto.name && (
                                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 line-clamp-2">
                                    {produto.description}
                                  </p>
                                )}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 dark:text-slate-400 align-top">
                              {produto.category}
                            </td>
                            <td className="px-4 py-2.5 text-navy-900 dark:text-white align-top whitespace-nowrap">
                              {formatCurrency(produto.supplier_price)}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 dark:text-slate-400 align-top">
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
        {/* O cabeçalho inteiro abre e fecha: o formulário é alto e fica no
            caminho de quem só quer ver a lista de produtos. */}
        <button
          type="button"
          onClick={() => setFormAberto((aberto) => !aberto)}
          aria-expanded={formAberto}
          className={`w-full p-5 flex items-start justify-between gap-4 text-left hover:bg-gray-50 dark:hover:bg-navy-700/50 transition-colors ${
            formAberto ? 'border-b border-gray-200 dark:border-navy-700' : ''
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-navy-900 dark:text-white" />

              <h2 className="text-lg font-bold text-navy-900 dark:text-white">
                {editingProductId ? 'Editar produto do catálogo' : 'Cadastrar produto no catálogo'}
              </h2>
            </div>

            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              {formAberto
                ? 'Preencha os dados do produto e escolha o fornecedor responsável.'
                : 'Clique para abrir o formulário.'}
            </p>
          </div>

          <ChevronDown
            className={`w-5 h-5 text-gray-500 dark:text-slate-400 shrink-0 mt-1 transition-transform ${
              formAberto ? 'rotate-180' : ''
            }`}
          />
        </button>

        <div className={`${formAberto ? '' : 'hidden'}`}>
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
        </div>
      </form>

      {/* A lista abre e fecha igual ao formulário. Com centenas de produtos
          importados, ela empurra para muito longe tudo o que vem depois —
          fornecedores, assinaturas e repasses. */}
      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setListaAberta((aberta) => !aberta)}
          aria-expanded={listaAberta}
          className={`w-full p-5 flex items-start justify-between gap-4 text-left hover:bg-gray-50 dark:hover:bg-navy-700/50 transition-colors ${
            listaAberta ? 'border-b border-gray-200 dark:border-navy-700' : ''
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-navy-900 dark:text-white" />

              <h2 className="text-lg font-bold text-navy-900 dark:text-white">
                Produtos do catálogo
              </h2>
            </div>

            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              {products.length === 0
                ? 'Nenhum produto cadastrado ainda.'
                : listaAberta
                  ? `${products.length} produto(s) no catálogo.`
                  : `${products.length} produto(s). Clique para abrir.`}
            </p>
          </div>

          <ChevronDown
            className={`w-5 h-5 text-gray-500 dark:text-slate-400 shrink-0 mt-1 transition-transform ${
              listaAberta ? 'rotate-180' : ''
            }`}
          />
        </button>

        <div className={listaAberta ? 'p-4' : 'hidden'}>
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
      </div>

      {!listaAberta ? null : loading ? (
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

      {catalogoAlvo && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-200 dark:border-navy-700 p-6 w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto">
              <h3 className="text-lg font-semibold text-navy-900 dark:text-white">
                Remover o catálogo de{' '}
                {catalogoAlvo.company_name || catalogoAlvo.name}?
              </h3>

              {previaCatalogo === null ? (
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-3">
                  Conferindo o catálogo...
                </p>
              ) : (
                <>
                  {/* Número antes da pergunta. "Tem certeza?" sem número não
                      ajuda ninguém a decidir. */}
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-3 leading-relaxed">
                    Serão apagados{' '}
                    <strong className="text-navy-900 dark:text-white">
                      {previaCatalogo.produtos} produto(s)
                    </strong>{' '}
                    do catálogo. Isso não tem volta — para ter o catálogo de novo,
                    é preciso importar outra vez.
                  </p>

                  {previaCatalogo.anuncios_ligados > 0 && (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 mt-4">
                      <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                        <strong>
                          {previaCatalogo.anuncios_ligados} anúncio(s) de vendedores
                        </strong>{' '}
                        nasceram destes produtos. Eles continuam no ar no Mercado
                        Livre e continuam em Meus Produtos — só perdem a ligação
                        com o catálogo.
                      </p>

                      <p className="text-sm text-amber-800 dark:text-amber-300 mt-2 leading-relaxed">
                        Se o preço estava errado, esses anúncios estão com o preço
                        errado no Mercado Livre. Apagar o catálogo não corrige
                        isso — precisa avisar os vendedores.
                      </p>
                    </div>
                  )}

                  <label
                    htmlFor="confirmar-remocao"
                    className="block text-sm font-medium text-navy-900 dark:text-white mt-5 mb-2"
                  >
                    Para confirmar, digite REMOVER
                  </label>

                  <input
                    id="confirmar-remocao"
                    value={confirmacaoDigitada}
                    onChange={(evento) => setConfirmacaoDigitada(evento.target.value)}
                    placeholder="REMOVER"
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  />
                </>
              )}

              <div className="flex flex-col sm:flex-row gap-3 mt-6 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setCatalogoAlvo(null);
                    setPreviaCatalogo(null);
                    setConfirmacaoDigitada('');
                  }}
                  disabled={removendoCatalogo}
                  className="px-4 py-3 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={removerCatalogo}
                  disabled={
                    removendoCatalogo ||
                    previaCatalogo === null ||
                    confirmacaoDigitada.trim().toUpperCase() !== 'REMOVER'
                  }
                  className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {removendoCatalogo ? 'Removendo...' : 'Remover catálogo'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      <SuporteAdmin />

      <AvisosAdmin />

      <AcessosAdmin />

      <AfiliadosAdmin />

      <RepassesAdmin />
    </div>
  );
}