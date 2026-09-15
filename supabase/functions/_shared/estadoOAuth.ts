// ============================================================================
// Assinatura do "state" do OAuth do Mercado Livre
// ============================================================================
// PROBLEMA (achado em auditoria de segurança)
//
// ml-oauth-start colocava o UUID do vendedor no "state" sem assiná-lo. O
// callback confiava nesse valor de volta como se fosse prova de quem pediu a
// conexão. Mas nada impedia alguém de montar a URL de autorização na mão,
// pulando ml-oauth-start, com state=<uuid de outra pessoa>: o Mercado Livre
// devolve esse state sem verificar quem é o dono, e o callback vinculava a
// conta ML do atacante à conta FORNEXA da vítima.
//
// SOLUÇÃO
//
// O state carrega uma assinatura HMAC (com ML_CLIENT_SECRET, que já é
// segredo de servidor) e o próprio prazo de validade. Só quem tem o segredo
// — só o backend — consegue gerar um state que o callback aceita. Sem
// tabela nova para guardar e limpar depois: tudo cabe no próprio state.
// ============================================================================

const VALIDADE_MS = 15 * 60 * 1000;

async function chaveHmac(): Promise<CryptoKey> {
  const segredo = Deno.env.get("ML_CLIENT_SECRET")!;
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function paraHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function assinar(payload: string): Promise<string> {
  return paraHex(await crypto.subtle.sign("HMAC", await chaveHmac(), new TextEncoder().encode(payload)));
}

/** Compara em tempo constante — assinatura não é dado para vazar por timing. */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Gera um state assinado e com prazo, para o vendedor que está iniciando a conexão. */
export async function assinarEstado(vendedorId: string): Promise<string> {
  const expiraEm = Date.now() + VALIDADE_MS;
  const payload = `${vendedorId}.${expiraEm}`;
  const assinatura = await assinar(payload);
  return `${payload}.${assinatura}`;
}

/**
 * Confere o state que o Mercado Livre devolveu no callback.
 * Devolve o vendedorId só se a assinatura bate e o prazo não passou;
 * caso contrário, null — o chamador trata como state inválido/forjado.
 */
export async function conferirEstado(state: string): Promise<string | null> {
  const partes = state.split(".");
  if (partes.length !== 3) return null;

  const [vendedorId, expiraEmTexto, assinaturaRecebida] = partes;
  const expiraEm = Number(expiraEmTexto);

  if (!vendedorId || !Number.isFinite(expiraEm) || Date.now() > expiraEm) return null;

  const assinaturaEsperada = await assinar(`${vendedorId}.${expiraEmTexto}`);

  return iguaisEmTempoConstante(assinaturaEsperada, assinaturaRecebida) ? vendedorId : null;
}
