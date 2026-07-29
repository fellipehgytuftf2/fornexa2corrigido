// ============================================================================
// supplier-create-access
//
// Cria a conta de login de um fornecedor no Portal do Fornecedor.
//
// Só um admin do FORNEXA pode chamar. A função:
//   1. confirma que quem chamou está logado e tem profiles.role = 'admin'
//   2. confirma que o fornecedor existe e ainda não tem acesso
//   3. cria o usuário no Supabase Auth já confirmado, com senha forte
//   4. grava suppliers.auth_user_id
//   5. devolve a senha UMA única vez, para o admin repassar ao fornecedor
//
// A senha nunca é gravada em lugar nenhum nem escrita em log.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chavePublica, chaveSecreta, urlDoProjeto } from '../_shared/chaves.ts';

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

/**
 * Senha temporária forte. Alfabeto sem caracteres ambíguos (0/O, 1/l/I),
 * porque o admin vai repassar isso digitado no WhatsApp.
 */
function generatePassword(length = 20): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);

  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += alphabet[bytes[i] % alphabet.length];
  }

  return password;
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

  // Cliente com o token de quem chamou — serve só para identificar o usuário.
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

  // Cliente administrativo. A partir daqui a RLS é ignorada, então cada
  // consulta precisa filtrar explicitamente o que quer.
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
    return json({ error: 'Apenas administradores podem criar acesso de fornecedor.' }, 403);
  }

  let payload: { supplier_id?: string; email?: string };

  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const supplierId = payload.supplier_id?.trim();
  const email = payload.email?.trim().toLowerCase();

  if (!supplierId) {
    return json({ error: 'Informe o fornecedor.' }, 400);
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Informe um e-mail válido.' }, 400);
  }

  const { data: supplier, error: supplierError } = await admin
    .from('suppliers')
    .select('id, name, company_name, auth_user_id')
    .eq('id', supplierId)
    .maybeSingle();

  if (supplierError) {
    // Endpoint restrito a admin, então mostrar o erro do banco é seguro e
    // evita ter que caçar em log toda vez.
    return json(
      {
        error: `Não foi possível carregar o fornecedor: ${supplierError.message}`,
        code: supplierError.code,
        details: supplierError.details,
        hint: supplierError.hint,
      },
      500
    );
  }

  if (!supplier) {
    return json({ error: 'Fornecedor não encontrado.' }, 404);
  }

  if (supplier.auth_user_id) {
    return json({ error: 'Este fornecedor já tem acesso criado.' }, 409);
  }

  const password = generatePassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: supplier.company_name || supplier.name,
      account_type: 'supplier',
      supplier_id: supplier.id,
    },
  });

  if (createError || !created.user) {
    const alreadyExists =
      createError?.status === 422 ||
      (createError?.message || '').toLowerCase().includes('already');

    return json(
      {
        error: alreadyExists
          ? 'Já existe uma conta com este e-mail. Use outro e-mail ou vincule a conta existente manualmente.'
          : `Não foi possível criar a conta: ${createError?.message ?? 'erro desconhecido'}`,
      },
      alreadyExists ? 409 : 500
    );
  }

  const newUserId = created.user.id;

  const { error: linkError } = await admin
    .from('suppliers')
    .update({ auth_user_id: newUserId, email })
    .eq('id', supplier.id)
    .is('auth_user_id', null);

  if (linkError) {
    // Não deixa uma conta órfã de pé: sem o vínculo ela não serve para nada
    // e ainda ocuparia o e-mail.
    await admin.auth.admin.deleteUser(newUserId);

    return json(
      { error: `Conta criada mas não vinculada, então foi desfeita: ${linkError.message}` },
      500
    );
  }

  // Se existir trigger que cria `profiles` no signup, a linha nasce como
  // 'user' e daria acesso ao dashboard do vendedor. Marca como 'supplier'.
  // Falha aqui não invalida o acesso — o portal decide pelo suppliers.auth_user_id.
  const { error: profileTagError } = await admin
    .from('profiles')
    .update({ role: 'supplier' })
    .eq('id', newUserId);

  return json({
    supplier_id: supplier.id,
    supplier_name: supplier.company_name || supplier.name,
    email,
    password,
    profile_warning: profileTagError
      ? 'Acesso criado, mas não foi possível marcar o perfil como fornecedor.'
      : null,
  });
});
