// ============================================================================
// FORNEXA — ml-oauth-start
// ============================================================================
// Objetivo: gerar a URL de autorização do Mercado Livre para o vendedor
// logado, incluindo o ID dele no parâmetro "state" — é assim que o
// ml-oauth-callback vai saber para qual vendedor salvar o token depois.
//
// Esta função é chamada pelo front-end via supabase.functions.invoke(),
// que já envia automaticamente o token do usuário logado no header
// Authorization. O front-end recebe { url } e faz window.location.href = url.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assinarEstado } from "../_shared/estadoOAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Preflight do CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Token de autenticação ausente" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jwt = authHeader.replace("Bearer ", "");

    // Usamos a service role para validar o JWT do usuário e descobrir quem é
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !userData?.user) {
      console.error("Detalhe do erro de autenticação:", userError);
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado ou token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vendedorId = userData.user.id;

    const clientId = Deno.env.get("ML_CLIENT_ID")!;
    const redirectUri = Deno.env.get("ML_REDIRECT_URI")!;

    // "state" carrega o ID do vendedor, assinado: sem a assinatura, qualquer
    // um poderia montar esta URL na mão com o ID de outra pessoa e o
    // callback vincularia a conta ML errada. Ver _shared/estadoOAuth.ts.
    const state = await assinarEstado(vendedorId);

    const authUrl =
      `https://auth.mercadolivre.com.br/authorization` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    return new Response(JSON.stringify({ url: authUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro em ml-oauth-start:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno ao gerar URL de autorização" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
