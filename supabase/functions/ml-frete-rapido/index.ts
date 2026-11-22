// ============================================================================
// ml-frete-rapido
//
// Liga ou desliga o frete grátis RÁPIDO de um anúncio abaixo de R$ 79.
//
// POR QUE
//
// Pela regra do Mercado Livre, abaixo de R$ 79 o frete grátis rápido é
// opcional e quem paga é o vendedor, pela tarifa da faixa de R$ 79 (R$ 12,95
// ou mais). A publicação não dizia nada sobre frete, então o anúncio herdava
// a preferência da conta: 123 vendas de produto barato pagaram R$ 12,90 ou
// mais de frete assim (uma de R$ 16,55 pagou R$ 12,95).
//
// A calculadora mostra o frete rápido desligado por padrão. Logo depois de
// publicar, a tela chama esta função para deixar o anúncio igual ao que o
// vendedor viu. Fica separada da `ml-publish-product` de propósito: é uma
// mudança pequena que não pode arriscar a publicação.
//
// Só mexe em anúncio do próprio vendedor e só abaixo de R$ 79 — a partir daí
// o frete grátis é obrigatório e não se desliga.
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
  if (!authHeader) return json({ error: 'Faça login novamente.' }, 401);

  const {
    data: { user },
  } = await createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  }).auth.getUser();

  if (!user) return json({ error: 'Faça login novamente.' }, 401);

  let payload: { item_id?: string; ligado?: boolean } = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const itemId = String(payload.item_id ?? '').trim();
  if (!/^MLB\d+$/.test(itemId)) return json({ error: 'Anúncio inválido.' }, 400);
  const ligado = payload.ligado === true;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: conexao } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status, external_account_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!conexao?.external_account_id) return json({ error: 'Mercado Livre não conectado.' }, 409);

  const token = await obterAccessToken(admin, conexao);
  if (!token.ok) return json({ error: 'Sua conexão com o Mercado Livre expirou.' }, 409);

  const cabecalho = {
    Authorization: `Bearer ${token.accessToken}`,
    'Content-Type': 'application/json',
  };

  const respostaItem = await fetch(`https://api.mercadolibre.com/items/${itemId}`, { headers: cabecalho });
  const item = await respostaItem.json().catch(() => null);

  if (!respostaItem.ok || !item) return json({ error: 'Anúncio não encontrado.' }, 404);

  // Só o dono mexe.
  if (String(item.seller_id) !== String(conexao.external_account_id)) {
    return json({ error: 'Este anúncio não é seu.' }, 403);
  }

  if (Number(item.price) >= 79) {
    return json({ ok: true, ignorado: 'A partir de R$ 79 o frete grátis é obrigatório.' });
  }

  if (Boolean(item.shipping?.free_shipping) === ligado) {
    return json({ ok: true, ja_estava: true, frete_gratis_rapido: ligado });
  }

  const resposta = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
    method: 'PUT',
    headers: cabecalho,
    body: JSON.stringify({ shipping: { free_shipping: ligado } }),
  });

  const corpo = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    await admin.from('log_integracao_ml').insert({
      contexto: 'ml-frete-rapido',
      mensagem: 'Mercado Livre recusou mudar o frete grátis rápido',
      detalhes: { item_id: itemId, ligado, status: resposta.status, resposta: corpo },
    });

    return json({ error: 'O Mercado Livre não aceitou a mudança.', detalhes: corpo }, 502);
  }

  return json({ ok: true, frete_gratis_rapido: Boolean(corpo?.shipping?.free_shipping) });
});
