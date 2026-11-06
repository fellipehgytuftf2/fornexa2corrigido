import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../lib/toast';

/**
 * Tudo o que os formatos de "Divulgar" fazem, num lugar só.
 *
 * Os formatos (gaveta, folha, estúdio, balão) mudam só o desenho. Texto,
 * cópia, abertura do Facebook e do WhatsApp e a medição ficam aqui, para os
 * quatro se comportarem igual e a escolha entre eles ser só de aparência.
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

export type Tom = 'promocao' | 'direto' | 'pergunta';
export type Canal = 'grupos' | 'perfil' | 'whatsapp' | 'link';

export const TONS: { id: Tom; nome: string }[] = [
  { id: 'promocao', nome: 'Promoção' },
  { id: 'direto', nome: 'Direto ao ponto' },
  { id: 'pergunta', nome: 'Pergunta ao grupo' },
];

export const CANAIS: { id: Canal; nome: string; detalhe: string }[] = [
  { id: 'grupos', nome: 'Grupos do Facebook', detalhe: 'Copia o texto e busca grupos do nicho' },
  { id: 'perfil', nome: 'Post', detalhe: 'Copia o texto e abre o compartilhamento' },
  { id: 'whatsapp', nome: 'WhatsApp', detalhe: 'Abre o WhatsApp com a mensagem pronta' },
  { id: 'link', nome: 'Copiar link', detalhe: 'Só o link, para colar onde quiser' },
];

export const formatarReais = (valor?: number | null) =>
  Number(valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function textoPronto(tom: Tom, dados: DadosDaDivulgacao) {
  const preco = dados.preco ? ` por ${formatarReais(dados.preco)}` : '';

  if (tom === 'direto') {
    return `${dados.titulo}${dados.preco ? ` — ${formatarReais(dados.preco)}` : ''}\n${dados.linkDoAnuncio}`;
  }

  if (tom === 'pergunta') {
    return `Alguém aqui procurando ${dados.titulo}? Achei${preco}, com compra garantida pelo Mercado Livre.\n${dados.linkDoAnuncio}`;
  }

  return `Achei em promoção: ${dados.titulo}${preco}.\nCompra garantida pelo Mercado Livre.\n${dados.linkDoAnuncio}`;
}

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

/** Sorteia `quantas` frases diferentes, já com o link no fim. */
function sortearFrases(dados: DadosDaDivulgacao, quantas: number, evitar: string[] = []) {
  const preco = dados.preco ? formatarReais(dados.preco) : '';
  const todas = FRASES.map((frase) => `${frase(dados.titulo, preco)}\n${dados.linkDoAnuncio}`);
  const novas = todas.filter((frase) => !evitar.includes(frase));
  const baralho = (novas.length >= quantas ? novas : todas).slice();

  for (let i = baralho.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [baralho[i], baralho[j]] = [baralho[j], baralho[i]];
  }

  return baralho.slice(0, quantas);
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

  const [tom, setTom] = useState<Tom>('promocao');
  const [mensagem, setMensagem] = useState(() => textoPronto('promocao', dados));
  const [feito, setFeito] = useState<Canal | null>(null);
  const [sugestoes, setSugestoes] = useState<string[]>([]);

  // Cada clique traz frases que ainda não estavam na tela.
  const gerarSugestoes = () => setSugestoes((atuais) => sortearFrases(dados, 3, atuais));

  const escolherSugestao = (texto: string) => {
    setMensagem(texto);
    setSugestoes([]);
  };

  // Trocar o tom troca o texto. Quem já editou e troca de tom recebe o texto
  // novo — o tom é justamente o pedido de outro texto.
  const escolherTom = (novo: Tom) => {
    setTom(novo);
    setMensagem(textoPronto(novo, dados));
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
    tom,
    escolherTom,
    mensagem,
    setMensagem,
    feito,
    usarCanal,
    copiarMensagem: () => copiar(mensagem),
    sugestoes,
    gerarSugestoes,
    escolherSugestao,
    fecharSugestoes: () => setSugestoes([]),
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
