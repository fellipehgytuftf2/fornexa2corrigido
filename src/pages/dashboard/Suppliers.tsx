import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Power,
  Save,
  Search,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Supplier {
  id: string;
  user_id: string;
  name: string;
  company_name: string;
  whatsapp: string;
  email: string;
  city: string;
  state: string;
  category: string;
  average_shipping_time: string;
  status: 'active' | 'inactive';
  notes: string;
  created_at: string;
  updated_at: string;
}

const emptyForm = {
  name: '',
  companyName: '',
  whatsapp: '',
  email: '',
  city: '',
  state: '',
  category: '',
  averageShippingTime: '',
  notes: '',
};

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  const loadSuppliers = async () => {
    setLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('created_at', { ascending: false });

    setLoading(false);

    if (error) {
      setErrorMessage('Não foi possível carregar os fornecedores.');
      setSuppliers([]);
      return;
    }

    setSuppliers((data || []) as Supplier[]);
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const activeSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => supplier.status === 'active').length;
  }, [suppliers]);

  const inactiveSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => supplier.status === 'inactive').length;
  }, [suppliers]);

  const filteredSuppliers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return suppliers;
    }

    return suppliers.filter((supplier) => {
      return (
        supplier.name.toLowerCase().includes(normalizedSearch) ||
        supplier.company_name.toLowerCase().includes(normalizedSearch) ||
        supplier.category.toLowerCase().includes(normalizedSearch) ||
        supplier.city.toLowerCase().includes(normalizedSearch) ||
        supplier.state.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [search, suppliers]);

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingSupplierId(null);
    setShowForm(false);
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);

    setTimeout(() => {
      setSuccessMessage('');
    }, 4000);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSaving(true);
    setErrorMessage('');

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setSaving(false);
      setErrorMessage('Sessão não encontrada. Faça login novamente.');
      return;
    }

    const supplierPayload = {
      name: formData.name.trim(),
      company_name: formData.companyName.trim(),
      whatsapp: formData.whatsapp.trim(),
      email: formData.email.trim(),
      city: formData.city.trim(),
      state: formData.state.trim(),
      category: formData.category.trim(),
      average_shipping_time: formData.averageShippingTime.trim(),
      notes: formData.notes.trim(),
    };

    if (editingSupplierId) {
      const { error } = await supabase
        .from('suppliers')
        .update(supplierPayload)
        .eq('id', editingSupplierId);

      setSaving(false);

      if (error) {
        setErrorMessage('Não foi possível atualizar o fornecedor.');
        return;
      }

      resetForm();
      await loadSuppliers();
      showSuccess('Fornecedor atualizado com sucesso.');
      return;
    }

    const { error } = await supabase.from('suppliers').insert({
      ...supplierPayload,
      user_id: user.id,
      status: 'active',
    });

    setSaving(false);

    if (error) {
      setErrorMessage('Não foi possível cadastrar o fornecedor.');
      return;
    }

    resetForm();
    await loadSuppliers();
    showSuccess('Fornecedor cadastrado com sucesso.');
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplierId(supplier.id);
    setFormData({
      name: supplier.name,
      companyName: supplier.company_name,
      whatsapp: supplier.whatsapp,
      email: supplier.email,
      city: supplier.city,
      state: supplier.state,
      category: supplier.category,
      averageShippingTime: supplier.average_shipping_time,
      notes: supplier.notes,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (supplierId: string) => {
    setErrorMessage('');

    const { error } = await supabase.from('suppliers').delete().eq('id', supplierId);

    if (error) {
      setErrorMessage('Não foi possível remover o fornecedor.');
      return;
    }

    await loadSuppliers();
    showSuccess('Fornecedor removido com sucesso.');
  };

  const handleToggleStatus = async (supplier: Supplier) => {
    setErrorMessage('');

    const newStatus = supplier.status === 'active' ? 'inactive' : 'active';

    const { error } = await supabase
      .from('suppliers')
      .update({ status: newStatus })
      .eq('id', supplier.id);

    if (error) {
      setErrorMessage('Não foi possível alterar o status do fornecedor.');
      return;
    }

    await loadSuppliers();
  };

  const formatDate = (value: string) => {
    return new Date(value).toLocaleDateString('pt-BR');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 dark:text-white">
            Fornecedores
          </h1>

          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            Cadastre parceiros, organize contatos e prepare a base de produtos do FORNEXA.
          </p>
        </div>

        <button
          onClick={() => {
            setShowForm(true);
            setEditingSupplierId(null);
            setFormData(emptyForm);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-black hover:bg-gray-900 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo fornecedor
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

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />

        <div>
          <p className="text-blue-700 dark:text-blue-400 text-sm font-medium">
            Fornecedores salvos no Supabase
          </p>

          <p className="text-blue-700 dark:text-blue-400 text-sm mt-1">
            A partir de agora, os fornecedores ficam salvos no banco de dados real do FORNEXA.
          </p>
        </div>
      </div>

      {showForm && (
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-navy-700 flex items-center justify-between">
            <div>
              <h2 className="text-navy-900 dark:text-white font-semibold">
                {editingSupplierId ? 'Editar fornecedor' : 'Cadastrar fornecedor'}
              </h2>

              <p className="text-gray-500 dark:text-slate-400 text-xs mt-1">
                Preencha os dados principais do parceiro.
              </p>
            </div>

            <button
              onClick={resetForm}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                  Nome do fornecedor
                </label>

                <input
                  type="text"
                  value={formData.name}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Ex: Distribuidora Alpha"
                  className="w-full px-4 py-3 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-xl text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  required
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                  Nome da empresa
                </label>

                <input
                  type="text"
                  value={formData.companyName}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      companyName: event.target.value,
                    }))
                  }
                  placeholder="Ex: Alpha Comércio LTDA"
                  className="w-full px-4 py-3 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-xl text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  required
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                  WhatsApp
                </label>

                <input
                  type="text"
                  value={formData.whatsapp}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      whatsapp: event.target.value,
                    }))
                  }
                  placeholder="Ex: (11) 99999-0000"
                  className="w-full px-4 py-3 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-xl text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  required
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                  E-mail
                </label>

                <input
                  type="email"
                  value={formData.email}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="contato@fornecedor.com"
                  className="w-full px-4 py-3 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-xl text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  required
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                  Cidade
                </label>

                <input
                  type="text"
                  value={formData.city}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, city: event.target.value }))
                  }
                  placeholder="Ex: São Paulo"
                  className="w-full px-4 py-3 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-xl text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  required
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                  Estado
                </label>

                <input
                  type="text"
                  value={formData.state}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, state: event.target.value }))
                  }
                  placeholder="Ex: SP"
                  className="w-full px-4 py-3 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-xl text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  required
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                  Categoria principal
                </label>

                <input
                  type="text"
                  value={formData.category}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  placeholder="Ex: Acessórios para celular"
                  className="w-full px-4 py-3 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-xl text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  required
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                  Prazo médio de envio
                </label>

                <input
                  type="text"
                  value={formData.averageShippingTime}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      averageShippingTime: event.target.value,
                    }))
                  }
                  placeholder="Ex: 2 dias úteis"
                  className="w-full px-4 py-3 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-xl text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                  required
                  disabled={saving}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                Observações
              </label>

              <textarea
                value={formData.notes}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Ex: aceita envio direto ao cliente, envia rastreio por WhatsApp, fornece fotos dos produtos..."
                rows={4}
                className="w-full px-4 py-3 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-xl text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white resize-none"
                disabled={saving}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="px-4 py-3 rounded-xl border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white font-medium hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-black hover:bg-gray-900 text-white font-medium transition-colors disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {saving
                  ? 'Salvando...'
                  : editingSupplierId
                    ? 'Salvar alterações'
                    : 'Cadastrar fornecedor'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Total de fornecedores</p>

          <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
            {suppliers.length}
          </p>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Ativos</p>

          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
            {activeSuppliers}
          </p>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-slate-400">Inativos</p>

          <p className="text-2xl font-bold text-gray-600 dark:text-slate-400 mt-1">
            {inactiveSuppliers}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-4 shadow-sm">
        <div className="relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por fornecedor, empresa, categoria, cidade ou estado..."
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-xl text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-navy-700">
          <h2 className="text-navy-900 dark:text-white font-semibold">
            Lista de fornecedores
          </h2>

          <p className="text-gray-500 dark:text-slate-400 text-xs mt-1">
            Parceiros que poderão ser vinculados aos produtos do catálogo.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-black dark:border-navy-700 dark:border-t-white rounded-full animate-spin" />

            <p className="text-gray-500 dark:text-slate-400 text-sm mt-4">
              Carregando fornecedores...
            </p>
          </div>
        ) : filteredSuppliers.length > 0 ? (
          <div className="divide-y divide-gray-200 dark:divide-navy-700">
            {filteredSuppliers.map((supplier) => (
              <div key={supplier.id} className="p-5">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                  <div className="flex gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-navy-700 flex items-center justify-center shrink-0">
                      <Building2 className="w-6 h-6 text-gray-600 dark:text-slate-400" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-navy-900 dark:text-white font-semibold">
                          {supplier.name}
                        </h3>

                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            supplier.status === 'active'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {supplier.status === 'active' ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>

                      <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                        {supplier.company_name}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                        <p className="text-sm text-gray-600 dark:text-slate-400 flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          {supplier.whatsapp}
                        </p>

                        <p className="text-sm text-gray-600 dark:text-slate-400 flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          {supplier.email}
                        </p>

                        <p className="text-sm text-gray-600 dark:text-slate-400 flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          {supplier.city}/{supplier.state}
                        </p>

                        <p className="text-sm text-gray-600 dark:text-slate-400 flex items-center gap-2">
                          <Truck className="w-4 h-4" />
                          Envio em {supplier.average_shipping_time}
                        </p>
                      </div>

                      <div className="mt-4">
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          Categoria principal
                        </p>

                        <p className="text-sm font-medium text-navy-900 dark:text-white mt-1">
                          {supplier.category}
                        </p>
                      </div>

                      {supplier.notes && (
                        <div className="mt-4 bg-gray-50 dark:bg-navy-700 rounded-xl p-4">
                          <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">
                            Observações
                          </p>

                          <p className="text-sm text-gray-600 dark:text-slate-400">
                            {supplier.notes}
                          </p>
                        </div>
                      )}

                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-4">
                        Cadastrado em {formatDate(supplier.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex lg:flex-col gap-2 shrink-0">
                    <button
                      onClick={() => handleToggleStatus(supplier)}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-medium transition-colors"
                    >
                      <Power className="w-4 h-4" />
                      {supplier.status === 'active' ? 'Desativar' : 'Ativar'}
                    </button>

                    <button
                      onClick={() => handleEdit(supplier)}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-medium transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                      Editar
                    </button>

                    <button
                      onClick={() => handleDelete(supplier.id)}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <Truck className="w-12 h-12 text-gray-300 dark:text-navy-600 mb-4" />

            <p className="text-navy-900 dark:text-white font-medium">
              Nenhum fornecedor encontrado
            </p>

            <p className="text-gray-500 dark:text-slate-400 text-sm mt-1 max-w-md">
              Cadastre seus primeiros fornecedores para começar a organizar a origem dos produtos do FORNEXA.
            </p>

            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-black hover:bg-gray-900 text-white text-sm font-medium transition-colors mt-5"
            >
              <Plus className="w-4 h-4" />
              Cadastrar fornecedor
            </button>
          </div>
        )}
      </div>
    </div>
  );
}