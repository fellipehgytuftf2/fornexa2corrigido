// ============================================================================
// ml-pausar-sem-estoque
//
// Pausa no Mercado Livre o anúncio de produto que o fornecedor não tem, e
// reativa quando o estoque volta.
//
// POR QUE EXISTE
//
// Esconder o produto zerado do catálogo protege quem ainda vai publicar. Quem
// já publicou continua vendendo o que não existe — 1693 anúncios no dia em que
// o controle de estoque da MS Digital foi ligado. O comprador descobre, e a
// punição do marketplace cai sobre o vendedor.
//
// QUEM CHAMA
//
// Quem tiver a senha de `segredos_internos`, no cabeçalho `x-segredo`. Não há
// login de usuário.
//
// O QUE ELA NUNCA FAZ
//
// Reativar anúncio que ela não pausou. A marca `pausado_sem_estoque_em` separa
// a pausa do FORNEXA da pausa do vendedor.
//
// O CUSTO
//
// Uma chamada ao Mercado Livre por anúncio — não há endpoint em lote. Um teto
// por rodada segura a primeira passada, que pega o acumulado de uma vez.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chaveSecreta, urlDoProjeto } from '../_shared/chaves.ts';
import { obterAccessToken } from '../_shared/tokenMercadoLivre.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Anúncios pausados por rodada. */
const TETO_PAUSAR = 150;

/** Anúncios reativados por rodada. */
const TETO_REATIVAR = 100;

interface Anuncio {
  id: string;
  user_id: string;
  ml_item_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = urlDoProjeto();
  const serviceRoleKey = chaveSecreta();

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Função mal configurada no servidor.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: segredo } = await admin
    .from('segredos_internos')
    .select('valor')
    .eq('nome', 'pausar-sem-estoque')
    .maybeSingle();

  const recebido = req.headers.get('x-segredo');

  if (!segredo?.valor || !recebido || recebido !== segredo.valor) {
    return json({ error: 'Não autorizado.' }, 401);
  }

  // Um token por vendedor: cem anúncios do mesmo vendedor renovariam o mesmo
  // token cem vezes — e o refresh token do Mercado Livre vale uma vez só.
  const tokens = new Map<string, string | null>();

  const tokenDoVendedor = async (userId: string) => {
    if (tokens.has(userId)) return tokens.get(userId) ?? null;

    const { data: conexao } = await admin
      .from('ml_connections')
      .select('id, user_id, access_token, refresh_token, expires_at, status')
      .eq('user_id', userId)
      .maybeSingle();

    const resultado = conexao ? await obterAccessToken(admin, conexao) : null;
    const token = resultado?.ok ? resultado.accessToken : null;

    tokens.set(userId, token);
    return token;
  };

  const mudarStatus = async (anuncio: Anuncio, status: 'paused' | 'active') => {
    const accessToken = await tokenDoVendedor(anuncio.user_id);

    if (!accessToken) {
      return { ok: false, falha: 'Conta do Mercado Livre desconectada.' };
    }

    try {
      const resposta = await fetch(
        `https://api.mercadolibre.com/items/${encodeURIComponent(anuncio.ml_item_id)}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ status }),
        }
      );

      if (resposta.ok) {
        return { ok: true, falha: null };
      }

      const corpo = await resposta.text().catch(() => '');
      return { ok: false, falha: `${resposta.status}: ${corpo.slice(0, 500)}` };
    } catch (erro) {
      return { ok: false, falha: String(erro).slice(0, 500) };
    }
  };

  const agora = () => new Date().toISOString();

  let pausados = 0;
  let reativados = 0;
  let falhas = 0;

  const { data: paraPausar, error: erroPausar } = await admin.rpc('anuncios_para_pausar', {
    p_limite: TETO_PAUSAR,
  });

  if (erroPausar) {
    return json({ error: erroPausar.message }, 500);
  }

  for (const anuncio of (paraPausar ?? []) as Anuncio[]) {
    const { ok, falha } = await mudarStatus(anuncio, 'paused');

    if (ok) {
      pausados += 1;
      await admin
        .from('user_products')
        .update({
          status: 'paused',
          pausado_sem_estoque_em: agora(),
          pausa_tentada_em: null,
          pausa_falha: null,
        })
        .eq('id', anuncio.id);
    } else {
      falhas += 1;
      await admin
        .from('user_products')
        .update({ pausa_tentada_em: agora(), pausa_falha: falha })
        .eq('id', anuncio.id);
    }
  }

  const { data: paraReativar, error: erroReativar } = await admin.rpc(
    'anuncios_para_reativar',
    { p_limite: TETO_REATIVAR }
  );

  if (erroReativar) {
    return json({ error: erroReativar.message, pausados, falhas }, 500);
  }

  for (const anuncio of (paraReativar ?? []) as Anuncio[]) {
    const { ok, falha } = await mudarStatus(anuncio, 'active');

    if (ok) {
      reativados += 1;
      await admin
        .from('user_products')
        .update({
          status: 'active',
          pausado_sem_estoque_em: null,
          pausa_tentada_em: null,
          pausa_falha: null,
        })
        .eq('id', anuncio.id);
    } else {
      falhas += 1;
      await admin
        .from('user_products')
        .update({ pausa_tentada_em: agora(), pausa_falha: falha })
        .eq('id', anuncio.id);
    }
  }

  if (pausados || reativados || falhas) {
    await admin.from('log_integracao_ml').insert({
      contexto: 'pausar-sem-estoque',
      mensagem: `Pausados ${pausados}, reativados ${reativados}, falhas ${falhas}`,
      detalhes: { pausados, reativados, falhas },
    });
  }

  return json({ ok: true, pausados, reativados, falhas });
});
