import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  PLANOS,
  montarCheckout,
  motivoDoBloqueio,
  planoEmDia,
  type PerfilDePlano,
} from '../lib/planos';

/**
 * Onde para quem está logado mas sem plano em dia.
 *
 * Serve a dois momentos que parecem um só: o cadastro novo que nunca pagou e a
 * assinatura que venceu. A diferença aparece só na frase do topo — o resto da
 * tela é a mesma escolha.
 */
export default function Assinar() {
  const navigate = useNavigate();

  const [perfil, setPerfil] = useState<(PerfilDePlano & { nome?: string; email?: string }) | null>(
    null
  );
  const [carregando, setCarregando] = useState(true);
  const [verificando, setVerificando] = useState(false);
  const [avisoDeEspera, setAvisoDeEspera] = useState('');

  const carregarPerfil = async () => {
    const { data } = await supabase.auth.getSession();
    const usuario = data.session?.user;

    if (!usuario) {
      navigate('/login', { replace: true });
      return null;
    }

    const { data: linha } = await supabase
      .from('profiles')
      .select('name, email, plan, plan_status, plan_expira_em, role')
      .eq('id', usuario.id)
      .maybeSingle<{
        name: string | null;
        email: string | null;
        plan: string | null;
        plan_status: string | null;
        plan_expira_em: string | null;
        role: string | null;
      }>();

    const montado = {
      nome: linha?.name || usuario.user_metadata?.name || '',
      email: linha?.email || usuario.email || '',
      plan: linha?.plan,
      plan_status: linha?.plan_status,
      plan_expira_em: linha?.plan_expira_em,
      role: linha?.role,
    };

    setPerfil(montado);
    return montado;
  };

  useEffect(() => {
    carregarPerfil().finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * O pagamento não chega pelo navegador: chega pelo webhook, alguns segundos
   * depois. Em vez de deixar a pessoa recarregando a página no escuro, ela
   * pergunta ao sistema — e ouve uma resposta clara quando ainda não chegou.
   */
  const jaPaguei = async () => {
    setVerificando(true);
    setAvisoDeEspera('');

    const atualizado = await carregarPerfil();

    setVerificando(false);

    if (atualizado && planoEmDia(atualizado)) {
      navigate('/dashboard', { replace: true });
      return;
    }

    setAvisoDeEspera(
      'O pagamento ainda não apareceu aqui. Se você acabou de pagar, espere um minuto e confira de novo. Pagamento por PIX costuma ser rápido; cartão pode demorar mais.'
    );
  };

  const sair = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('fornexa_auth_user');
    navigate('/login', { replace: true });
  };

  if (carregando) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gold animate-spin" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-navy-950 text-white px-6 py-14 overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-40" aria-hidden="true" />

      <div className="relative max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-14">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-md overflow-hidden bg-navy-900 flex items-center justify-center">
              <img
                src="/fornexa-logo.jpeg"
                alt=""
                className="w-full h-full object-cover scale-[2.8]"
                draggable={false}
              />
            </div>

            <span className="text-white font-display font-semibold text-lg tracking-tight">
              FORNEXA
            </span>
          </div>

          <button
            onClick={sair}
            className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Sair
          </button>
        </div>

        <div className="text-center mb-14">
          <h1 className="font-display text-4xl font-semibold tracking-[-0.02em]">
            Escolha seu plano
          </h1>

          <p className="text-slate-400 mt-4 text-lg leading-relaxed max-w-xl mx-auto">
            {motivoDoBloqueio(perfil)}
          </p>

          {perfil?.email && (
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500 mt-5">
              Conta: {perfil.email}
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6 items-stretch">
          {PLANOS.map((plano) => {
            const link = montarCheckout(plano, {
              email: perfil?.email,
              nome: perfil?.nome,
            });

            const ehPremium = plano.id === 'premium';

            return (
              <div
                key={plano.id}
                className={
                  ehPremium
                    ? 'relative bg-navy-700 rounded-2xl border-2 border-gold p-9 flex flex-col'
                    : 'bg-navy-700 rounded-2xl border border-navy-600 p-9 flex flex-col'
                }
              >
                {plano.destaque && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-black text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                    {plano.destaque}
                  </div>
                )}

                <h2 className="text-white font-semibold text-xl mb-3">{plano.nome}</h2>

                <div className="mb-8">
                  {plano.precoAntigo && (
                    <span className="text-slate-400 text-lg line-through block mb-1">
                      {plano.precoAntigo}
                    </span>
                  )}

                  <span className="text-white text-4xl font-bold">{plano.preco}</span>

                  {ehPremium ? (
                    <span className="text-slate-400 block text-sm mt-1">{plano.periodo}</span>
                  ) : (
                    <span className="text-slate-400">{plano.periodo}</span>
                  )}
                </div>

                <ul className="space-y-4 mb-10">
                  {plano.beneficios.map((beneficio) => (
                    <li
                      key={beneficio}
                      className="flex items-start gap-3 text-slate-300 text-sm"
                    >
                      <Check className="w-4 h-4 text-gold flex-shrink-0 mt-0.5" aria-hidden="true" />
                      {beneficio}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto">
                  {link ? (
                    <a
                      href={link}
                      className={
                        ehPremium
                          ? 'block w-full py-3 rounded-lg bg-white text-black font-semibold hover:bg-slate-100 transition-colors text-center'
                          : 'block w-full py-3 rounded-lg border border-slate-600 text-white font-medium hover:bg-slate-800 transition-colors text-center'
                      }
                    >
                      {plano.chamada}
                    </a>
                  ) : (
                    <div className="w-full py-3 rounded-lg border border-dashed border-slate-600 text-slate-500 text-sm text-center">
                      Checkout ainda não configurado
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-14 text-center">
          <button
            onClick={jaPaguei}
            disabled={verificando}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-white/5 disabled:opacity-60"
          >
            {verificando ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
            )}
            Já paguei, liberar meu acesso
          </button>

          {avisoDeEspera && (
            <p className="text-sm text-slate-400 mt-5 max-w-md mx-auto leading-relaxed">
              {avisoDeEspera}
            </p>
          )}

          <p className="text-sm text-slate-500 mt-8 max-w-md mx-auto leading-relaxed">
            Pague com o mesmo e-mail desta conta. É por ele que o sistema
            reconhece sua compra e libera o acesso sozinho.
          </p>
        </div>
      </div>
    </div>
  );
}
