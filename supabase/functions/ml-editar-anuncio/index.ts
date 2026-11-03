// ============================================================================
// ml-editar-anuncio
//
// Lê e altera um anúncio que já está no ar no Mercado Livre.
//
// DUAS AÇÕES
//
//   { acao: 'ler', user_product_id }
//     Devolve o anúncio como o Mercado Livre o tem agora: título, preço,
//     descrição, fotos, status, vendas e visitas dos últimos 30 dias. A tela
//     de edição abre com isto, e não com a cópia do FORNEXA — o vendedor pode
//     ter mexido direto no Mercado Livre.
//
//   { acao: 'salvar', user_product_id, mudancas: { preco?, titulo?,
//     descricao?, status?, fotos?, margem? } }
//     Manda só o que mudou e, dando certo, atualiza a cópia em user_products.
//
// O QUE O MERCADO LIVRE DEIXA MUDAR
//
// Preço, fotos, descrição e pausar/reativar: sempre. Título só enquanto o
// anúncio não tem venda — depois da primeira, ele recusa. A função confere as
// vendas de novo antes de mandar o título: a tela pode estar aberta há horas.
//
// Estoque fica de fora de propósito: quem tem a mercadoria é o fornecedor, e
// o FORNEXA já pausa sozinho quando ela acaba (ml-pausar-sem-estoque).
//
// SEGURANÇA
//
// O anúncio é procurado com o id do anúncio E o id de quem chamou. Sem as
// duas coisas, qualquer vendedor logado poderia mudar o preço do anúncio de
// outro sabendo só o id.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chavePublica, chaveSecreta, urlDoProjeto } from '../_shared/chaves.ts';
import { obterAccessToken } from '../_shared/tokenMercadoLivre.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Mesma limpeza da publicação: o Mercado Livre só aceita texto puro. */
function limparParaTextoPuro(texto: string): string {
  return texto
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 50000);
}

/**
 * A recusa do Mercado Livre, em português.
 *
 * Os motivos que se repetem ganham frase própria; o resto segue com o texto
 * deles, que pelo menos aponta o campo.
 */
function traduzirRecusa(corpo: Record<string, unknown> | null, status: number): string {
  const causas = Array.isArray(corpo?.cause) ? (corpo?.cause as Array<Record<string, unknown>>) : [];

  // 'error' entra junto com 'message' porque é lá que o Mercado Livre escreve
  // o motivo de verdade. Em 03/11 uma recusa de título chegou como
  // message: "BODY_INVALID_FIELDS", cause: 374 (um número, não uma lista) e
  // error: "You cannot modify the title if the item has a family_name" --
  // lendo só os dois primeiros, o vendedor recebia a sigla e mais nada.
  const textos = [
    String(corpo?.message ?? ''),
    String(corpo?.error ?? ''),
    ...causas.map((causa) => String(causa?.message ?? causa?.code ?? '')),
  ]
    .join(' ')
    .toLowerCase();

  // Precisa vir antes da regra de título abaixo: as duas falam de título, mas
  // o motivo é outro, e mandar o vendedor procurar uma venda que não existe
  // só faz ele perder tempo.
  if (/family_name|family name/.test(textos)) {
    return 'Este anúncio está ligado a uma ficha técnica do Mercado Livre, e o título é o da ficha. O Mercado Livre não deixa mudá-lo. Preço, descrição, fotos e pausa continuam valendo.';
  }

  if (/title/.test(textos) && /sold|vend|modif/.test(textos)) {
    return 'O Mercado Livre não deixa mudar o título de um anúncio que já vendeu.';
  }
  if (/price/.test(textos) && /(minimum|min|lower|menor)/.test(textos)) {
    return 'O Mercado Livre recusou o preço: ele está abaixo do mínimo permitido para esta categoria.';
  }
  if (/picture|image|foto/.test(textos)) {
    return 'O Mercado Livre não conseguiu usar uma das fotos. Troque a foto e tente de novo.';
  }
  if (/status/.test(textos) && /(stock|quantity|estoque)/.test(textos)) {
    return 'Não dá para reativar: o anúncio está sem estoque. Ele volta sozinho quando o fornecedor repor.';
  }
  if (/closed|inactive|under_review/.test(textos)) {
    return 'Este anúncio está encerrado ou em revisão no Mercado Livre e não aceita alterações agora.';
  }
  if (status === 401 || status === 403) {
    return 'O Mercado Livre não autorizou a alteração. Reconecte sua conta em Integrações.';
  }

  const mensagem = String(corpo?.message ?? '').trim();
  return mensagem ? `O Mercado Livre recusou a alteração: ${mensagem}` : 'O Mercado Livre recusou a alteração.';
}

interface Mudancas {
  preco?: number;
  titulo?: string;
  descricao?: string;
  status?: 'active' | 'paused';
  fotos?: string[];
  /** Lucro por venda no preço novo, calculado na tela com a mesma conta da publicação. */
  margem?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = urlDoProjeto();
  const serviceRoleKey = chaveSecreta();
  const anonKey = chavePublica();

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'Função mal configurada no servidor.' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  const {
    data: { user },
  } = await createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  }).auth.getUser();

  if (!user) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  let payload: { acao?: string; user_product_id?: string; mudancas?: Mudancas } = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  if (!payload.user_product_id || (payload.acao !== 'ler' && payload.acao !== 'salvar')) {
    return json({ error: 'Pedido incompleto.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: anuncio } = await admin
    .from('user_products')
    .select('id, user_id, ml_item_id')
    .eq('id', payload.user_product_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!anuncio?.ml_item_id) {
    return json({ error: 'Anúncio não encontrado na sua conta.' }, 404);
  }

  const { data: conexao } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!conexao) {
    return json({ error: 'Conecte sua conta do Mercado Livre em Integrações.' }, 409);
  }

  const token = await obterAccessToken(admin, conexao);
  if (!token.ok) {
    return json({ error: 'Sua conexão com o Mercado Livre expirou. Reconecte em Integrações.' }, 409);
  }

  const itemId = encodeURIComponent(anuncio.ml_item_id);
  const cabecalhos = {
    Authorization: `Bearer ${token.accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const lerItem = async () => {
    const resposta = await fetch(`https://api.mercadolibre.com/items/${itemId}`, { headers: cabecalhos });
    if (!resposta.ok) return null;
    return (await resposta.json()) as Record<string, unknown>;
  };

  const item = await lerItem();
  if (!item) {
    return json({ error: 'Não foi possível ler o anúncio no Mercado Livre agora. Tente em instantes.' }, 502);
  }

  const fotosDoItem = (Array.isArray(item.pictures) ? item.pictures : []) as Array<Record<string, unknown>>;
  const enderecoDaFoto = (foto: Record<string, unknown>) => String(foto.secure_url ?? foto.url ?? '');
  const vendas = Number(item.sold_quantity ?? 0);

  // ------------------------------------------------------------------ ler
  if (payload.acao === 'ler') {
    const [descricao, visitas] = await Promise.all([
      fetch(`https://api.mercadolibre.com/items/${itemId}/description`, { headers: cabecalhos })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`https://api.mercadolibre.com/items/${itemId}/visits/time_window?last=30&unit=day`, {
        headers: cabecalhos,
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);

    return json({
      anuncio: {
        titulo: String(item.title ?? ''),
        preco: Number(item.price ?? 0),
        descricao: String(descricao?.plain_text ?? ''),
        status: String(item.status ?? ''),
        vendas,
        visitas: visitas?.total_visits ?? null,
        fotos: fotosDoItem.map(enderecoDaFoto).filter(Boolean),
      },
    });
  }

  // --------------------------------------------------------------- salvar
  const mudancas = payload.mudancas ?? {};
  const corpo: Record<string, unknown> = {};

  if (typeof mudancas.preco === 'number') {
    if (!(mudancas.preco > 0)) {
      return json({ error: 'Informe um preço maior que zero.' }, 400);
    }

    const preco = Math.round(mudancas.preco * 100) / 100;
    const variacoes = (Array.isArray(item.variations) ? item.variations : []) as Array<Record<string, unknown>>;

    // Com variações, o preço mora em cada uma: mandar só no anúncio é recusado.
    if (variacoes.length > 0) {
      corpo.variations = variacoes.map((variacao) => ({ id: variacao.id, price: preco }));
    } else {
      corpo.price = preco;
    }
  }

  if (typeof mudancas.titulo === 'string' && mudancas.titulo.trim()) {
    if (vendas > 0) {
      return json({ error: 'O Mercado Livre não deixa mudar o título de um anúncio que já vendeu.' }, 409);
    }
    corpo.title = mudancas.titulo.trim().slice(0, 60);
  }

  if (mudancas.status === 'active' || mudancas.status === 'paused') {
    corpo.status = mudancas.status;
  }

  if (Array.isArray(mudancas.fotos)) {
    const urls = [...new Set(mudancas.fotos.map((url) => String(url || '').trim()).filter(Boolean))].slice(0, 10);

    if (urls.length === 0) {
      return json({ error: 'O anúncio precisa de pelo menos uma foto.' }, 400);
    }

    // Foto que já estava no anúncio vai pelo id dela: o Mercado Livre não
    // baixa de novo e não perde o processamento que já fez. Foto nova vai pelo
    // endereço, e ele baixa.
    const idPorEndereco = new Map(fotosDoItem.map((foto) => [enderecoDaFoto(foto), String(foto.id ?? '')]));
    corpo.pictures = urls.map((url) => (idPorEndereco.get(url) ? { id: idPorEndereco.get(url) } : { source: url }));
  }

  if (Object.keys(corpo).length > 0) {
    const resposta = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      method: 'PUT',
      headers: cabecalhos,
      body: JSON.stringify(corpo),
    });

    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => null);

      await admin.from('log_integracao_ml').insert({
        contexto: 'ml-editar-anuncio',
        mensagem: `Alteração recusada no anúncio ${anuncio.ml_item_id}`,
        detalhes: { enviado: corpo, resposta: erro, status: resposta.status },
      });

      return json({ error: traduzirRecusa(erro, resposta.status) }, 422);
    }
  }

  if (typeof mudancas.descricao === 'string') {
    const resposta = await fetch(`https://api.mercadolibre.com/items/${itemId}/description?api_version=2`, {
      method: 'PUT',
      headers: cabecalhos,
      body: JSON.stringify({ plain_text: limparParaTextoPuro(mudancas.descricao) }),
    });

    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => null);

      await admin.from('log_integracao_ml').insert({
        contexto: 'ml-editar-anuncio',
        mensagem: `Descrição recusada no anúncio ${anuncio.ml_item_id}`,
        detalhes: { resposta: erro, status: resposta.status },
      });

      // O resto já foi salvo. Dizer isso evita que o vendedor refaça tudo.
      return json(
        {
          error:
            Object.keys(corpo).length > 0
              ? `O resto foi salvo, mas a descrição não: ${traduzirRecusa(erro, resposta.status)}`
              : traduzirRecusa(erro, resposta.status),
        },
        422
      );
    }
  }

  // A cópia do FORNEXA acompanha o que o Mercado Livre aceitou. Falhar aqui
  // não desfaz nada lá: o anúncio já está certo, só a lista fica atrasada até
  // a próxima leitura.
  const copia: Record<string, unknown> = {};

  if (typeof corpo.price === 'number' || corpo.variations) {
    copia.sale_price = mudancas.preco;
    copia.announcement_price = mudancas.preco;
    if (typeof mudancas.margem === 'number') copia.margin = mudancas.margem;
  }
  if (typeof corpo.title === 'string') copia.announcement_title = corpo.title;
  if (typeof mudancas.descricao === 'string') copia.announcement_description = mudancas.descricao;
  if (Array.isArray(mudancas.fotos) && mudancas.fotos[0]) {
    copia.image_url = mudancas.fotos[0];
    copia.announcement_image_url = mudancas.fotos[0];
  }
  // `status` da tabela não aceita 'paused'; a pausa do vendedor tem coluna
  // própria (migração 20261103120000).
  if (corpo.status) copia.pausado_pelo_vendedor = corpo.status === 'paused';

  if (Object.keys(copia).length > 0) {
    const { error } = await admin.from('user_products').update(copia).eq('id', anuncio.id);

    if (error) {
      await admin.from('log_integracao_ml').insert({
        contexto: 'ml-editar-anuncio',
        mensagem: `Anúncio ${anuncio.ml_item_id} alterado no ML, mas a cópia local não atualizou`,
        detalhes: { erro: error.message, copia },
      });
    }
  }

  return json({ ok: true });
});
