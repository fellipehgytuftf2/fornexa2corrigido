import AcessosAdmin from '../../components/dashboard/AcessosAdmin';
import ContasAbandonadas from '../../components/dashboard/ContasAbandonadas';
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
    </div>
  );
}
