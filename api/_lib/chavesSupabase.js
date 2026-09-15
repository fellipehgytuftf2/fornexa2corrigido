// Leitura das chaves do Supabase nas funções serverless da Vercel.
//
// Mesma lógica de supabase/functions/_shared/chaves.ts, portada pra Node: o
// Supabase está trocando o sistema de chaves (as legadas — anon, service_role
// — saem de linha no fim de 2026; as novas são SUPABASE_SECRET_KEYS /
// SUPABASE_PUBLISHABLE_KEYS, um JSON indexado por nome). Tenta a nova
// primeiro e cai na legada se não houver, pra funcionar antes e depois da
// troca sem precisar editar nada aqui.

function lerChaveNova(nomeDaVariavel, nomeDaChave = "default") {
  const bruto = process.env[nomeDaVariavel];
  if (!bruto) return null;
  try {
    const chaves = JSON.parse(bruto);
    return chaves?.[nomeDaChave] ?? null;
  } catch {
    console.error(`Não foi possível interpretar ${nomeDaVariavel} como JSON.`);
    return null;
  }
}

/** Chave de acesso privilegiado (ignora RLS) — só para uso no servidor. */
export function chaveSecreta() {
  return lerChaveNova("SUPABASE_SECRET_KEYS") ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function urlDoProjeto() {
  return process.env.SUPABASE_URL;
}
