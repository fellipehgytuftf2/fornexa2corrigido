// ============================================================================
// ml-custo-de-envio
//
// Quanto o Mercado Livre vai descontar de envio NESTE produto, NESTE preço,
// para ESTE vendedor.
//
// POR QUE
//
// Pela regra do Mercado Livre (Central de Ajuda, "Custos dos Envios"), o custo
// de envio é cobrado em TODA venda feita por Coleta, Agência ou Full — mesmo
// quando o comprador paga o frete. Depende do peso e das medidas da embalagem,
// do preço e da reputação do vendedor. A FORNEXA supunha frete zero abaixo de
// R$ 79 para quem não tinha frete grátis ligado, e isso nunca foi verdade.
//
// O próprio Mercado Livre responde o valor em
//   /users/{id}/shipping_options/free
// (developers.mercadolivre.com.br/pt_br/custos-de-envio), já com a reputação
// do vendedor. As medidas saem do catálogo, as mesmas que vão no anúncio.
//
// Devolve duas respostas: o custo normal e o custo com "frete grátis rápido"
// ligado. Abaixo de R$ 79 o segundo é opcional e bem mais caro — é o que fez
// produto de R$ 16 pagar R$ 12,95 de frete.
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

/** "5_green" -> "green". */
function corDaReputacao(levelId: unknown): string | null {
  const texto = String(levelId ?? '');
  const cor = texto.split('_').slice(1).join('_');
  return cor || null;
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

  let payload: { preco?: number; catalog_product_id?: string; tipo?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const preco = Number(payload.preco ?? 0);
  if (!(preco > 0)) return json({ error: 'Informe o preço.' }, 400);
  if (!payload.catalog_product_id) return json({ error: 'Informe o produto.' }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: produto } = await admin
    .from('catalog_products')
    .select('altura_cm, largura_cm, comprimento_cm, peso_g')
    .eq('id', payload.catalog_product_id)
    .maybeSingle();

  const altura = Number(produto?.altura_cm ?? 0);
  const largura = Number(produto?.largura_cm ?? 0);
  const comprimento = Number(produto?.comprimento_cm ?? 0);
  const peso = Number(produto?.peso_g ?? 0);

  if (!(altura > 0 && largura > 0 && comprimento > 0 && peso > 0)) {
    return json({ error: 'Este produto ainda não tem medidas no catálogo.', sem_medidas: true }, 409);
  }

  const { data: conexao } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status, external_account_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!conexao?.external_account_id) {
    return json({ error: 'Conecte sua conta do Mercado Livre para ver o frete exato.' }, 409);
  }

  const token = await obterAccessToken(admin, conexao);
  if (!token.ok) return json({ error: 'Sua conexão com o Mercado Livre expirou.' }, 409);

  const mlUserId = String(conexao.external_account_id);
  const tipo = payload.tipo === 'gold_pro' ? 'gold_pro' : 'gold_special';
  const cabecalho = { Authorization: `Bearer ${token.accessToken}` };

  const perguntar = async (freteGratis: boolean) => {
    const endereco = new URL(`https://api.mercadolibre.com/users/${mlUserId}/shipping_options/free`);
    endereco.searchParams.set('dimensions', `${altura}x${largura}x${comprimento},${Math.round(peso)}`);
    endereco.searchParams.set('item_price', String(preco));
    endereco.searchParams.set('listing_type_id', tipo);
    endereco.searchParams.set('mode', 'me2');
    endereco.searchParams.set('condition', 'new');
    endereco.searchParams.set('logistic_type', 'drop_off');
    endereco.searchParams.set('verbose', 'true');
    endereco.searchParams.set('free_shipping', freteGratis ? 'true' : 'false');

    const resposta = await fetch(endereco.toString(), { headers: cabecalho });
    if (!resposta.ok) return null;

    const dados = await resposta.json().catch(() => null);
    const custo = Number(dados?.coverage?.all_country?.list_cost);
    return Number.isFinite(custo) ? custo : null;
  };

  const [normal, comFreteGratisRapido, usuario] = await Promise.all([
    perguntar(preco >= 79),
    preco < 79 ? perguntar(true) : Promise.resolve(null),
    fetch(`https://api.mercadolibre.com/users/${mlUserId}`, { headers: cabecalho })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);

  if (normal === null) {
    return json({ error: 'O Mercado Livre não respondeu o custo de envio.' }, 502);
  }

  return json({
    ok: true,
    preco,
    custo_envio: normal,
    custo_frete_gratis_rapido: comFreteGratisRapido,
    reputacao: corDaReputacao(usuario?.seller_reputation?.level_id),
  });
});
