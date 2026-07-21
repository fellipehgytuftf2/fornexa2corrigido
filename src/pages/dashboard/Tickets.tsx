import { useState } from 'react';
import { Plus, Ticket, Eye } from 'lucide-react';
import { tickets as mockTickets } from '../../data/mockData';

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
  const [tickets] = useState(mockTickets);
  const [showModal, setShowModal] = useState(false);
  const [subject, setSubject] = useState('');

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
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-100 text-black rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Abrir chamado
        </button>
      </div>

      {/* Tickets table */}
      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-navy-700 bg-gray-50 dark:bg-navy-700">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Assunto
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Data
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-navy-700">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                  <td className="px-5 py-4 text-sm text-gray-500 dark:text-slate-400 font-mono">
                    {ticket.id}
                  </td>
                  <td className="px-5 py-4 text-sm text-navy-900 dark:text-white font-medium">
                    {ticket.subject}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        statusColors[ticket.status]
                      }`}
                    >
                      {statusLabels[ticket.status]}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500 dark:text-slate-400">
                    {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-navy-700 text-gray-500 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {tickets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <Ticket className="w-12 h-12 text-gray-300 dark:text-navy-600 mb-4" />
            <p className="text-gray-500 dark:text-slate-400">Nenhum chamado registrado</p>
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
            <div className="p-5">
              <label className="block text-sm font-medium text-navy-900 dark:text-white mb-2">
                Assunto
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Descreva seu problema..."
                className="w-full px-4 py-2.5 bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 rounded-lg text-navy-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                onClick={() => setShowModal(false)}
                className="w-full mt-4 px-4 py-2.5 bg-white hover:bg-gray-100 text-black rounded-lg text-sm font-medium transition-colors"
              >
                Enviar chamado
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
