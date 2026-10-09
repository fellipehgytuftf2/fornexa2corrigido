// ============================================================================
// ml-taxa-do-anuncio
//
// A comissão exata que o Mercado Livre vai cobrar neste preço.
//
// POR QUE
//
// A tela de publicar estimava: primeiro 12% fixo, depois faixas medidas das
// vendas reais. Estimativa serve quando não há resposta melhor — e aqui há. O
// Mercado Livre responde o valor exato por preço e tipo de anúncio em
// `/sites/MLB/listing_prices`, e isso acaba com o chute.
//
// POR QUE NÃO CHAMAR DIRETO DO NAVEGADOR
//
// O endereço parece público e não é: sem token responde 403 do PolicyAgent.
// Então a pergunta passa por aqui, com o token do próprio vendedor, que é
// quem vai pagar a comissão.
//
// O QUE ELA NÃO RESPONDE
//
// O frete. Ele depende de peso, dimensões e região do comprador, e nada disso
// existe antes da venda. Continua valendo a mediana medida, e só para quem
// banca frete grátis.
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

  let payload: { preco?: number; categoria?: string } = {};

  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const preco = Number(payload.preco ?? 0);

  if (!(preco > 0)) {
    return json({ error: 'Informe o preço.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: conexao } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!conexao) {
    return json({ error: 'Conecte sua conta do Mercado Livre para ver a taxa exata.' }, 409);
  }

  const token = await obterAccessToken(admin, conexao);

  if (!token.ok) {
    return json({ error: 'Sua conexão com o Mercado Livre expirou.' }, 409);
  }

  // A categoria refina a resposta: a comissão muda entre categorias. Sem ela,
  // o Mercado Livre devolve a tabela geral do site — melhor que estimativa
  // nossa, pior que o número da categoria certa.
  const endereco = new URL('https://api.mercadolibre.com/sites/MLB/listing_prices');
  endereco.searchParams.set('price', String(preco));

  if (payload.categoria) {
    endereco.searchParams.set('category_id', payload.categoria);
  }

  const resposta = await fetch(endereco.toString(), {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });

  const texto = await resposta.text();

  if (!resposta.ok) {
    return json(
      { error: `O Mercado Livre respondeu ${resposta.status}.`, corpo: texto.slice(0, 300) },
      502
    );
  }

  let lista: Array<Record<string, unknown>> = [];

  try {
    const lido = JSON.parse(texto);
    lista = Array.isArray(lido) ? lido : [lido];
  } catch {
    return json({ error: 'Resposta ilegível do Mercado Livre.' }, 502);
  }

  const tipos = lista
    .map((item) => ({
      listing_type_id: String(item?.listing_type_id ?? ''),
      nome: String(item?.listing_type_name ?? ''),
      taxa: Number(item?.sale_fee_amount ?? 0),
      detalhes: item?.sale_fee_details ?? null,
    }))
    .filter((item) => item.listing_type_id);

  return json({ ok: true, preco, tipos });
});
