// ============================================================================
// admin-sondar-venda
//
// Pergunta ao Mercado Livre o que uma venda tem, e compara com o que existe
// aqui.
//
// POR QUE
//
// "O pedido do vendedor não aparece no painel" tem três causas possíveis, e
// elas pedem conserto diferente: o pedido existe e está escondido por filtro,
// o pedido existe noutro estado, ou o pedido nunca foi criado. Sem olhar a
// venda do lado do Mercado Livre, as três se parecem.
//
// A suspeita que motivou isto: o FORNEXA cria UM pedido por venda, lendo só o
// primeiro item (`order_items[0]`). Venda com dois produtos diferentes perde o
// segundo — ele não aparece para o vendedor nem para o fornecedor, porque não
// existe. Esta sonda prova ou derruba isso em cada caso real.
//
// SÓ LÊ
//
// Não cria pedido, não corrige nada. Responde o que viu.
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

  let payload: { venda?: string } = {};

  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  // Aceita o número cru ou colado com espaços, que é como ele sai da tela do
  // Mercado Livre e do print do vendedor.
  const numeroDaVenda = String(payload.venda ?? '').replace(/\D/g, '');

  if (!numeroDaVenda) {
    return json({ error: 'Informe o número da venda no Mercado Livre.' }, 400);
  }

  // De quem é a conexão a usar.
  //
  // A venda pertence a um vendedor, e o token dele é o único que o Mercado
  // Livre aceita para ler aquela venda. Começamos pelo pedido que já existe
  // aqui; não existindo, não há como saber de quem é — e é justamente esse o
  // caso interessante, então pedimos o e-mail.
  // Duas consultas, e não uma com junção.
  //
  // `orders` aponta para `user_products` por dois caminhos — `user_product_id`
  // e `product_id` —, e pedir o anúncio junto deixa a consulta ambígua: ela
  // falha, volta vazia, e a sonda concluía "esta venda nunca entrou" para
  // pedidos que existem. Foi o que aconteceu nas duas primeiras consultas
  // reais.
  const { data: pedidosDaVenda, error: erroDosPedidos } = await admin
    .from('orders')
    .select(
      'id, user_id, product_name, status, ml_order_status, tracking_code, created_at, user_product_id, product_id'
    )
    .eq('ml_order_id', numeroDaVenda);

  if (erroDosPedidos) {
    return json({ error: `Falha ao consultar os pedidos: ${erroDosPedidos.message}` }, 500);
  }

  type PedidoDaVenda = {
    id: string;
    user_id: string;
    product_name: string | null;
    status: string | null;
    ml_order_status: string | null;
    tracking_code: string | null;
    created_at: string | null;
    user_product_id: string | null;
    product_id: string | null;
  };

  const conhecidos = (pedidosDaVenda ?? []) as PedidoDaVenda[];

  // O anúncio de cada pedido, buscado à parte. `product_id` é o caminho antigo
  // e continua preenchido em pedidos velhos.
  const idsDeAnuncio = [
    ...new Set(
      conhecidos
        .map((pedido) => pedido.user_product_id ?? pedido.product_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const { data: anuncios } = idsDeAnuncio.length
    ? await admin.from('user_products').select('id, ml_item_id').in('id', idsDeAnuncio)
    : { data: [] as { id: string; ml_item_id: string | null }[] };

  const anuncioPorProduto = new Map(
    ((anuncios ?? []) as { id: string; ml_item_id: string | null }[]).map((linha) => [
      linha.id,
      linha.ml_item_id,
    ])
  );

  const anuncioDoPedido = (pedido: PedidoDaVenda) =>
    anuncioPorProduto.get(pedido.user_product_id ?? pedido.product_id ?? '') ?? null;

  if (conhecidos.length === 0) {
    return json({
      ok: true,
      venda: numeroDaVenda,
      conclusao:
        'Nenhum pedido com este número existe no FORNEXA. A venda nunca entrou, ou entrou com outro número.',
      pedidos_aqui: [],
      itens_do_mercado_livre: null,
    });
  }

  const { data: conexao } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status')
    .eq('user_id', conhecidos[0].user_id)
    .maybeSingle();

  if (!conexao) {
    return json({
      ok: true,
      venda: numeroDaVenda,
      conclusao: 'O vendedor desta venda não tem conexão com o Mercado Livre para consultar.',
      pedidos_aqui: conhecidos,
      itens_do_mercado_livre: null,
    });
  }

  const token = await obterAccessToken(admin, conexao);

  if (!token.ok) {
    return json({
      ok: true,
      venda: numeroDaVenda,
      conclusao: 'A conexão do vendedor expirou; ele precisa reconectar para eu poder consultar.',
      pedidos_aqui: conhecidos,
      itens_do_mercado_livre: null,
    });
  }

  const resposta = await fetch(`https://api.mercadolibre.com/orders/${numeroDaVenda}`, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });

  const texto = await resposta.text();

  let venda: Record<string, unknown> | null = null;
  try {
    venda = JSON.parse(texto);
  } catch {
    venda = null;
  }

  if (!resposta.ok || !venda) {
    return json({
      ok: false,
      venda: numeroDaVenda,
      conclusao: `O Mercado Livre respondeu ${resposta.status} ao consultar esta venda.`,
      resposta_crua: texto.slice(0, 400),
      pedidos_aqui: conhecidos,
    });
  }

  const itens = Array.isArray(venda.order_items) ? venda.order_items : [];

  const itensLidos = itens.map((item: Record<string, unknown>) => {
    const dados = item?.item as Record<string, unknown> | undefined;
    const idDoAnuncio = dados?.id ? String(dados.id) : null;

    return {
      anuncio: idDoAnuncio,
      titulo: dados?.title ?? null,
      quantidade: item?.quantity ?? null,
      preco: item?.unit_price ?? null,
      // O pedido correspondente aqui, quando existe. É esta coluna que mostra
      // o item perdido: anúncio que a venda tem e o FORNEXA não.
      virou_pedido: conhecidos.some((p) => {
        const anuncio = anuncioDoPedido(p);
        return Boolean(anuncio) && anuncio === idDoAnuncio;
      }),
    };
  });

  const perdidos = itensLidos.filter((item) => !item.virou_pedido);

  const envio = venda.shipping as Record<string, unknown> | undefined;

  const conclusao =
    perdidos.length > 0
      ? `A venda tem ${itensLidos.length} item(ns) e ${perdidos.length} deles não virou pedido no FORNEXA. É o caso do item perdido.`
      : `Todos os ${itensLidos.length} item(ns) desta venda existem como pedido aqui.`;

  await admin.from('log_integracao_ml').insert({
    contexto: 'sonda-venda',
    mensagem: conclusao,
    detalhes: {
      venda: numeroDaVenda,
      status_no_ml: venda.status ?? null,
      itens: itensLidos,
      pedidos_aqui: conhecidos,
    },
  });

  return json({
    ok: true,
    venda: numeroDaVenda,
    conclusao,
    status_no_ml: venda.status ?? null,
    status_detalhe: venda.status_detail ?? null,
    envio_id: envio?.id ?? null,
    itens_do_mercado_livre: itensLidos,
    pedidos_aqui: conhecidos,
  });
});
