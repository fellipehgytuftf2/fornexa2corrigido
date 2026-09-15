import ImpressaoDasContas from '../../components/dashboard/ImpressaoDasContas';
import PausasPorEstoque from '../../components/dashboard/PausasPorEstoque';

export default function AdminImpressao() {
  return (
    <div className="space-y-6">
      <ImpressaoDasContas />

      {/* Mesma família de "saúde operacional" da tela: uma diz quem ainda
          imprime errado, a outra diz quem está com anúncio pausado ou preso
          sem estoque. */}
      <PausasPorEstoque />
    </div>
  );
}
