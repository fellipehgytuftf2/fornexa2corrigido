// ============================================================================
// admin-apagar-contas-abandonadas
//
// Apaga contas que se cadastraram, nunca pagaram e nunca usaram nada.
//
// POR QUE EXISTE
//
// Apagar usuário do Supabase exige a chave de servidor — não dá para fazer
// pelo SQL nem pelo navegador. E a conta apagada não volta, então o caminho
// precisa ser um só, com registro do que saiu.
//
// QUEM DECIDE QUEM SAI
//
// A função `admin_contas_abandonadas` no banco, e só ela. Esta função não tem
// critério próprio: repetir a regra aqui criaria duas definições que um dia
// discordam, e a discordância apagaria conta de gente real.
//
// COMO SE USA
//
//   { simular: true }            conta quantas sairiam, sem apagar nada
//   { simular: false, limite: 100 }  apaga até 100 e devolve o que sobrou
//
// O limite existe porque são milhares: uma chamada só estouraria o tempo da
// função no meio da fila, sem saber onde parou.
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

/** Teto por chamada. Acima disso a função estoura o tempo no meio da fila. */
const TETO = 200;

interface Conta {
  id: string;
  email: string | null;
  nome: string | null;
  criado_em: string | null;
  ultimo_acesso: string | null;
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

  // Cliente com o token de quem chamou: é ele que a função do banco vê, e é
  // por isso que a checagem de admin acontece lá, e não aqui.
  const comoOAdmin = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user: caller },
  } = await comoOAdmin.auth.getUser();

  if (!caller) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  let corpo: { dias?: number; limite?: number; simular?: boolean } = {};

  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }

  const dias = Math.max(Number(corpo.dias ?? 7), 1);
  const limite = Math.min(Math.max(Number(corpo.limite ?? 50), 1), TETO);
  const simular = corpo.simular !== false;

  const { data: contas, error } = await comoOAdmin.rpc('admin_contas_abandonadas', {
    p_dias: dias,
  });

  if (error) {
    // "apenas administradores" chega aqui: a regra é do banco.
    return json({ error: error.message }, 403);
  }

  const lista = (contas ?? []) as Conta[];

  if (simular) {
    return json({
      ok: true,
      simulacao: true,
      total: lista.length,
      exemplos: lista.slice(0, 5).map((conta) => conta.email),
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const fila = lista.slice(0, limite);

  let apagadas = 0;
  const falhas: string[] = [];

  for (const conta of fila) {
    // O registro entra ANTES: apagada sem registro é conta que some sem
    // deixar como responder "o que houve com a minha conta?".
    await admin.from('contas_apagadas').insert({
      id: conta.id,
      email: conta.email,
      nome: conta.nome,
      criada_em: conta.criado_em,
      ultimo_acesso: conta.ultimo_acesso,
      dias_da_regra: dias,
      apagada_por: caller.id,
    });

    const { error: erroAoApagar } = await admin.auth.admin.deleteUser(conta.id);

    if (erroAoApagar) {
      falhas.push(`${conta.email}: ${erroAoApagar.message}`);
      // Sem a conta apagada, o registro mente. Tira.
      await admin.from('contas_apagadas').delete().eq('id', conta.id);
      continue;
    }

    apagadas += 1;
  }

  return json({
    ok: true,
    simulacao: false,
    apagadas,
    restam: Math.max(lista.length - apagadas, 0),
    falhas: falhas.slice(0, 10),
  });
});
