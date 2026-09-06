import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCircle, Copy, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';

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
  const [copiado, setCopiado] = useState<string | null>(null);

  /**
   * O CEP que o Mercado Livre tem hoje como origem dos envios deste vendedor.
   *
   * É o que transforma esta tela de instrução em conferência: sem ele, o erro
   * só apareceria na primeira etiqueta impressa — quando o Mercado Livre já não
   * deixa mais mudar aquele envio.
   */
  const [cepNoMercadoLivre, setCepNoMercadoLivre] = useState<string | null>(null);

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
      }>('ml-endereco-de-envio');

      if (data?.conectado && data.cep) {
        setCepNoMercadoLivre(data.cep);
      }
    };

    carregar();
    conferirNoMercadoLivre();
  }, []);

  const montarTexto = (endereco: EnderecoDeFornecedor) =>
    [
      [endereco.logradouro, endereco.numero].filter(Boolean).join(', '),
      endereco.complemento,
      endereco.bairro,
      [endereco.cidade, endereco.estado].filter(Boolean).join('/'),
      endereco.cep,
    ]
      .filter(Boolean)
      .join(' — ');

  const copiar = async (endereco: EnderecoDeFornecedor) => {
    await navigator.clipboard.writeText(montarTexto(endereco));
    setCopiado(endereco.supplier_id);
    window.setTimeout(
      () => setCopiado((atual) => (atual === endereco.supplier_id ? null : atual)),
      2000
    );
  };

  // Sem produto publicado, não há endereço a configurar ainda.
  if (enderecos.length === 0) {
    return null;
  }

  // Compara só o CEP: é o campo que o Mercado Livre usa para roteirizar, e o
  // único que a resposta dele traz de forma confiável para comparar.
  const jaConfigurado =
    Boolean(cepNoMercadoLivre) &&
    enderecos.some(
      (endereco) =>
        endereco.cep && endereco.cep.replace(/\D/g, '') === cepNoMercadoLivre
    );

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
              {cepNoMercadoLivre
                ? 'Suas etiquetas ainda saem do seu endereço, não do fornecedor.'
                : 'Ainda não conseguimos conferir seu endereço no Mercado Livre.'}
            </p>

            <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed mt-1">
              Faça isso <strong>antes</strong> de gerar etiquetas. Depois de
              impressa, o Mercado Livre não deixa mais mudar o endereço daquele
              envio.
            </p>
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {enderecos.map((endereco) => {
          const completo = Boolean(endereco.cep && endereco.logradouro);

          return (
            <li
              key={endereco.supplier_id}
              className="rounded-xl border border-gray-200 dark:border-navy-600 p-4"
            >
              <p className="font-semibold text-navy-900 dark:text-white">
                {endereco.fornecedor}
              </p>

              {completo ? (
                <>
                  <p className="text-sm text-gray-600 dark:text-slate-300 mt-1 leading-relaxed">
                    {montarTexto(endereco)}
                  </p>

                  <button
                    type="button"
                    onClick={() => copiar(endereco)}
                    className="inline-flex items-center gap-2 mt-3 px-3 py-2 rounded-lg border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 text-xs font-semibold transition-colors"
                  >
                    {copiado === endereco.supplier_id ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiado === endereco.supplier_id ? 'Copiado' : 'Copiar endereço'}
                  </button>
                </>
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
