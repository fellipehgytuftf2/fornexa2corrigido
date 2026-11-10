import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AcessosAdmin from '../../components/dashboard/AcessosAdmin';
import ContasAbandonadas from '../../components/dashboard/ContasAbandonadas';
import EstatisticasDeVendas from '../../components/conquistas/EstatisticasDeVendas';
import FuncionalidadesEmTeste from '../../components/dashboard/FuncionalidadesEmTeste';

/**
 * A mesma página para dois papéis, mostrando coisas diferentes.
 *
 * O admin vê tudo. O co-produtor vê a lista de contas e os números, sem os
 * botões que mexem: ajustar plano, entrar na conta, excluir.
 *
 * O que ele não vê aqui não é detalhe de tela. Contas abandonadas apaga em
 * lote, e Funcionalidades em teste liga e desliga recurso para a base
 * inteira — as duas são ações de dono, não de quem acompanha.
 *
 * Esconder não é o que protege: as funções do banco recusam o co-produtor de
 * qualquer jeito. Some da tela para ele não clicar no que só devolveria erro.
 */
export default function AdminContas() {
  const [ehAdmin, setEhAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;

    const conferir = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !vivo) return;

      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle<{ role: string | null }>();

      if (vivo) setEhAdmin(data?.role === 'admin');
    };

    conferir();

    return () => {
      vivo = false;
    };
  }, []);

  // Enquanto o papel não chega, a página não decide nada: mostrar os botões e
  // escondê-los meio segundo depois é pior do que esperar.
  if (ehAdmin === null) {
    return <div className="h-40" />;
  }

  return (
    <div className="space-y-6">
      <AcessosAdmin somenteLeitura={!ehAdmin} />

      {ehAdmin && (
        <>
          {/* Depois da lista de acessos de propósito: primeiro quem existe,
              depois a limpeza do que nunca chegou a existir de verdade. */}
          <ContasAbandonadas />

          {/* Fica aqui porque é a mesma pergunta das outras duas: quem tem
              acesso a quê. */}
          <FuncionalidadesEmTeste />
        </>
      )}

      {/* Numeros da base inteira, que o ranking nao conta: quem nunca vendeu,
          quanto vende o meio da fila, quanto tempo leva a primeira venda. */}
      <EstatisticasDeVendas />
    </div>
  );
}
