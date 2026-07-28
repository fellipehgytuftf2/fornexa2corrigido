// ============================================================================
// supplier-revoke-access
//
// Remove o acesso de um fornecedor ao Portal do Fornecedor.
//
// Só um admin do FORNEXA pode chamar. A função:
//   1. confirma que quem chamou está logado e tem profiles.role = 'admin'
//   2. confirma que o fornecedor existe e tem acesso criado
//   3. apaga a conta do Supabase Auth
//   4. garante que suppliers.auth_user_id ficou NULL
//
// Apagar a conta libera o e-mail para ser usado de novo. Sem isso, recriar o
// acesso com o mesmo e-mail bateria no erro 409 de "conta já existe".
//
// AÇÃO DESTRUTIVA: a conta some do Auth e a senha do fornecedor deixa de
// valer. O cadastro em `suppliers` e os pedidos NÃO são tocados.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'Função mal configurada no servidor.' }, 500);
  }

  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();

  if (callerError || !caller) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerProfile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();

  if (profileError) {
    return json(
      { error: `Não foi possível confirmar sua permissão: ${profileError.message}` },
      500
    );
  }

  if (callerProfile?.role !== 'admin') {
    return json({ error: 'Apenas administradores podem remover acesso de fornecedor.' }, 403);
  }

  let payload: { supplier_id?: string };

  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const supplierId = payload.supplier_id?.trim();

  if (!supplierId) {
    return json({ error: 'Informe o fornecedor.' }, 400);
  }

  const { data: supplier, error: supplierError } = await admin
    .from('suppliers')
    .select('id, name, company_name, auth_user_id')
    .eq('id', supplierId)
    .maybeSingle();

  if (supplierError) {
    return json(
      {
        error: `Não foi possível carregar o fornecedor: ${supplierError.message}`,
        code: supplierError.code,
      },
      500
    );
  }

  if (!supplier) {
    return json({ error: 'Fornecedor não encontrado.' }, 404);
  }

  if (!supplier.auth_user_id) {
    return json({ error: 'Este fornecedor não tem acesso para remover.' }, 409);
  }

  // Apagar a conta já zera suppliers.auth_user_id sozinho: a coluna é
  // "references auth.users on delete set null".
  const { error: deleteError } = await admin.auth.admin.deleteUser(
    supplier.auth_user_id
  );

  // Conta já inexistente (404) não é problema — o objetivo é o mesmo, e o
  // vínculo órfão é limpo logo abaixo.
  if (deleteError && deleteError.status !== 404) {
    return json(
      { error: `Não foi possível apagar a conta de login: ${deleteError.message}` },
      500
    );
  }

  // Rede de segurança: confirma que o vínculo saiu, caso a FK não tenha
  // agido como esperado.
  const { error: unlinkError } = await admin
    .from('suppliers')
    .update({ auth_user_id: null })
    .eq('id', supplier.id);

  if (unlinkError) {
    return json(
      {
        error: `Conta apagada, mas o vínculo continua no cadastro: ${unlinkError.message}`,
      },
      500
    );
  }

  return json({
    supplier_id: supplier.id,
    supplier_name: supplier.company_name || supplier.name,
    account_was_missing: deleteError?.status === 404,
  });
});
