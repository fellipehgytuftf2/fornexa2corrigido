import AcessosAdmin from '../../components/dashboard/AcessosAdmin';
import ContasAbandonadas from '../../components/dashboard/ContasAbandonadas';
import EstatisticasDeVendas from '../../components/conquistas/EstatisticasDeVendas';
import FuncionalidadesEmTeste from '../../components/dashboard/FuncionalidadesEmTeste';

export default function AdminContas() {
  return (
    <div className="space-y-6">
      <AcessosAdmin />

      {/* Depois da lista de acessos de propósito: primeiro quem existe, depois
          a limpeza do que nunca chegou a existir de verdade. */}
      <ContasAbandonadas />

      {/* Fica aqui porque é a mesma pergunta das outras duas: quem tem acesso
          a quê. */}
      <FuncionalidadesEmTeste />

      {/* Numeros da base inteira, que o ranking nao conta: quem nunca vendeu,
          quanto vende o meio da fila, quanto tempo leva a primeira venda. */}
      <EstatisticasDeVendas />
    </div>
  );
}
