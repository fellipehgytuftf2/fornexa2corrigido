import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, PackageSearch } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchSupplierAccount, type SupplierAccount } from '../../lib/supplierAuth';

/**
 * Portal do Fornecedor.
 *
 * Fase 1 entrega só a casca: confirma quem entrou e permite sair. As abas de
 * pedidos, a etiqueta e o "marcar como enviado" são as Fases 2 a 4.
 */
export default function SupplierPortal() {
  const navigate = useNavigate();

  const [supplier, setSupplier] = useState<SupplierAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (mounted) {
          navigate('/fornecedor/login', { replace: true });
        }
        return;
      }

      const account = await fetchSupplierAccount(user.id);

      if (!mounted) {
        return;
      }

      setSupplier(account);
      setLoading(false);
    };

    load();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('fornexa_supplier');
    navigate('/fornecedor/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-navy-950 text-white">
      <header className="border-b border-white/5 bg-navy-900/60 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-md overflow-hidden bg-navy-900 flex items-center justify-center shrink-0">
              <img
                src="/fornexa-logo.jpeg"
                alt=""
                className="w-full h-full object-cover scale-[2.8]"
                draggable={false}
              />
            </div>

            <div className="min-w-0">
              <p className="font-display font-semibold leading-none tracking-tight truncate">
                FORNEXA
              </p>

              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold mt-1.5">
                Portal do Fornecedor
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {loading ? (
          <p className="text-slate-400">Carregando...</p>
        ) : (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
              Conectado como
            </p>

            <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] mt-3">
              {supplier?.company_name || supplier?.name || 'Fornecedor'}
            </h1>

            {supplier?.email && (
              <p className="font-mono text-sm text-slate-500 mt-2">{supplier.email}</p>
            )}

            <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-8">
              <PackageSearch className="w-8 h-8 text-gold" aria-hidden="true" />

              <h2 className="font-display text-xl font-semibold mt-4">
                Seus pedidos aparecem aqui em breve
              </h2>

              <p className="text-slate-400 mt-3 max-w-xl leading-relaxed">
                Seu acesso já está funcionando. As abas de pedidos, o download da
                etiqueta e o botão de marcar envio entram na próxima etapa.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
