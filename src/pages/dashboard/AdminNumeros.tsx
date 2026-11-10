import EstatisticasDeVendas from '../../components/conquistas/EstatisticasDeVendas';

/**
 * Os números do negócio, sozinhos.
 *
 * POR QUE ESTA PÁGINA EXISTE, SE OS NÚMEROS JÁ APARECEM EM CONTAS E ACESSOS
 *
 * Porque lá eles dividem a tela com a lista de clientes, o botão de entrar na
 * conta de qualquer um deles e a limpeza de contas abandonadas. Para mostrar o
 * faturamento ao co-produtor seria preciso abrir a página inteira, e com ela
 * tudo o que mora nela.
 *
 * Aqui é o mesmo componente, sem a companhia. O admin continua vendo os
 * números onde sempre viu; esta página existe para que o recorte do
 * co-produtor seja uma rota de verdade, e não um botão escondido.
 */
export default function AdminNumeros() {
  return (
    <div className="space-y-6">
      <EstatisticasDeVendas />
    </div>
  );
}
