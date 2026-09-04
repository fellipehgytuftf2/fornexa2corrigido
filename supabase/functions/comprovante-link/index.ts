// ============================================================================
// comprovante-link
//
// Abre o comprovante de um pedido para quem tem o direito de ver, e por poucos
// minutos.
//
// O arquivo mora num lugar fechado: ninguém o lê direto, nem com o caminho em
// mãos. Esta função confere quem está pedindo, e só então assina um endereço
// temporário.
//
// QUEM PODE VER
//
//   o vendedor que pagou      — é o comprovante dele
//   o fornecedor do pedido    — é a prova que ele usa para contestar um MED
//   o admin                   — suporte
//
// Ninguém mais, nem com o caminho do arquivo.
//
// POR QUE A REGRA VIVE AQUI E NÃO NUMA POLÍTICA DE STORAGE
//
// Quem pode ver depende do PEDIDO, não do arquivo. Escrever isso em política de
// storage exigiria decompor o nome do arquivo para reencontrar o pedido — e no
// dia em que alguém mudar o padrão do nome, a regra se desfaz em silêncio.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chavePublica, chaveSecreta, urlDoProjeto } from '../_shared/chaves.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Tempo de vida do endereço. Curto: serve para abrir agora, não para guardar. */
const SEGUNDOS_DE_VALIDADE = 300;

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
    data: { user },
  } = await createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  }).auth.getUser();

  if (!user) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  let payload: { order_id?: string };

  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const pedidoId = payload.order_id?.trim();

  if (!pedidoId) {
    return json({ error: 'Informe o pedido.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: pedido } = await admin
    .from('orders')
    .select('id, user_id, supplier_id, comprovante_path')
    .eq('id', pedidoId)
    .maybeSingle();

  if (!pedido?.comprovante_path) {
    return json({ error: 'Este pedido não tem comprovante.' }, 404);
  }

  const ehVendedor = pedido.user_id === user.id;

  const { data: perfil } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const ehAdmin = perfil?.role === 'admin';

  let ehFornecedor = false;

  if (pedido.supplier_id) {
    const { data: fornecedor } = await admin
      .from('suppliers')
      .select('id')
      .eq('id', pedido.supplier_id)
      .eq('auth_user_id', user.id)
      .maybeSingle();

    ehFornecedor = Boolean(fornecedor);
  }

  if (!ehVendedor && !ehFornecedor && !ehAdmin) {
    return json({ error: 'Este comprovante não é seu.' }, 403);
  }

  const { data: assinado, error } = await admin.storage
    .from('comprovantes')
    .createSignedUrl(pedido.comprovante_path, SEGUNDOS_DE_VALIDADE);

  if (error || !assinado?.signedUrl) {
    console.error('Falha ao assinar o comprovante:', error);
    return json({ error: 'Não foi possível abrir o comprovante.' }, 500);
  }

  return json({ url: assinado.signedUrl, expira_em: SEGUNDOS_DE_VALIDADE });
});
