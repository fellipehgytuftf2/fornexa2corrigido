import AcessosAdmin from '../../components/dashboard/AcessosAdmin';
import ContasAbandonadas from '../../components/dashboard/ContasAbandonadas';

export default function AdminContas() {
  return (
    <div className="space-y-6">
      <AcessosAdmin />

      {/* Depois da lista de acessos de propósito: primeiro quem existe, depois
          a limpeza do que nunca chegou a existir de verdade. */}
      <ContasAbandonadas />
    </div>
  );
}
