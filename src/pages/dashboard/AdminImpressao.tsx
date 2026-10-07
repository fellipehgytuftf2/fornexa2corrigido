import ImpressaoDasContas from '../../components/dashboard/ImpressaoDasContas';
import PausasPorEstoque from '../../components/dashboard/PausasPorEstoque';
import RemetenteTravado from '../../components/dashboard/RemetenteTravado';
import SondaDeReclamacoes from '../../components/dashboard/SondaDeReclamacoes';
import SondaDeVenda from '../../components/dashboard/SondaDeVenda';

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

      {/* A pergunta que mais chega no suporte: "o pedido do vendedor sumiu".
          Responde de uma vez se o pedido existe, se está escondido, ou se a
          venda tinha um item que nunca virou pedido aqui. */}
      <SondaDeVenda />

      {/* Mesma pergunta das outras: o que impede um pedido de andar. Aqui o
          impedimento seria descoberto tarde — só no dia de uma reclamação
          real — então ela se pergunta antes. */}
      <SondaDeReclamacoes />
    </div>
  );
}
