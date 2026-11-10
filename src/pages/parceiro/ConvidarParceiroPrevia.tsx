import { useState, type FormEvent } from 'react';
import { Check, Clock, Copy, Lock, MailCheck, MessageCircle, Send, UserPlus, X } from 'lucide-react';
import { FaixaDePrevia, PARCEIRO_DE_EXEMPLO } from './previa';

/**
 * O lado de quem convida (dono ou co-produtor), em Afiliados → Gerenciar.
 *
 * Hoje, criar afiliado exige que a pessoa já tenha conta paga no FORNEXA. Com
 * o convite, basta o e-mail: o sistema gera um link que só aquele e-mail
 * usa, uma vez, por 7 dias. Quem abre cria a senha e já entra como parceiro.
 *
 * PRÉVIA: a página de fundo é um resumo da tela de Gerenciar, e o convite
 * gerado é de exemplo.
 */
export default function ConvidarParceiroPrevia() {
  const [aberto, setAberto] = useState(true);
  const [nome, setNome] = useState(PARCEIRO_DE_EXEMPLO.nome);
  const [email, setEmail] = useState(PARCEIRO_DE_EXEMPLO.email);
  const [apelido, setApelido] = useState(PARCEIRO_DE_EXEMPLO.apelido);
  const [gerado, setGerado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const linkDoConvite = 'fornexa.site/parceiro/convite/k7Qm2xR9';
  const mensagem = `Oi, ${nome.split(' ')[0]}! Você foi convidado para ser parceiro do FORNEXA. Ative sua conta por este link (vale 7 dias): https://${linkDoConvite}`;

  const gerar = (evento: FormEvent) => {
    evento.preventDefault();
    setGerado(true);
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`https://${linkDoConvite}`);
    } catch {
      // Na prévia, só mostra o retorno.
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1800);
  };

  const campo =
    'w-full h-12 px-4 rounded-xl bg-gray-50 border border-gray-200 text-[15px] text-navy-900 focus:outline-none focus:border-navy-900 focus:ring-2 focus:ring-navy-900/10';

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="hidden lg:flex w-72 shrink-0 bg-navy-950 text-white flex-col p-6 gap-6">
        <div className="flex items-center gap-2.5">
          <span className="text-xl font-bold">FORNEXA</span>
          <span className="px-2 py-0.5 rounded-md bg-gold text-navy-900 text-[11px] font-bold uppercase tracking-wider">
            Admin
          </span>
        </div>
        <nav className="flex flex-col gap-1 text-sm font-medium">
          <span className="px-4 py-3 rounded-xl text-slate-400">Números</span>
          <span className="px-4 py-3 rounded-xl text-slate-400">Contas e acessos</span>
          <span className="px-4 py-3 rounded-xl bg-gold text-navy-900">Gerenciar afiliados</span>
          <span className="px-4 py-3 rounded-xl text-slate-400">Aceitar pedido</span>
          <span className="px-4 py-3 rounded-xl text-slate-400">Desempenho</span>
        </nav>
      </aside>

      <main className="flex-1 p-4 sm:p-8">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-navy-900">Afiliados</h1>
            <p className="text-sm text-gray-500 mt-1">Quem divulga o FORNEXA, o link e os preços de cada um.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAberto(true);
              setGerado(false);
            }}
            className="h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-gold text-navy-900 text-sm font-bold hover:bg-gold-hover"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            Convidar parceiro
          </button>
        </div>

        <div className="mt-5 bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
          {['carla', 'bruno', 'marcos'].map((ap) => (
            <div key={ap} className="p-4 flex items-center gap-3 text-sm">
              <span className="w-9 h-9 rounded-full bg-navy-900 text-gold flex items-center justify-center font-bold">
                {ap[0].toUpperCase()}
              </span>
              <span className="font-semibold text-navy-900 capitalize">{ap}</span>
              <span className="text-gray-500">fornexa.site/{ap}</span>
              <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Ativo</span>
            </div>
          ))}
        </div>
      </main>

      {aberto && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-navy-950/60">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="convidar-titulo"
            className="cartao-entra w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-start justify-between gap-4 p-6 pb-4">
              <div>
                <h2 id="convidar-titulo" className="font-display text-xl font-semibold text-navy-900">
                  {gerado ? 'Convite pronto' : 'Convidar parceiro'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {gerado
                    ? 'Mande o link para a pessoa. Ela cria a senha e já entra.'
                    : 'A pessoa não precisa ter conta nem pagar plano.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {!gerado ? (
              <form onSubmit={gerar} className="px-6 pb-6 flex flex-col gap-4">
                <div>
                  <label htmlFor="cv-nome" className="block text-sm font-semibold text-navy-900 mb-2">Nome</label>
                  <input id="cv-nome" value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
                </div>
                <div>
                  <label htmlFor="cv-email" className="block text-sm font-semibold text-navy-900 mb-2">E-mail</label>
                  <input id="cv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
                </div>
                <div>
                  <label htmlFor="cv-apelido" className="block text-sm font-semibold text-navy-900 mb-2">Link de divulgação</label>
                  <div className="flex items-center rounded-xl bg-gray-50 border border-gray-200 focus-within:border-navy-900">
                    <span className="pl-4 text-[15px] text-gray-500">fornexa.site/</span>
                    <input
                      id="cv-apelido"
                      value={apelido}
                      onChange={(e) => setApelido(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      className="flex-1 h-12 pr-4 bg-transparent text-[15px] text-navy-900 focus:outline-none"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="mt-1 h-12 inline-flex items-center justify-center gap-2 rounded-full bg-navy-900 text-white text-base font-semibold hover:bg-navy-800"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                  Gerar convite
                </button>
              </form>
            ) : (
              <div className="px-6 pb-6 flex flex-col gap-4">
                <div className="acesso-aviso rounded-2xl bg-navy-950 text-white p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-400">Link do convite</p>
                  <p className="font-mono text-gold mt-1 break-all">{linkDoConvite}</p>
                </div>

                <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <li className="flex items-center gap-2 rounded-xl bg-gray-50 p-3 text-navy-900">
                    <Lock className="w-4 h-4 shrink-0" aria-hidden="true" /> Só para {email.split('@')[0]}@…
                  </li>
                  <li className="flex items-center gap-2 rounded-xl bg-gray-50 p-3 text-navy-900">
                    <MailCheck className="w-4 h-4 shrink-0" aria-hidden="true" /> Funciona uma vez
                  </li>
                  <li className="flex items-center gap-2 rounded-xl bg-gray-50 p-3 text-navy-900">
                    <Clock className="w-4 h-4 shrink-0" aria-hidden="true" /> Vence em 7 dias
                  </li>
                </ul>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={copiar}
                    className="h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-gold text-navy-900 text-sm font-bold hover:bg-gold-hover"
                  >
                    {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiado ? 'Copiado' : 'Copiar link'}
                  </button>
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(mensagem)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 text-navy-900 text-sm font-semibold hover:bg-gray-50"
                  >
                    <MessageCircle className="w-4 h-4" aria-hidden="true" />
                    Mandar no WhatsApp
                  </a>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Se a pessoa não ativar a tempo, é só gerar outro. O link antigo para de funcionar.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      <FaixaDePrevia />
    </div>
  );
}
