import ImpressaoDasContas from '../../components/dashboard/ImpressaoDasContas';
import PausasPorEstoque from '../../components/dashboard/PausasPorEstoque';
import RemetenteTravado from '../../components/dashboard/RemetenteTravado';

export default function AdminImpressao() {
  return (
    <div className="space-y-6">
      <ImpressaoDasContas />

      {/* Mesma família de "saúde operacional" da tela: uma diz quem ainda
          imprime errado, a outra diz quem está com anúncio pausado ou preso
          sem estoque. */}
      <PausasPorEstoque />

      {/* Mesma tela porque é a mesma pergunta: por que esta etiqueta não sai.
          Aqui a resposta é o endereço, e a decisão de liberar é do dono. */}
      <RemetenteTravado />
    </div>
  );
}
