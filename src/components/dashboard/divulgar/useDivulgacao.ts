import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../lib/toast';

/**
 * O que o "Divulgar" faz: a mensagem, a troca de frase, a cópia, a abertura
 * do Facebook e do WhatsApp e a medição. O desenho fica em DivulgarEstudio.
 *
 * POR QUE NÃO PUBLICA SOZINHO
 *
 * Desde junho de 2026 a Meta não permite que ferramenta de terceiro publique
 * em grupo do Facebook, nem consulte grupos pela API. O que dá para fazer é
 * deixar a mensagem pronta e abrir o lugar certo — quem publica é a pessoa.
 */

export interface DadosDaDivulgacao {
  produtoId: string;
  titulo: string;
  categoria: string;
  linkDoAnuncio: string;
  imagem?: string | null;
  preco?: number | null;
  lucro?: number | null;
}

export type Canal = 'grupos' | 'perfil' | 'whatsapp' | 'link';

export const CANAIS: { id: Canal; nome: string; detalhe: string }[] = [
  { id: 'grupos', nome: 'Grupos do Facebook', detalhe: 'Copia o texto e busca grupos do nicho' },
  { id: 'perfil', nome: 'Post', detalhe: 'Copia o texto e abre o compartilhamento' },
  { id: 'whatsapp', nome: 'WhatsApp', detalhe: 'Abre o WhatsApp com a mensagem pronta' },
  { id: 'link', nome: 'Copiar link', detalhe: 'Só o link, para colar onde quiser' },
];

export const formatarReais = (valor?: number | null) =>
  Number(valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * As frases do botão "Gerar com IA". Cada uma recebe o título e o preço do
 * anúncio, e o link vai sempre no fim.
 *
 * Nenhuma promete o que o FORNEXA não sabe: nada de "últimas unidades",
 * "frete grátis" ou "entrega amanhã" — isso depende do anúncio e do
 * comprador, e frase que mente é denúncia no grupo.
 */
const FRASES: ((titulo: string, preco: string) => string)[] = [
  (t, p) => `Achei em promoção: ${t}${p ? ` por ${p}` : ''}.\nCompra garantida pelo Mercado Livre.`,
  (t, p) => `${t}${p ? ` — ${p}` : ''}`,
  (t, p) => `Alguém aqui procurando ${t}? Achei${p ? ` por ${p}` : ''}, com compra garantida pelo Mercado Livre.`,
  (t, p) => `Olha que achado: ${t}${p ? ` saindo por ${p}` : ''} no Mercado Livre.`,
  (t, p) => `Quem estava precisando de ${t}?${p ? ` Tem por ${p},` : ''} com envio pelo Mercado Livre.`,
  (t, p) => `Ideia de presente: ${t}${p ? `, por ${p}` : ''}.`,
  (t, p) => `Preço bom de verdade: ${t}${p ? ` por ${p}` : ''}. Compra com a garantia do Mercado Livre.`,
  (t, p) => `Para quem pediu indicação: ${t}${p ? `, ${p}` : ''}. O link está aqui embaixo.`,
  (t, p) => `Vale a pena conferir: ${t}${p ? ` por apenas ${p}` : ''}.`,
  (t, p) => `Novidade na minha loja: ${t}${p ? `, ${p}` : ''}.`,
  (t, p) => `${t}${p ? ` por ${p}` : ''}.\nCompra Garantida do Mercado Livre: se não chegar, você recebe o dinheiro de volta.`,
  (t, p) => `Promoção do dia: ${t}${p ? ` por ${p}` : ''}. Pague com segurança pelo Mercado Livre.`,
  (t, p) => `Tá aí o que faltava: ${t}${p ? `, ${p}` : ''}.`,
  (t, p) => `Achado do dia: ${t}${p ? ` por ${p}` : ''}. Confira no link.`,
  (t, p) => `Quer economizar? ${t}${p ? ` por ${p}` : ''}, direto pelo Mercado Livre.`,
];

function montarFrase(indice: number, dados: DadosDaDivulgacao) {
  const preco = dados.preco ? formatarReais(dados.preco) : '';
  return `${FRASES[indice](dados.titulo, preco)}\n${dados.linkDoAnuncio}`;
}

/** Uma frase sorteada que não seja a que está na tela agora. */
function sortearOutra(atual: number) {
  const sorteio = Math.floor(Math.random() * (FRASES.length - 1));
  return sorteio >= atual ? sorteio + 1 : sorteio;
}

async function copiarParaAreaDeTransferencia(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Navegador antigo, ou página sem HTTPS: a área de transferência moderna
    // não existe. O caminho velho ainda funciona em todos eles.
    const campo = document.createElement('textarea');
    campo.value = texto;
    campo.style.position = 'fixed';
    campo.style.opacity = '0';
    document.body.appendChild(campo);
    campo.select();

    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(campo);
    }
  }
}

function abrirEmNovaAba(endereco: string) {
  window.open(endereco, '_blank', 'noopener,noreferrer');
}

export function useDivulgacao(dados: DadosDaDivulgacao) {
  const { mostrarToast } = useToast();

  const [fraseAtual, setFraseAtual] = useState(0);
  const [mensagem, setMensagem] = useState(() => montarFrase(0, dados));
  const [feito, setFeito] = useState<Canal | null>(null);
  // Sobe a cada frase nova: a caixa da mensagem usa isto para piscar e
  // mostrar que o texto mudou.
  const [vezesQueGerou, setVezesQueGerou] = useState(0);

  // Cada clique troca a mensagem por outra frase, direto na caixa.
  const gerarFrase = () => {
    const proxima = sortearOutra(fraseAtual);
    setFraseAtual(proxima);
    setMensagem(montarFrase(proxima, dados));
    setVezesQueGerou((vezes) => vezes + 1);
  };

  useEffect(() => {
    if (!feito) return;
    const temporizador = window.setTimeout(() => setFeito(null), 2200);
    return () => window.clearTimeout(temporizador);
  }, [feito]);

  const registrar = (acao: 'copiou' | 'buscou_grupos' | 'compartilhou') => {
    // Medição não atrapalha a ação: se falhar, a pessoa nem fica sabendo.
    void supabase.rpc('registrar_divulgacao', {
      p_user_product_id: dados.produtoId,
      p_acao: acao,
    });
  };

  const copiar = async (texto: string, aviso = 'Texto copiado!') => {
    const deu = await copiarParaAreaDeTransferencia(texto);

    if (!deu) {
      mostrarToast('Não foi possível copiar. Selecione o texto e copie na mão.', 'erro');
      return false;
    }

    registrar('copiou');
    mostrarToast(aviso, 'sucesso', 3000);
    return true;
  };

  /** Um clique por canal: copia o que aquele lugar precisa e já abre ele. */
  const usarCanal = async (canal: Canal) => {
    if (canal === 'link') {
      if (await copiar(dados.linkDoAnuncio, 'Link copiado!')) setFeito('link');
      return;
    }

    if (canal === 'whatsapp') {
      // O WhatsApp aceita texto pronto no link — diferente do Facebook. Negrito
      // no WhatsApp é *assim*, então o título vai destacado.
      const textoDoWhats = mensagem.replace(dados.titulo, `*${dados.titulo}*`);
      registrar('compartilhou');
      abrirEmNovaAba(`https://api.whatsapp.com/send?text=${encodeURIComponent(textoDoWhats)}`);
      setFeito('whatsapp');
      return;
    }

    // Facebook: o compartilhamento leva só o link, e a busca de grupos não
    // leva texto nenhum. Por isso a mensagem vai antes para a área de
    // transferência — lá dentro é só colar.
    const copiou = await copiar(mensagem, 'Texto copiado! Agora é só colar no Facebook.');

    if (canal === 'grupos') {
      registrar('buscou_grupos');
      abrirEmNovaAba(
        `https://www.facebook.com/search/groups/?q=${encodeURIComponent(dados.categoria)}`
      );
    } else {
      registrar('compartilhou');
      abrirEmNovaAba(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(dados.linkDoAnuncio)}`
      );
    }

    if (copiou) setFeito(canal);
  };

  return {
    mensagem,
    setMensagem,
    feito,
    usarCanal,
    copiarMensagem: () => copiar(mensagem),
    gerarFrase,
    vezesQueGerou,
  };
}

/**
 * Abre com animação e fecha esperando a animação de saída terminar.
 * `aberto` começa falso e vira verdadeiro no quadro seguinte, para o
 * navegador ter o estado inicial de onde animar.
 */
export function useAberturaAnimada(aoFechar: () => void, duracaoDaSaidaMs = 320) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const quadro = window.requestAnimationFrame(() => setAberto(true));
    return () => window.cancelAnimationFrame(quadro);
  }, []);

  const fechar = () => {
    setAberto(false);
    window.setTimeout(aoFechar, duracaoDaSaidaMs);
  };

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') fechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { aberto, fechar };
}
