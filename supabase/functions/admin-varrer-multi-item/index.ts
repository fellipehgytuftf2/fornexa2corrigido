// ============================================================================
// admin-varrer-multi-item
//
// Quantas vendas têm mais de um produto, e quantos desses produtos nunca
// viraram pedido aqui.
//
// POR QUE
//
// O FORNEXA cria UM pedido por venda, lendo só `order_items[0]`. Se uma venda
// tiver dois produtos diferentes, o segundo não existe aqui: não aparece para
// o vendedor, não aparece para o fornecedor, e ninguém reclama de um pedido
// que nunca viu. É o tipo de defeito que não chega pelo suporte.
//
// Corrigir isso significa mexer em como todo pedido nasce — a parte mais
// delicada do sistema. Antes de encostar ali, esta varredura responde se o
// caso acontece uma vez por ano ou toda semana.
//
// SÓ LÊ
//
// Não cria pedido nenhum. Lista o que achou e para.
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

  const { data: perfil } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();

  if (perfil?.role !== 'admin') {
    return json({ error: 'Apenas administradores.' }, 403);
  }

  let payload: { email?: string; quantas?: number } = {};

  try {
    payload = await req.json();
  } catch {
    // Sem corpo: varre a conta de quem chamou.
  }

  // Teto de 50: é o máximo que o Mercado Livre devolve por página, e uma
  // página já responde a pergunta. Varrer tudo custaria dezenas de chamadas
  // por vendedor sem mudar a conclusão.
  const quantas = Math.min(Math.max(Number(payload.quantas ?? 50), 1), 50);

  let donoDaConexao = caller.id;

  if (payload.email) {
    const { data: encontrado } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', payload.email.trim())
      .maybeSingle();

    if (!encontrado) {
      return json({ error: 'Nenhuma conta com esse e-mail.' }, 404);
    }

    donoDaConexao = encontrado.id;
  }

  const { data: conexao } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status, external_account_id')
    .eq('user_id', donoDaConexao)
    .maybeSingle();

  if (!conexao) {
    return json({ error: 'Esta conta não tem conexão com o Mercado Livre.' }, 409);
  }

  const token = await obterAccessToken(admin, conexao);

  if (!token.ok) {
    return json({ error: 'A conexão desta conta expirou. Ela precisa reconectar.' }, 409);
  }

  const busca = await fetch(
    `https://api.mercadolibre.com/orders/search?seller=${encodeURIComponent(
      String(conexao.external_account_id)
    )}&sort=date_desc&limit=${quantas}`,
    { headers: { Authorization: `Bearer ${token.accessToken}` } }
  );

  if (!busca.ok) {
    return json(
      { error: `O Mercado Livre respondeu ${busca.status} ao listar as vendas.` },
      502
    );
  }

  const resultado = await busca.json().catch(() => null);
  const vendas = Array.isArray(resultado?.results) ? resultado.results : [];

  const comMaisDeUmItem: Array<Record<string, unknown>> = [];
  let itensPerdidos = 0;

  for (const venda of vendas) {
    const itens = Array.isArray(venda?.order_items) ? venda.order_items : [];

    if (itens.length < 2) continue;

    const numero = String(venda?.id ?? '');

    // Quantos pedidos desta venda existem aqui. Um só, com a venda tendo dois
    // itens, é exatamente o item perdido.
    const { data: pedidosDaVenda } = await admin
      .from('orders')
      .select('id, product_name, user_product_id, product_id')
      .eq('ml_order_id', numero);

    const aqui = pedidosDaVenda ?? [];
    const faltam = Math.max(itens.length - aqui.length, 0);

    itensPerdidos += faltam;

    comMaisDeUmItem.push({
      venda: numero,
      data: venda?.date_created ?? null,
      status: venda?.status ?? null,
      itens_na_venda: itens.length,
      pedidos_aqui: aqui.length,
      faltam,
      produtos: itens.map((item: Record<string, unknown>) => {
        const dados = item?.item as Record<string, unknown> | undefined;
        return dados?.title ?? null;
      }),
    });
  }

  const conclusao =
    comMaisDeUmItem.length === 0
      ? `Nenhuma das ${vendas.length} vendas mais recentes tem mais de um produto. O defeito existe no código, mas não está acontecendo nesta conta.`
      : `${comMaisDeUmItem.length} das ${vendas.length} vendas mais recentes têm mais de um produto, e ${itensPerdidos} produto(s) não viraram pedido no FORNEXA.`;

  await admin.from('log_integracao_ml').insert({
    contexto: 'varredura-multi-item',
    mensagem: conclusao,
    detalhes: {
      conta_ml: conexao.external_account_id,
      vendas_olhadas: vendas.length,
      vendas: comMaisDeUmItem,
    },
  });

  return json({
    ok: true,
    vendas_olhadas: vendas.length,
    conclusao,
    itens_perdidos: itensPerdidos,
    vendas: comMaisDeUmItem,
  });
});
