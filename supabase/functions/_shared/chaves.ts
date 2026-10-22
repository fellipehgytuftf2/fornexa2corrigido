// ============================================================================
// Leitura das chaves do Supabase nas Edge Functions
//
// O Supabase está trocando o sistema de chaves. As legadas (anon,
// service_role) serão descontinuadas no fim de 2026; as novas são
// `sb_publishable_...` e `sb_secret_...`.
//
// Diferença de formato que motiva este módulo: as variáveis novas são plurais
// e guardam um JSON com as chaves indexadas por nome, enquanto as legadas
// guardam a string direto.
//
//   SUPABASE_SERVICE_ROLE_KEY  ->  "eyJhbGci..."
//   SUPABASE_SECRET_KEYS       ->  {"default":"sb_secret_..."}
//
// Cada função tenta a chave nova e cai na legada se ela não existir. Assim o
// mesmo código roda antes e depois de as chaves legadas serem desativadas, e
// a desativação não derruba nada.
//
// Motivo da migração: a service_role legada deste projeto foi exposta e não
// pode ser trocada isoladamente — trocar exigiria rotacionar o JWT secret,
// o que invalidaria também a anon e todas as sessões. Desativar as legadas
// resolve sem esse efeito colateral.
// ============================================================================

/** Lê uma chave nova do JSON plural, ou null se não houver. */
function leChaveNova(nomeDaVariavel: string, nomeDaChave = 'default'): string | null {
  const bruto = Deno.env.get(nomeDaVariavel);

  if (!bruto) {
    return null;
  }

  try {
    const chaves = JSON.parse(bruto) as Record<string, string>;
    return chaves?.[nomeDaChave] ?? null;
  } catch {
    // Formato inesperado: melhor cair na chave legada do que derrubar a função.
    console.error(`Não foi possível interpretar ${nomeDaVariavel} como JSON.`);
    return null;
  }
}

/**
 * Chave de acesso privilegiado, para uso apenas no servidor.
 * Ignora RLS — toda consulta feita com ela precisa filtrar explicitamente.
 */
export function chaveSecreta(): string | undefined {
  return leChaveNova('SUPABASE_SECRET_KEYS') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

/**
 * Chave pública, usada apenas para montar o cliente que identifica quem
 * chamou a função a partir do JWT do usuário.
 */
export function chavePublica(): string | undefined {
  return leChaveNova('SUPABASE_PUBLISHABLE_KEYS') ?? Deno.env.get('SUPABASE_ANON_KEY');
}

export function urlDoProjeto(): string | undefined {
  return Deno.env.get('SUPABASE_URL');
}
