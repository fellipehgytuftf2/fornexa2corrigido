import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import EnderecoParaCopiar from './EnderecoParaCopiar';

interface EnderecoDeFornecedor {
  supplier_id: string;
  fornecedor: string;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  complemento: string | null;
  cidade: string | null;
  estado: string | null;
}

/**
 * O endereço que o vendedor precisa cadastrar como remetente no marketplace.
 *
 * A etiqueta e a Declaração de Conteúdo saem com o endereço que o vendedor
 * cadastrou no Mercado Livre — o dele. Só que a caixa parte do galpão do
 * fornecedor: o pacote sai de São Paulo declarando origem no Rio.
 *
 * Não é aparência. O remetente é para onde a devolução volta. Errado, o que
 * voltar cai na casa de quem não tem o que fazer com aquilo.
 *
 * Aparece só depois que o vendedor publica um produto daquele fornecedor —
 * antes disso o catálogo não revela quem é quem, e ele ainda não precisa.
 */
export default function EnderecoDoFornecedor() {
  const [enderecos, setEnderecos] = useState<EnderecoDeFornecedor[]>([]);

  /**
   * O CEP que o Mercado Livre tem hoje como origem dos envios deste vendedor.
   *
   * É o que transforma esta tela de instrução em conferência: sem ele, o erro
   * só apareceria na primeira etiqueta impressa — quando o Mercado Livre já não
   * deixa mais mudar aquele envio.
   */
  const [cepNoMercadoLivre, setCepNoMercadoLivre] = useState<string | null>(null);

  /**
   * A cidade e o estado de origem do último envio.
   *
   * É por aqui que a conferência realmente acontece: o Mercado Livre mascara o
   * CEP do remetente para aplicações de terceiros, mas deixa cidade e estado à
   * vista. Menos preciso, e suficiente — o galpão do fornecedor fica em outra
   * cidade que a casa do vendedor.
   */
  const [origemNoMercadoLivre, setOrigemNoMercadoLivre] = useState<{
    cidade: string | null;
    estado: string | null;
  } | null>(null);

  /**
   * Por que a conferência não aconteceu, quando não aconteceu.
   *
   * São situações diferentes com providências diferentes — conectar a conta,
   * reconectar, esperar a primeira venda —, e a tela juntava todas numa frase
   * só: "ainda não conseguimos conferir". Quem lia não descobria o que fazer,
   * e a função já sabia a resposta desde sempre.
   */
  const [motivo, setMotivo] = useState<
    'sem_conexao' | 'precisa_reconectar' | 'sem_envio' | 'ml_nao_respondeu' | null
  >(null);

  useEffect(() => {
    const carregar = async () => {
      const { data, error } = await supabase.rpc('enderecos_dos_meus_fornecedores');

      if (error) {
        // Não vale quebrar a tela de Integrações por causa disto: é um aviso,
        // não o motivo de a pessoa estar aqui.
        console.error('Erro ao carregar endereços dos fornecedores:', error);
        return;
      }

      setEnderecos((data as EnderecoDeFornecedor[]) || []);
    };

    const conferirNoMercadoLivre = async () => {
      const { data } = await supabase.functions.invoke<{
        conectado?: boolean;
        cep?: string;
        cidade?: string | null;
        estado?: string | null;
        sem_envio_ainda?: boolean;
        precisa_reconectar?: boolean;
        erro_de_leitura?: boolean;
        sem_endereco_na_resposta?: boolean;
      }>('ml-endereco-de-envio');

      if (!data?.conectado) {
        setMotivo(data?.precisa_reconectar ? 'precisa_reconectar' : 'sem_conexao');
        return;
      }

      if (data.sem_envio_ainda) {
        setMotivo('sem_envio');
        return;
      }

      if (data.erro_de_leitura || data.sem_endereco_na_resposta) {
        setMotivo('ml_nao_respondeu');
        return;
      }

      if (data.cep) {
        setCepNoMercadoLivre(data.cep);
      }

      if (data.cidade) {
        setOrigemNoMercadoLivre({
          cidade: data.cidade ?? null,
          estado: data.estado ?? null,
        });
      }
    };

    carregar();
    conferirNoMercadoLivre();
  }, []);

  // Sem produto publicado, não há endereço a configurar ainda.
  if (enderecos.length === 0) {
    return null;
  }

  /** "São José dos Pinhais" e "sao jose dos pinhais" são a mesma cidade. */
  const simplificar = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .toLowerCase();

  // O CEP é o ideal, e quase nunca vem: o Mercado Livre o mascara. A cidade é
  // o que sobra, e resolve — o galpão do fornecedor fica longe da casa do
  // vendedor, que é o erro que interessa pegar.
  const jaConfigurado = cepNoMercadoLivre
    ? enderecos.some(
        (endereco) =>
          endereco.cep && endereco.cep.replace(/\D/g, '') === cepNoMercadoLivre
      )
    : Boolean(origemNoMercadoLivre?.cidade) &&
      enderecos.some(
        (endereco) =>
          endereco.cidade &&
          simplificar(endereco.cidade) === simplificar(origemNoMercadoLivre!.cidade!)
      );

  const conferiu = Boolean(cepNoMercadoLivre || origemNoMercadoLivre?.cidade);

  const origemEmTexto = [origemNoMercadoLivre?.cidade, origemNoMercadoLivre?.estado]
    .filter(Boolean)
    .join('/');

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-5 shadow-sm">
      <p className="font-semibold text-navy-900 dark:text-white flex items-center gap-2">
        <MapPin className="w-4 h-4 text-gray-600 dark:text-slate-400" aria-hidden="true" />
        Endereço do fornecedor (use na sua loja)
      </p>

      <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
        Cadastre este endereço como origem no Mercado Livre, em{' '}
        <strong className="text-navy-900 dark:text-white">
          Configurações → Preferências de venda → Endereço do Mercado Envios
        </strong>
        . Suas encomendas saem do galpão do fornecedor, não da sua casa.
      </p>

      {/* A conferência, e não o aviso, é o que salva: o FORNEXA lê o CEP que o
          Mercado Livre tem hoje como origem e compara. Sem isso o erro só
          apareceria na primeira etiqueta impressa — quando já não dá para
          mudar aquele envio. */}
      {jaConfigurado ? (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3 mt-4">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />

          <p className="text-sm text-green-800 dark:text-green-300 leading-relaxed">
            Já está configurado. Suas etiquetas saem com o endereço do
            fornecedor, e as devoluções voltam para ele.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 mt-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />

          <div>
            <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
              {conferiu ? (
                <>
                  Suas etiquetas ainda saem do seu endereço, não do fornecedor.
                  {origemEmTexto && (
                    <>
                      {' '}
                      O último envio saiu de{' '}
                      <strong>{origemEmTexto}</strong>.
                    </>
                  )}
                </>
              ) : motivo === 'sem_envio' ? (
                'Configure agora: a conferência só é possível depois da primeira venda, e aí já é tarde para aquele envio.'
              ) : motivo === 'sem_conexao' ? (
                'Conecte sua conta do Mercado Livre aqui em Integrações — sem ela não dá para conferir de onde seus envios saem.'
              ) : motivo === 'precisa_reconectar' ? (
                'Sua conexão com o Mercado Livre expirou. Reconecte aqui em Integrações para podermos conferir.'
              ) : (
                'O Mercado Livre não informou de onde seu último envio saiu, então não deu para conferir. Configure mesmo assim.'
              )}
            </p>

            <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed mt-1">
              {conferiu ? (
                <>
                  Enquanto não corrigir, <strong>o fornecedor não consegue
                  baixar a etiqueta</strong> dos seus pedidos — e o Mercado
                  Livre cancela pedido parado em 3 dias.
                </>
              ) : (
                <>
                  Faça isso <strong>antes</strong> de gerar etiquetas. Depois de
                  impressa, o Mercado Livre não deixa mais mudar o endereço
                  daquele envio.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {enderecos.map((endereco) => {
          const completo = Boolean(endereco.cep && endereco.logradouro);

          return (
            <li
              key={endereco.supplier_id}
              className="rounded-xl border border-gray-200 dark:border-navy-600 px-4 py-3"
            >
              {/* O nome só aparece quando há mais de um fornecedor. Com um só,
                  ele não distingue nada — e ocupa uma linha inteira dizendo o
                  que o vendedor já sabe. Com dois, sem ele não dá para saber
                  qual endereço é de quem. */}
              {enderecos.length > 1 && (
                <p className="font-semibold text-navy-900 dark:text-white mb-1">
                  {endereco.fornecedor}
                </p>
              )}

              {completo ? (
                <EnderecoParaCopiar
                  partes={{
                    cep: endereco.cep,
                    logradouro: endereco.logradouro,
                    numero: endereco.numero,
                    complemento: endereco.complemento,
                    bairro: endereco.bairro,
                    cidade: endereco.cidade,
                    estado: endereco.estado,
                  }}
                />
              ) : (
                // Diz de quem é o passo que falta, em vez de deixar o vendedor
                // achando que o sistema está incompleto.
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Este fornecedor ainda não cadastrou o endereço no Portal dele.
                  Peça a ele, ou combine o endereço direto.
                </p>
              )}
            </li>
          );
        })}
      </ul>

    </div>
  );
}
