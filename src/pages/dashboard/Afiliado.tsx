import { useEffect, useState } from 'react';
import { AlertCircle, Check, Copy, Loader2, Share2 } from 'lucide-react';
import {
  linkDoAfiliado,
  meuCadastroDeAfiliado,
  pedirParaSerAfiliado,
  podeDivulgar,
  podePedirDeNovoEm,
  type MeuAfiliado,
} from '../../lib/afiliados';

/**
 * O programa de afiliados, do lado de quem divulga.
 *
 * A tela tem quatro estados, e cada um diz a verdade sobre onde o pedido
 * parou: nunca pediu, esperando resposta, aceito mas sem link ainda, e
 * divulgando. Esconder a espera seria pior do que mostrá-la — quem pediu
 * quer saber que o pedido chegou.
 */
export default function Afiliado() {
  const [cadastro, setCadastro] = useState<MeuAfiliado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    meuCadastroDeAfiliado()
      .then(setCadastro)
      .finally(() => setCarregando(false));
  }, []);

  const pedir = async () => {
    setPedindo(true);
    setErro('');

    try {
      await pedirParaSerAfiliado();
      setCadastro(await meuCadastroDeAfiliado());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar o pedido.');
    } finally {
      setPedindo(false);
    }
  };

  const copiar = async () => {
    if (!cadastro) return;

    await navigator.clipboard.writeText(linkDoAfiliado(cadastro.apelido));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  if (carregando) {
    return (
      <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
        <div className="flex items-center gap-3 text-gray-500 dark:text-slate-400 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Carregando...
        </div>
      </div>
    );
  }

  const pronto = cadastro ? podeDivulgar(cadastro) : false;

  return (
    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-200 dark:border-navy-700 p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Share2 className="w-5 h-5 text-gray-600 dark:text-slate-400" />

        <h2 className="text-lg font-semibold text-navy-900 dark:text-white">
          Programa de afiliados
        </h2>
      </div>

      <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 mb-6">
        Indique o FORNEXA e ganhe comissão por cada assinatura que vier do seu
        link.
      </p>

      {erro && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 mb-5">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{erro}</p>
        </div>
      )}

      {!cadastro && (
        <div className="rounded-xl border border-gray-200 dark:border-navy-600 p-6 text-center">
          <p className="text-sm text-navy-900 dark:text-white font-medium">
            Quer divulgar o FORNEXA?
          </p>

          <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 mb-5 max-w-sm mx-auto leading-relaxed">
            Peça para entrar no programa. A gente responde e, se aceitar,
            prepara o seu link de divulgação.
          </p>

          <button
            type="button"
            onClick={pedir}
            disabled={pedindo}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy-900 dark:bg-white text-white dark:text-navy-900 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {pedindo && <Loader2 className="w-4 h-4 animate-spin" />}
            Quero ser afiliado
          </button>
        </div>
      )}

      {cadastro?.situacao === 'pendente' && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 p-5">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
            Pedido enviado
          </p>

          <p className="text-xs text-amber-800 dark:text-amber-400/90 mt-1.5 leading-relaxed">
            Estamos analisando. Assim que aceitarmos, seu link aparece aqui
            nesta página.
          </p>
        </div>
      )}

      {cadastro?.situacao === 'recusado' && (
        <div className="rounded-xl border border-gray-200 dark:border-navy-600 p-5">
          <p className="text-sm font-medium text-navy-900 dark:text-white">
            Pedido não aceito desta vez
          </p>

          {podePedirDeNovoEm(cadastro.decidido_em) > new Date() ? (
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              Você pode pedir de novo a partir de{' '}
              <span className="font-medium text-navy-900 dark:text-white">
                {podePedirDeNovoEm(cadastro.decidido_em).toLocaleDateString('pt-BR')}
              </span>
              . Se quiser entender o motivo, fale com o suporte.
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5 mb-4 leading-relaxed">
                Já passou uma semana. Se quiser, pode pedir de novo.
              </p>

              <button
                type="button"
                onClick={pedir}
                disabled={pedindo}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy-900 dark:bg-white text-white dark:text-navy-900 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {pedindo && <Loader2 className="w-4 h-4 animate-spin" />}
                Pedir de novo
              </button>
            </>
          )}
        </div>
      )}

      {cadastro?.situacao === 'aprovado' && !pronto && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 p-5">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
            Aceito — preparando seu link
          </p>

          <p className="text-xs text-amber-800 dark:text-amber-400/90 mt-1.5 leading-relaxed">
            Falta configurarmos o seu checkout. Assim que terminarmos, o link
            aparece aqui e você já pode divulgar.
          </p>
        </div>
      )}

      {cadastro && pronto && (
        <div className="rounded-xl border border-gray-200 dark:border-navy-600 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-medium">
              <Check className="w-3.5 h-3.5" />
              Ativo
            </span>
          </div>

          <p className="text-xs text-gray-500 dark:text-slate-400 mb-1.5">
            Seu link de divulgação
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={linkDoAfiliado(cadastro.apelido)}
              onFocus={(event) => event.target.select()}
              className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-navy-900 border border-gray-200 dark:border-navy-600 text-navy-900 dark:text-white text-sm font-mono truncate"
            />

            <button
              type="button"
              onClick={copiar}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-white text-white dark:text-navy-900 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          <p className="text-xs text-gray-500 dark:text-slate-400 mt-3 leading-relaxed">
            Quem abrir esse endereço vê a página do FORNEXA e compra por você.
            Vale mandar por WhatsApp, colocar na bio ou fixar no seu conteúdo.
          </p>
        </div>
      )}
    </div>
  );
}
