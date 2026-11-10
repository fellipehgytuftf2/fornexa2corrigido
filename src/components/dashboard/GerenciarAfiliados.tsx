import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  criarAfiliado,
  decidirAfiliado,
  linkDoAfiliado,
  listarAfiliadosDoAdmin,
  podeDivulgar,
  removerAfiliado,
  salvarCheckoutDoAfiliado,
  salvarValoresDoAfiliado,
  trocarApelido,
  type AfiliadoDoAdmin,
} from '../../lib/afiliados';
import { ehCheckoutDaCasa, PLANOS } from '../../lib/planos';

/**
 * O preço da casa, como texto-fantasma do campo.
 *
 * Vem de PLANOS e não escrito à mão: o campo em branco significa "usa o
 * preço da casa", então a dica tem de dizer qual é ele hoje. Escrita à mão,
 * continuaria prometendo 139,00 no dia seguinte a um reajuste.
 */
const precoDaCasa = (id: 'basico' | 'premium') =>
  PLANOS.find((plano) => plano.id === id)?.preco.replace('R$', '').trim() ?? '';

/**
 * O que foi digitado no campo de preço, como número.
 *
 * Campo vazio vira nulo, que é o preço da casa -- não zero, que seria
 * anunciar de graça. Aceita "139", "139,00" e "1.139,00" porque é assim que
 * se escreve dinheiro aqui; e aceita "139.00" de quem tem o teclado em
 * inglês. Com vírgula presente, o ponto é separador de milhar; sem vírgula,
 * um ponto sozinho é a casa decimal.
 */
const precoDigitado = (texto: string): number | null => {
  const bruto = texto.replace(/[^\d.,]/g, '').trim();

  if (!bruto) return null;

  const normalizado = bruto.includes(',')
    ? bruto.replace(/\./g, '').replace(',', '.')
    : bruto;

  const numero = Number(normalizado);

  return Number.isFinite(numero) && numero > 0 ? numero : null;
};

/** O número gravado, de volta no campo do jeito que se escreve. */
const precoNoCampo = (valor: number | null | undefined) =>
  valor == null ? '' : valor.toFixed(2).replace('.', ',');

/**
 * Todos os afiliados numa tela só, cada um num cartão.
 *
 * POR QUE ESTA TELA, SE JÁ HAVIA "ACEITAR PEDIDO"
 *
 * Aquela tela responde a uma pergunta de uma vez só: quem pediu, e eu aceito?
 * Depois do aceite ela não serve mais para nada — e é justamente depois que
 * aparece o trabalho de todo dia. Qual é o link do Paulo. O cupom da Faella
 * ainda está de pé. Esse aqui já colou os checkouts. Preciso tirar o João do
 * ar hoje, sem apagar o histórico dele.
 *
 * Cada uma dessas respostas estava num canto diferente, e algumas não
 * estavam em canto nenhum.
 *
 * COMO O CARTÃO É ORGANIZADO
 *
 * Em cima, quem é a pessoa e em que pé ela está. Embaixo, em três blocos, as
 * três coisas que se copiam e colam o dia inteiro: o link que ela divulga, os
 * checkouts da conta dela e o código. Separados porque vão para lugares
 * diferentes — o link vai para a pessoa, o checkout vem da Applyfy, o código
 * entra na conversa.
 *
 * LIGAR E DESLIGAR, EM VEZ DE APAGAR
 *
 * A chave tira o link do ar na hora e deixa a linha onde está. Parceria que
 * esfria costuma voltar, e apagar levaria junto o apelido — que é o endereço
 * que a pessoa já espalhou por aí. A lixeira continua existindo para quem sai
 * de vez.
 */

/** A mesma regra que a coluna `apelido` cobra no banco. */
const CODIGO_VALIDO = /^[a-z0-9-]{3,40}$/;


const AGORA_EM_PT = (valor: string | null) =>
  valor ? new Date(valor).toLocaleDateString('pt-BR') : '—';

const semAcento = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Botãozinho que copia e diz que copiou. */
function BotaoCopiar({
  texto,
  rotulo,
  titulo,
}: {
  texto: string;
  rotulo: string;
  titulo?: string;
}) {
  const [copiou, setCopiou] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiou(true);
      window.setTimeout(() => setCopiou(false), 1600);
    } catch {
      // Navegador que recusa a área de transferência (sem https, sem
      // permissão) não pode deixar o botão mudo: o texto aparece para
      // selecionar à mão.
      window.prompt('Copie o texto:', texto);
    }
  };

  return (
    <button
      type="button"
      onClick={copiar}
      disabled={!texto}
      title={titulo}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-navy-600 text-xs font-medium text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {copiou ? (
        <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
      {copiou ? 'Copiado' : rotulo}
    </button>
  );
}

/** O bloco cinza com título pequeno que agrupa os botões de uma coisa só. */
function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-gray-200 dark:border-navy-600 bg-gray-50/60 dark:bg-navy-900/40 p-3">
      <p className="text-[10px] font-semibold tracking-wider text-gray-500 dark:text-slate-400 uppercase mb-2">
        {titulo}
      </p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Selo({ afiliado }: { afiliado: AfiliadoDoAdmin }) {
  const base =
    'shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide';

  if (afiliado.situacao === 'pendente') {
    return (
      <span className={`${base} bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400`}>
        Pediu
      </span>
    );
  }

  if (afiliado.situacao === 'recusado') {
    return (
      <span className={`${base} bg-gray-100 dark:bg-navy-700 text-gray-600 dark:text-slate-400`}>
        Pausado
      </span>
    );
  }

  if (!podeDivulgar(afiliado)) {
    return (
      <span className={`${base} bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400`}>
        Falta checkout
      </span>
    );
  }

  return (
    <span className={`${base} bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400`}>
      Ativo
    </span>
  );
}

function Cartao({
  afiliado,
  aoMudar,
}: {
  afiliado: AfiliadoDoAdmin;
  aoMudar: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [apelido, setApelido] = useState(afiliado.apelido);
  const [basico, setBasico] = useState(afiliado.checkout_basico);
  const [premium, setPremium] = useState(afiliado.checkout_premium);
  const [valorBasico, setValorBasico] = useState(precoNoCampo(afiliado.valor_basico));
  const [valorPremium, setValorPremium] = useState(precoNoCampo(afiliado.valor_premium));

  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  const ativo = afiliado.situacao === 'aprovado';
  const link = linkDoAfiliado(afiliado.apelido);

  const tentar = async (acao: () => Promise<void>) => {
    setOcupado(true);
    setErro('');

    try {
      await acao();
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível.');
    } finally {
      setOcupado(false);
    }
  };

  const salvar = () => {
    if ([basico, premium].some((url) => url.trim() && ehCheckoutDaCasa(url))) {
      setErro(
        'Esse é o checkout da própria FORNEXA, não um criado para este afiliado. Cole o link que a Applyfy gerou na conta dele.'
      );
      return;
    }

    return tentar(async () => {
      if (apelido.trim().toLowerCase() !== afiliado.apelido) {
        await trocarApelido(afiliado.conta, apelido);
      }

      if (basico !== afiliado.checkout_basico || premium !== afiliado.checkout_premium) {
        await salvarCheckoutDoAfiliado(afiliado.conta, { basico, premium });
      }

      const novoBasico = precoDigitado(valorBasico);
      const novoPremium = precoDigitado(valorPremium);

      if (
        novoBasico !== (afiliado.valor_basico ?? null) ||
        novoPremium !== (afiliado.valor_premium ?? null)
      ) {
        await salvarValoresDoAfiliado(afiliado.conta, {
          basico: novoBasico,
          premium: novoPremium,
        });
      }

      setEditando(false);
    });
  };

  const campo =
    'w-full px-3 py-2 rounded-lg bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-gold';

  return (
    <div className="rounded-[20px] border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-800 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-navy-900 dark:text-white truncate">
              {afiliado.nome || afiliado.email || 'Sem nome'}
            </p>
            <Selo afiliado={afiliado} />
          </div>

          <p className="text-sm text-gray-500 dark:text-slate-400 truncate mt-0.5">
            {afiliado.email}
          </p>

          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            Código: <span className="font-mono text-navy-900 dark:text-white">{afiliado.apelido}</span>
            {' · '}
            Entrou em {AGORA_EM_PT(afiliado.pedido_em)}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* A chave só aparece depois que a pessoa foi aceita: enquanto o
              pedido está pendente, quem decide é a tela de Aceitar pedido. */}
          {afiliado.situacao !== 'pendente' && (
            <button
              type="button"
              role="switch"
              aria-checked={ativo}
              aria-label={ativo ? 'Desligar afiliado' : 'Ligar afiliado'}
              disabled={ocupado}
              onClick={() => tentar(() => decidirAfiliado(afiliado.conta, !ativo))}
              className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
                ativo ? 'bg-gold' : 'bg-gray-300 dark:bg-navy-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  ativo ? 'translate-x-5' : ''
                }`}
              />
            </button>
          )}

          <button
            type="button"
            onClick={() => setEditando((estava) => !estava)}
            aria-label="Editar afiliado"
            className="p-2 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
          >
            {editando ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setConfirmando(true)}
            aria-label="Remover afiliado"
            className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {erro && (
        <p className="mt-3 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {erro}
        </p>
      )}

      {confirmando && (
        <div className="mt-3 rounded-[14px] border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-3">
          <p className="text-xs text-red-700 dark:text-red-400">
            Tirar <strong>{afiliado.nome || afiliado.email}</strong> do programa? O link{' '}
            <span className="font-mono">/{afiliado.apelido}</span> para de vender na hora e o
            código fica livre para outra pessoa. As vendas já feitas continuam no histórico.
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => tentar(() => removerAfiliado(afiliado.conta))}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {ocupado && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Remover
            </button>

            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {editando ? (
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">
              Código (vira o endereço {window.location.host}/código)
            </label>
            <input
              type="text"
              value={apelido}
              onChange={(e) => setApelido(e.target.value)}
              className={campo}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">
              Checkout Básico da conta dele
            </label>
            <input
              type="text"
              value={basico}
              onChange={(e) => setBasico(e.target.value)}
              placeholder="https://checkout.applyfy.com.br/checkout/..."
              className={campo}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">
              Checkout Premium da conta dele
            </label>
            <input
              type="text"
              value={premium}
              onChange={(e) => setPremium(e.target.value)}
              placeholder="https://checkout.applyfy.com.br/checkout/..."
              className={campo}
            />
          </div>

          <div className="rounded-[14px] border border-gray-200 dark:border-navy-600 bg-gray-50/60 dark:bg-navy-900/40 p-3 space-y-3">
            <div>
              <p className="text-[10px] font-semibold tracking-wider text-gray-500 dark:text-slate-400 uppercase">
                Preço que a landing dele mostra
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Em branco usa o preço da casa. Tem de bater com o que o checkout dele cobra —
                o sistema não consegue conferir isso sozinho.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">
                  Básico
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valorBasico}
                  onChange={(e) => setValorBasico(e.target.value)}
                  placeholder={precoDaCasa('basico')}
                  className={campo}
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">
                  Premium
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valorPremium}
                  onChange={(e) => setValorPremium(e.target.value)}
                  placeholder={precoDaCasa('premium')}
                  className={campo}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={salvar}
            disabled={ocupado || !apelido.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-900 dark:bg-white text-white dark:text-navy-900 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {ocupado && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Salvar
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Bloco titulo="Link de divulgação">
            <BotaoCopiar texto={link} rotulo="Copiar" titulo={link} />

            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-navy-600 text-xs font-medium text-navy-900 dark:text-white hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir
            </a>
          </Bloco>

          <Bloco titulo="Checkouts">
            <BotaoCopiar
              texto={afiliado.checkout_basico}
              rotulo="Básico"
              titulo={afiliado.checkout_basico || 'Ainda não colado'}
            />
            <BotaoCopiar
              texto={afiliado.checkout_premium}
              rotulo="Premium"
              titulo={afiliado.checkout_premium || 'Ainda não colado'}
            />
          </Bloco>

          <Bloco titulo="Código">
            <BotaoCopiar texto={afiliado.apelido} rotulo={afiliado.apelido} />

            {/* Preço próprio é exceção, então só aparece quando existe: num
                cartão onde todo mundo mostra "padrão", a palavra deixa de ser
                lida e a exceção se esconde no meio. */}
            {(afiliado.valor_basico != null || afiliado.valor_premium != null) && (
              <span className="text-xs text-gray-500 dark:text-slate-400">
                Preço próprio: {precoNoCampo(afiliado.valor_basico) || 'padrão'} /{' '}
                {precoNoCampo(afiliado.valor_premium) || 'padrão'}
              </span>
            )}
          </Bloco>
        </div>
      )}
    </div>
  );
}

function NovoAfiliado({ aoCriar }: { aoCriar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState('');
  const [apelido, setApelido] = useState('');
  const [basico, setBasico] = useState('');
  const [premium, setPremium] = useState('');
  const [valorBasico, setValorBasico] = useState('');
  const [valorPremium, setValorPremium] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const criar = async () => {
    if ([basico, premium].some((url) => url.trim() && ehCheckoutDaCasa(url))) {
      setErro(
        'Esse é o checkout da própria FORNEXA, não um criado para este afiliado. Cole o link que a Applyfy gerou na conta dele.'
      );
      return;
    }

    setSalvando(true);
    setErro('');

    try {
      await criarAfiliado(email, apelido, {
        checkoutBasico: basico,
        checkoutPremium: premium,
        valorBasico: precoDigitado(valorBasico),
        valorPremium: precoDigitado(valorPremium),
      });

      setEmail('');
      setApelido('');
      setBasico('');
      setPremium('');
      setValorBasico('');
      setValorPremium('');
      setAberto(false);
      aoCriar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar.');
    } finally {
      setSalvando(false);
    }
  };

  const campo =
    'w-full px-3 py-2 rounded-lg bg-white dark:bg-navy-700 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold';

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-gold text-navy-900 text-sm font-bold hover:opacity-90 transition-opacity"
      >
        <Plus className="w-4 h-4" />
        Novo afiliado
      </button>
    );
  }

  return (
    <div className="w-full rounded-[20px] border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-800 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="font-bold text-navy-900 dark:text-white">Novo afiliado</p>

        <button
          type="button"
          onClick={() => setAberto(false)}
          aria-label="Fechar"
          className="p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">
            E-mail da conta dele na FORNEXA
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@exemplo.com"
            className={campo}
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">
            Código dele — vira {window.location.host}/código
          </label>
          <input
            type="text"
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            placeholder="paulo"
            className={`${campo} font-mono`}
          />

          {/* O campo ao lado do e-mail parece pedir um endereço, e o link do
              checkout está sempre na área de transferência de quem acabou de
              criá-lo na Applyfy. O erro é natural, e o banco só o apanharia
              depois do clique. */}
          {apelido.trim() !== '' && !CODIGO_VALIDO.test(apelido.trim().toLowerCase()) && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              {/\//.test(apelido)
                ? 'Isso parece um link. Aqui vai só o apelido curto — "paulo". O checkout entra depois, no lápis do cartão.'
                : 'De 3 a 40 caracteres, só letras minúsculas, números e hífen.'}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-[14px] border border-gray-200 dark:border-navy-600 bg-gray-50/60 dark:bg-navy-900/40 p-3 space-y-3">
        <div>
          <p className="text-[10px] font-semibold tracking-wider text-gray-500 dark:text-slate-400 uppercase">
            Checkouts dele na Applyfy
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            São os links que os botões da landing dele vão abrir. Pode deixar para depois —
            enquanto estiverem vazios, o link não vende e a venda cai no checkout da casa.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">Básico</label>
            <input
              type="text"
              value={basico}
              onChange={(e) => setBasico(e.target.value)}
              placeholder="https://checkout.applyfy.com.br/checkout/..."
              className={`${campo} text-xs font-mono`}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">Premium</label>
            <input
              type="text"
              value={premium}
              onChange={(e) => setPremium(e.target.value)}
              placeholder="https://checkout.applyfy.com.br/checkout/..."
              className={`${campo} text-xs font-mono`}
            />
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold tracking-wider text-gray-500 dark:text-slate-400 uppercase">
            Preço que a landing dele mostra
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            Em branco usa o preço da casa. Tem de bater com o que o checkout acima cobra.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <input
              type="text"
              inputMode="decimal"
              value={valorBasico}
              onChange={(e) => setValorBasico(e.target.value)}
              placeholder={precoDaCasa('basico')}
              className={campo}
            />
          </div>

          <div>
            <input
              type="text"
              inputMode="decimal"
              value={valorPremium}
              onChange={(e) => setValorPremium(e.target.value)}
              placeholder={precoDaCasa('premium')}
              className={campo}
            />
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
        A pessoa precisa já ter conta na FORNEXA — o afiliado fica preso à conta dela.
      </p>

      {erro && (
        <p className="mt-2 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {erro}
        </p>
      )}

      <button
        type="button"
        onClick={criar}
        disabled={
          salvando || !email.trim() || !CODIGO_VALIDO.test(apelido.trim().toLowerCase())
        }
        className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-900 dark:bg-white text-white dark:text-navy-900 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Criar afiliado
      </button>
    </div>
  );
}

export default function GerenciarAfiliados() {
  const [lista, setLista] = useState<AfiliadoDoAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');

  // Esta tela não pergunta o papel de ninguém: quem chega aqui é admin ou
  // co-produtor, e os dois fazem as mesmas coisas com afiliado. Quem decide
  // isso é a política da tabela `afiliados`, não o navegador.

  const carregar = async () => {
    try {
      setLista(await listarAfiliadosDoAdmin());
      setErro('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());

    if (!termo) return lista;

    return lista.filter((a) =>
      [a.nome, a.email, a.apelido].some((campo) => campo && semAcento(campo).includes(termo))
    );
  }, [lista, busca]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-[14px] bg-gold/15 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-gold" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-navy-900 dark:text-white">Afiliados</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Quem divulga a FORNEXA, com o link, os checkouts e o código de cada um.
            </p>
          </div>
        </div>

        <NovoAfiliado aoCriar={carregar} />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, e-mail ou código..."
          className="w-full pl-10 pr-4 py-2.5 rounded-full bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 text-navy-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold"
        />
      </div>

      {erro && (
        <p className="flex items-start gap-2 rounded-[14px] border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {erro}
        </p>
      )}

      {carregando ? (
        <div className="flex items-center justify-center py-12 text-gray-500 dark:text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-gray-300 dark:border-navy-600 py-12 text-center">
          <p className="font-semibold text-navy-900 dark:text-white">
            {busca ? 'Ninguém com esse nome' : 'Nenhum afiliado ainda'}
          </p>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            {busca
              ? 'Tente outro trecho do nome, do e-mail ou do código.'
              : 'Use "Novo afiliado" para pôr alguém no programa.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map((afiliado) => (
            <Cartao key={afiliado.conta} afiliado={afiliado} aoMudar={carregar} />
          ))}
        </div>
      )}
    </div>
  );
}
