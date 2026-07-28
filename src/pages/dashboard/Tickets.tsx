import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Plus, Ticket } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
}

const statusColors: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  in_progress: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400',
};

const statusLabels: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

export default function Tickets() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadTickets = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    // Admins veem todos os chamados (de todos os vendedores); vendedores
    // comuns só veem os próprios — a política de RLS já garante isso no
    // banco, mas checamos o role aqui também só para decidir o texto da
    // tela (ex: mostrar de quem é cada chamado, quando for admin).
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    setIsAdmin(profileData?.role === 'admin');

    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false });

    setLoading(false);

    if (error) {
      console.error('Erro ao carregar chamados:', error);
      setErrorMessage(`Não foi possível carregar os chamados: ${error.message}`);
      return;
    }

    setTickets((data || []) as SupportTicket[]);
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const handleSubmitTicket = async () => {
    if (!subject.trim() || !message.trim()) {
      setErrorMessage('Preencha o assunto e a descrição do problema.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSubmitting(false);
      setErrorMessage('Sessão expirada. Faça login novamente.');
      return;
    }

    const { error } = await supabase.from('tickets').insert({
      user_id: user.id,
      subject: subject.trim(),
      message: message.trim(),
    });

    setSubmitting(false);

    if (error) {
      console.error('Erro ao abrir chamado:', error);
      setErrorMessage(`Não foi possível enviar o chamado: ${error.message}`);
      return;
    }

    setShowModal(false);
    setSubject('');
    setMessage('');
    setSuccessMessage('Chamado enviado com sucesso! Nossa equipe vai responder em breve.');
    setTimeout(() => setSuccessMessage(''), 5000);

    await loadTickets();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 dark:text-white">Chamados</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            {tickets.length} chamado(s) registrado(s)
          </p>
        </div>
        <button
          onClick={() => {
            setErrorMessage('');
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-100 text-black rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Abrir chamado
        </button>
      </div>

      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
          <p className="text-green-700 dark:text-green-400 text-sm font-medium">{successMessage}</p>
        </div>
      )}

      {errorMessage && !showModal && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
          <p className="text-red-700 dark:text-red-400 text-sm font-medium">{errorMessage}</p>
        </div>
      )}

      {/* Tickets table */}
      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-gray-500 dark:text-slate-400 text-sm">Carregando chamados...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-navy-700 bg-gray-50 dark:bg-navy-700">
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Assunto
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Mensagem
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Data
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-navy-700">
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                    <td className="px-5 py-4 text-sm text-navy-900 dark:text-white font-medium">
                      {ticket.subject}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-slate-400 max-w-md truncate">
                      {ticket.message}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[ticket.status]}`}
                      >
                        {statusLabels[ticket.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-slate-400">
                      {new Date(ticket.created_at).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && tickets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <Ticket className="w-12 h-12 text-gray-300 dark:text-navy-600 mb-4" />
            <p className="text-gray-500 dark:text-slate-400">
              {isAdmin ? 'Nenhum chamado registrado ainda' : 'Você ainda não abriu nenhum chamado'}
            </p>
          </div>
        )}
      </div>

      {/* New ticket modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-navy-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-navy-700">
              <h2 className="text-lg font-semibold text-navy-900 dark:text-white">Abrir chamado</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
              >
                <span className="text-gray-500 dark:text-slate-400 text-xl">&times;</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {errorMessage && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <p className="text-red-700 dark:text-red-400 text-sm">{errorMessage}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                  Assunto
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Dúvida sobre integração Mercado Livre"
                  className="w-full px-4 py-2.5 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-lg text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                  Descreva seu problema
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Explique com detalhes o que está acontecendo..."
                  rows={4}
                  className="w-full px-4 py-2.5 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-lg text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
              </div>

              <button
                onClick={handleSubmitTicket}
                disabled={submitting}
                className="w-full px-4 py-2.5 bg-white hover:bg-gray-100 text-black rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
              >
                {submitting ? 'Enviando...' : 'Enviar chamado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
