import { useEffect, useState } from 'react';
import { AlertCircle, Check, Clock, Loader2, MapPin, Package, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type TipoDeChave = 'celular' | 'cpf' | 'cnpj' | 'email' | 'aleatoria';

const TIPOS: { valor: TipoDeChave; rotulo: string; exemplo: string }[] = [
  { valor: 'celular', rotulo: 'Celular', exemplo: '69 99222-3120' },
  { valor: 'cpf', rotulo: 'CPF', exemplo: '123.456.789-00' },
  { valor: 'cnpj', rotulo: 'CNPJ', exemplo: '12.345.678/0001-90' },
  { valor: 'email', rotulo: 'E-mail', exemplo: 'financeiro@empresa.com.br' },
  { valor: 'aleatoria', rotulo: 'Chave aleatória', exemplo: '8f2c1b9e-4a...' },
];

/**
 * Põe a chave no formato exato em que o diretório do PIX a registrou.
 *
 * O tipo vem escolhido, e não adivinhado, porque adivinhar não funciona: onze
 * dígitos podem ser um CPF ou um celular com DDD. Foi assim que uma chave de
 * celular saiu como 69992223120 e o aplicativo do pagador respondeu "chave não
 * encontrada" — ela existia, só estava escrita de outro jeito.
 */
function formatarChave(tipo: TipoDeChave, valor: string): string {
  const bruto = (valor || '').trim();

  if (!bruto) {
    return '';
  }

  if (tipo === 'email') {
    return bruto.toLowerCase();
  }

  if (tipo === 'aleatoria') {
    return bruto.toLowerCase();
  }

  const digitos = bruto.replace(/\D/g, '');

  if (tipo === 'celular') {
    // O diretório guarda telefone no padrão internacional. Sem o +55 na
    // frente, a busca não encontra nada.
    return `+${digitos.startsWith('55') ? digitos : `55${digitos}`}`;
  }

  return digitos;
}

/** Reconhece o tipo de uma chave já salva, só para reabrir a tela certa. */
function adivinharTipo(chave: string): TipoDeChave {
  if (!chave) return 'celular';
  if (chave.includes('@')) return 'email';
  if (chave.startsWith('+')) return 'celular';

  const digitos = chave.replace(/\D/g, '');

  if (digitos.length === 11 && digitos === chave) return 'cpf';
  if (digitos.length === 14 && digitos === chave) return 'cnpj';

  return 'aleatoria';
}

/**
 * Por onde o dinheiro do repasse chega ao fornecedor.
 *
 * Com a chave guardada, o vendedor copia um código PIX já com o valor certo em
 * vez de procurar o WhatsApp, perguntar a chave e digitar tudo na mão.
 *
 * Quem digita é o fornecedor, nunca o admin. Chave errada digitada por
 * terceiro manda dinheiro para estranho, e a responsabilidade tem que ser de
 * quem recebe.
 */
export default function RecebimentoFornecedor() {
  const [tipo, setTipo] = useState<TipoDeChave>('celular');
  const [chavePix, setChavePix] = useState('');

  /** Como o fornecedor opera: até que horas despacha, e o que avisar antes. */
  const [corte, setCorte] = useState('');
  const [corteFlex, setCorteFlex] = useState('');
  const [avisos, setAvisos] = useState('');

  /**
   * Quanto este fornecedor cobra por pedido pela embalagem.
   *
   * Guardado como texto porque é o que o campo devolve, e porque vírgula é
   * como se escreve dinheiro em português. A conversão acontece na hora de
   * salvar, num lugar só.
   */
  const [taxaEmbalagem, setTaxaEmbalagem] = useState('');

  /** De onde as encomendas saem. Vira o remetente da etiqueta do vendedor. */
  const [endereco, setEndereco] = useState({
    cep: '',
    logradouro: '',
    numero: '',
    bairro: '',
    complemento: '',
    cidade: '',
    estado: '',
  });

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const carregar = async () => {
      setCarregando(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('suppliers')
        .select(
          'chave_pix, horario_corte, horario_corte_flex, avisos, cep, logradouro, numero, bairro, complemento, city, state, taxa_embalagem'
        )
        .eq('auth_user_id', user?.id ?? '')
        .maybeSingle<{
          chave_pix: string | null;
          horario_corte: string | null;
          horario_corte_flex: string | null;
          avisos: string | null;
          cep: string | null;
          logradouro: string | null;
          numero: string | null;
          bairro: string | null;
          complemento: string | null;
          city: string | null;
          state: string | null;
          taxa_embalagem: number | null;
        }>();

      setCarregando(false);

      if (error) {
        setErro(`Não foi possível carregar seus dados: ${error.message}`);
        return;
      }

      const guardada = data?.chave_pix ?? '';

      setChavePix(guardada);
      setTipo(adivinharTipo(guardada));

      // O campo de hora do navegador quer "13:00"; o banco devolve "13:00:00".
      setCorte((data?.horario_corte ?? '').slice(0, 5));
      setCorteFlex((data?.horario_corte_flex ?? '').slice(0, 5));
      setAvisos(data?.avisos ?? '');

      // Zero vira campo vazio: "0,00" escrito ali parece cobrança de zero
      // real, quando na verdade é fornecedor que não cobra embalagem.
      setTaxaEmbalagem(
        data?.taxa_embalagem ? String(data.taxa_embalagem).replace('.', ',') : ''
      );

      setEndereco({
        cep: data?.cep ?? '',
        logradouro: data?.logradouro ?? '',
        numero: data?.numero ?? '',
        bairro: data?.bairro ?? '',
        complemento: data?.complemento ?? '',
        cidade: data?.city ?? '',
        estado: data?.state ?? '',
      });
    };

    carregar();
  }, []);

  const chaveFinal = formatarChave(tipo, chavePix);

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    setSalvo(false);

    const [recebimento, operacao, taxaSalva, enderecoSalvo] = await Promise.all([
      supabase.rpc('fornecedor_define_recebimento', {
        p_chave_pix: chaveFinal || null,
      }),
      supabase.rpc('fornecedor_define_operacao', {
        p_corte: corte || null,
        p_corte_flex: corteFlex || null,
        p_avisos: avisos || null,
      }),
      supabase.rpc('fornecedor_define_taxa_embalagem', {
        p_valor: Number((taxaEmbalagem || '0').replace(',', '.')) || 0,
      }),
      supabase.rpc('fornecedor_define_endereco', {
        p_cep: endereco.cep || null,
        p_logradouro: endereco.logradouro || null,
        p_numero: endereco.numero || null,
        p_bairro: endereco.bairro || null,
        p_complemento: endereco.complemento || null,
        p_cidade: endereco.cidade || null,
        p_estado: endereco.estado || null,
      }),
    ]);

    const error =
      recebimento.error ?? operacao.error ?? taxaSalva.error ?? enderecoSalvo.error;

    // As RPCs de valor recusam sem erro de banco: devolvem { ok: false }. Sem
    // ler isso, taxa recusada some sem ninguém saber.
    const recusa = (taxaSalva.data as { ok?: boolean; erro?: string } | null);

    if (!error && recusa && recusa.ok === false) {
      setSalvando(false);
      setErro(recusa.erro ?? 'Não foi possível salvar a taxa de embalagem.');
      return;
    }

    setSalvando(false);

    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }

    // Mostra o que foi realmente guardado. Se o campo continuasse com o texto
    // digitado, o fornecedor não veria o +55 que acabou de ser acrescentado.
    setChavePix(chaveFinal);
    setSalvo(true);
    window.setTimeout(() => setSalvo(false), 2400);
  };

  if (carregando) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="w-8 h-8 text-slate-600 animate-spin mx-auto" />
        <p className="text-slate-400 mt-4">Carregando...</p>
      </div>
    );
  }

  const exemplo = TIPOS.find((item) => item.valor === tipo)?.exemplo ?? '';

  return (
    <div className="space-y-6 max-w-2xl">
      {erro && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-red-300">{erro}</p>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="font-semibold text-white flex items-center gap-2">
          <Wallet className="w-4 h-4 text-gold" aria-hidden="true" />
          Sua chave PIX
        </p>

        <p className="text-sm text-slate-400 mt-1 leading-relaxed">
          Com ela cadastrada, o vendedor copia um código já com o valor certo e
          paga em um clique — sem precisar perguntar nada a você.
        </p>

        {/* O tipo vem escolhido em vez de adivinhado: onze dígitos podem ser um
            CPF ou um celular com DDD, e a diferença decide se o banco encontra
            a chave ou não. */}
        <fieldset className="mt-5">
          <legend className="text-sm text-slate-300 mb-2">Tipo de chave</legend>

          <div className="flex flex-wrap gap-2">
            {TIPOS.map((item) => (
              <button
                key={item.valor}
                type="button"
                onClick={() => setTipo(item.valor)}
                aria-pressed={tipo === item.valor}
                className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 ${
                  tipo === item.valor
                    ? 'bg-gold text-navy-900'
                    : 'border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                {item.rotulo}
              </button>
            ))}
          </div>
        </fieldset>

        <label htmlFor="chave-pix" className="sr-only">
          Chave PIX
        </label>

        <input
          id="chave-pix"
          value={chavePix}
          onChange={(evento) => setChavePix(evento.target.value)}
          placeholder={exemplo}
          inputMode={tipo === 'email' || tipo === 'aleatoria' ? 'text' : 'numeric'}
          className="w-full mt-4 rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
        />

        {/* O que vai ser guardado, à vista. É aqui que o fornecedor vê o +55
            aparecer e confere contra o que está registrado no banco dele. */}
        {chaveFinal && (
          <div className="mt-4 rounded-xl border border-white/5 bg-navy-900/80 px-4 py-3">
            <p className="text-xs text-slate-400">Vai ser guardada assim</p>
            <p className="font-mono text-sm text-gold mt-1 break-all">{chaveFinal}</p>
          </div>
        )}

        <p className="text-sm text-slate-400 mt-3 leading-relaxed">
          Confira contra a tela de chaves do seu banco. O dinheiro vai direto do
          banco do vendedor para o seu — o FORNEXA não passa no meio e não tem
          como desfazer um envio para a chave errada.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="font-semibold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-gold" aria-hidden="true" />
          Horário de corte
        </p>

        <p className="text-sm text-slate-400 mt-1 leading-relaxed">
          Até que horas o pedido ainda sai no mesmo dia. O vendedor passa a ver
          um aviso em cada pedido dizendo se ainda dá tempo hoje.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
          <div>
            <label htmlFor="corte" className="block text-sm text-slate-300 mb-2">
              Etiqueta normal
            </label>

            <input
              id="corte"
              type="time"
              value={corte}
              onChange={(evento) => setCorte(evento.target.value)}
              className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            />
          </div>

          <div>
            <label htmlFor="corte-flex" className="block text-sm text-slate-300 mb-2">
              Flex
            </label>

            <input
              id="corte-flex"
              type="time"
              value={corteFlex}
              onChange={(evento) => setCorteFlex(evento.target.value)}
              className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            />
          </div>
        </div>

        <p className="text-sm text-slate-400 mt-3 leading-relaxed">
          Deixe em branco o que não se aplica. Sem Flex, é só não preencher o
          segundo campo.
        </p>
      </div>

      {/* Texto livre de propósito: cada fornecedor tem uma regra que ninguém
          previu, e criar uma coluna por regra é como o cadastro incha até
          ninguém preencher. */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="font-semibold text-white">Avisos para os vendedores</p>

        <p className="text-sm text-slate-400 mt-1 leading-relaxed">
          O que eles precisam saber antes de vender: cadastro em transportadora,
          dias sem expediente, pedido mínimo. Aparece em todo pedido seu.
        </p>

        <label htmlFor="avisos" className="sr-only">
          Avisos
        </label>

        <textarea
          id="avisos"
          value={avisos}
          onChange={(evento) => setAvisos(evento.target.value)}
          rows={4}
          placeholder="Ex: envio Flex é feito pela transportadora J3 — o vendedor precisa ter cadastro com eles antes de despachar."
          className="w-full mt-4 rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 resize-y"
        />
      </div>

      {/* Entra no PIX que o vendedor gera. Enquanto isto não existia, ele
          pagava a menos em toda venda e o Financeiro dele mostrava lucro
          maior do que o real — dois erros que só apareceriam quando o
          fornecedor fosse conferir a conta. */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="font-semibold text-white flex items-center gap-2">
          <Package className="w-4 h-4 text-gold" aria-hidden="true" />
          Taxa de embalagem
        </p>

        <p className="text-sm text-slate-400 mt-1 leading-relaxed">
          Quanto você cobra por pedido pela embalagem. Entra automaticamente no
          PIX que o vendedor gera — é uma por pacote, não uma por peça. Deixe
          vazio se não cobra.
        </p>

        <div className="mt-3 max-w-[200px]">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">R$</span>

            <input
              value={taxaEmbalagem}
              onChange={(evento) => setTaxaEmbalagem(evento.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              className="w-full px-3 py-2 rounded-lg border border-navy-600 bg-navy-900 text-white"
            />
          </div>
        </div>
      </div>

      {/* O endereço vira o remetente da etiqueta do vendedor — e é para cá que
          a devolução volta. Errado, o pacote parte daqui declarando origem em
          outro estado, e o que voltar cai na casa de quem não tem o que fazer
          com ele. */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="font-semibold text-white flex items-center gap-2">
          <MapPin className="w-4 h-4 text-gold" aria-hidden="true" />
          Endereço de onde saem as encomendas
        </p>

        <p className="text-sm text-slate-400 mt-1 leading-relaxed">
          Os vendedores cadastram este endereço como remetente na loja deles.
          É o que aparece na etiqueta e é para cá que as devoluções voltam.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
          <div className="sm:col-span-1">
            <label htmlFor="cep" className="block text-sm text-slate-300 mb-2">
              CEP
            </label>

            <input
              id="cep"
              value={endereco.cep}
              onChange={(evento) =>
                setEndereco((atual) => ({ ...atual, cep: evento.target.value }))
              }
              placeholder="00000-000"
              inputMode="numeric"
              className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="logradouro" className="block text-sm text-slate-300 mb-2">
              Rua
            </label>

            <input
              id="logradouro"
              value={endereco.logradouro}
              onChange={(evento) =>
                setEndereco((atual) => ({ ...atual, logradouro: evento.target.value }))
              }
              placeholder="Av. Paulista"
              className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            />
          </div>

          <div>
            <label htmlFor="numero" className="block text-sm text-slate-300 mb-2">
              Número
            </label>

            <input
              id="numero"
              value={endereco.numero}
              onChange={(evento) =>
                setEndereco((atual) => ({ ...atual, numero: evento.target.value }))
              }
              placeholder="1000"
              className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            />
          </div>

          <div>
            <label htmlFor="complemento" className="block text-sm text-slate-300 mb-2">
              Complemento
            </label>

            <input
              id="complemento"
              value={endereco.complemento}
              onChange={(evento) =>
                setEndereco((atual) => ({ ...atual, complemento: evento.target.value }))
              }
              placeholder="Sala 1304"
              className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            />
          </div>

          <div>
            <label htmlFor="bairro" className="block text-sm text-slate-300 mb-2">
              Bairro
            </label>

            <input
              id="bairro"
              value={endereco.bairro}
              onChange={(evento) =>
                setEndereco((atual) => ({ ...atual, bairro: evento.target.value }))
              }
              placeholder="Centro"
              className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="cidade" className="block text-sm text-slate-300 mb-2">
              Cidade
            </label>

            <input
              id="cidade"
              value={endereco.cidade}
              onChange={(evento) =>
                setEndereco((atual) => ({ ...atual, cidade: evento.target.value }))
              }
              placeholder="São Paulo"
              className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            />
          </div>

          <div>
            <label htmlFor="estado" className="block text-sm text-slate-300 mb-2">
              Estado
            </label>

            <input
              id="estado"
              value={endereco.estado}
              onChange={(evento) =>
                setEndereco((atual) => ({ ...atual, estado: evento.target.value }))
              }
              placeholder="SP"
              maxLength={2}
              className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 text-white uppercase placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={salvar}
        disabled={salvando}
        className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-navy-900 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50"
      >
        {salvando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {salvo && !salvando && <Check className="w-4 h-4" aria-hidden="true" />}
        {salvando ? 'Salvando...' : salvo ? 'Salvo' : 'Salvar'}
      </button>
    </div>
  );
}
