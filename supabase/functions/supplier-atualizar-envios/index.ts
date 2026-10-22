// ============================================================================
// supplier-atualizar-envios
//
// Pergunta ao Mercado Livre em que pé estão os envios do fornecedor, e guarda
// a resposta em cada pedido.
//
// POR QUE EXISTE
//
// O cartão do Portal dizia "Pronto para despachar" e a recusa só aparecia
// depois do clique em Baixar etiqueta — DC-e faltando, envio em janela de
// coleta. O substatus era gravado só quando o vendedor sincronizava ou quando
// alguém pedia a etiqueta, e nenhuma das duas acontece antes de o fornecedor
// correr a lista de manhã.
//
// Um selo que às vezes mente vale menos que selo nenhum: o fornecedor volta a
// clicar em todos, que é justamente o que ele queria parar de fazer.
//
// O CUSTO, E O QUE O SEGURA
//
// É uma chamada ao Mercado Livre por pedido — não há endpoint que aceite uma
// lista de envios. Por isso três limites:
//
//   1. só pedidos que ainda não saíram (o resto não muda mais)
//   2. só os que não foram consultados nos últimos minutos
//   3. um teto por chamada, para uma conta com cem pedidos não virar cem
//      chamadas de uma vez
//
// O token é o do VENDEDOR dono de cada pedido, como em toda função que fala
// pelo fornecedor. Um fornecedor atende vários vendedores, então os pedidos são
// agrupados por dono e cada grupo usa o seu.
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

/** Quantos envios por chamada. */
const TETO = 30;

/** Consultado há menos que isto, não pergunta de novo. */
const MINUTOS_DE_VALIDADE = 10;

/**
 * Status internos que ainda podem mudar do lado do Mercado Livre.
 *
 * Depois de enviado, o substatus deixa de decidir alguma coisa — a etiqueta já
 * foi impressa e a caixa saiu.
 */
const ANDANDO = ['pending', 'sent_to_supplier', 'separating'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
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
    data: { user: caller },
  } = await createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  }).auth.getUser();

  if (!caller) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: fornecedor } = await admin
    .from('suppliers')
    .select('id')
    .eq('auth_user_id', caller.id)
    .maybeSingle();

  if (!fornecedor) {
    return json({ error: 'Apenas fornecedores usam esta função.' }, 403);
  }

  const limite = new Date(Date.now() - MINUTOS_DE_VALIDADE * 60000).toISOString();

  const { data: pedidos } = await admin
    .from('orders')
    .select('id, user_id, ml_shipment_id, ml_shipment_visto_em')
    .eq('supplier_id', fornecedor.id)
    .not('ml_shipment_id', 'is', null)
    .in('status', ANDANDO)
    .or(`ml_shipment_visto_em.is.null,ml_shipment_visto_em.lt.${limite}`)
    .order('created_at', { ascending: false })
    .limit(TETO);

  if (!pedidos || pedidos.length === 0) {
    return json({ ok: true, conferidos: 0 });
  }

  // Um token por vendedor, e não por pedido: dez pedidos do mesmo vendedor
  // renovariam o mesmo token dez vezes.
  const tokens = new Map<string, string | null>();

  const tokenDoVendedor = async (userId: string) => {
    if (tokens.has(userId)) return tokens.get(userId) ?? null;

    const { data: conexao } = await admin
      .from('ml_connections')
      .select('id, user_id, access_token, refresh_token, expires_at, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (!conexao) {
      tokens.set(userId, null);
      return null;
    }

    const token = await obterAccessToken(admin, conexao);
    const valor = token.ok ? token.accessToken : null;

    tokens.set(userId, valor);
    return valor;
  };

  let conferidos = 0;

  for (const pedido of pedidos) {
    const accessToken = await tokenDoVendedor(pedido.user_id as string);

    if (!accessToken) continue;

    try {
      const resposta = await fetch(
        `https://api.mercadolibre.com/shipments/${encodeURIComponent(
          pedido.ml_shipment_id as string
        )}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!resposta.ok) continue;

      const envio = (await resposta.json()) as Record<string, unknown>;

      // Quando o Mercado Livre solta um envio que está segurando. Sem esta
      // data o cartão dizia "segurando" e o fornecedor voltava de hora em
      // hora para descobrir se já tinha soltado.
      const buffering = envio?.buffering as Record<string, unknown> | null | undefined;
      const liberaEm = typeof buffering?.date === 'string' ? buffering.date : null;

      await admin
        .from('orders')
        .update({
          ml_shipment_substatus: envio?.substatus ? String(envio.substatus) : null,
          ml_shipment_visto_em: new Date().toISOString(),
          ml_liberacao_em: liberaEm,
        })
        .eq('id', pedido.id);

      conferidos += 1;
    } catch (erro) {
      // Um envio que falha não pode derrubar a conferência dos outros: a lista
      // inteira ficaria desatualizada por causa de um pedido.
      console.error('Falha ao conferir envio:', pedido.id, erro);
    }
  }

  return json({ ok: true, conferidos });
});
