// ============================================================================
// FORNEXA — ml-oauth-callback
// ============================================================================
// Objetivo: receber o "code" que o Mercado Livre manda depois que o vendedor
// autoriza o app, trocar esse code por access_token/refresh_token, e salvar
// tudo em ml_connections. No final, redireciona o navegador de volta para
// o front-end da FORNEXA.
//
// Esta função é chamada DIRETO pelo navegador (redirecionamento do ML),
// não pelo supabase.functions.invoke() — por isso não tem Authorization
// header aqui. É por isso que usamos o "state" (ID do vendedor) para saber
// para quem salvar o token, em vez de validar um JWT.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const frontendUrl = Deno.env.get("FRONTEND_URL")!;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const vendedorId = url.searchParams.get("state");
  const mlError = url.searchParams.get("error");

  // Caso o vendedor tenha negado a autorização no Mercado Livre
  if (mlError) {
    return Response.redirect(`${frontendUrl}/dashboard?ml=erro&motivo=recusado`, 302);
  }

  if (!code || !vendedorId) {
    return Response.redirect(`${frontendUrl}/dashboard?ml=erro&motivo=parametros_invalidos`, 302);
  }

  try {
    // 1. Trocar o code por access_token + refresh_token
    const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: Deno.env.get("ML_CLIENT_ID")!,
        client_secret: Deno.env.get("ML_CLIENT_SECRET")!,
        code,
        redirect_uri: Deno.env.get("ML_REDIRECT_URI")!,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      await supabase.from("log_integracao_ml").insert({
        contexto: "ml-oauth-callback",
        mensagem: "Falha ao trocar code por token",
        detalhes: tokenData,
      });
      return Response.redirect(`${frontendUrl}/dashboard?ml=erro&motivo=token_invalido`, 302);
    }

    const {
      access_token,
      refresh_token,
      expires_in,
      scope,
      user_id: mlUserId,
    } = tokenData;

    // 2. Buscar o nickname da conta ML para exibir no painel (account_name é NOT NULL)
    let accountName = `ML-${mlUserId}`;
    try {
      const userInfoResponse = await fetch(`https://api.mercadolibre.com/users/${mlUserId}`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        accountName = userInfo.nickname ?? accountName;
      }
    } catch (_e) {
      // Se falhar, seguimos com o valor padrão — não é crítico o suficiente
      // para interromper o fluxo de conexão.
    }

    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    // 3. Salvar ou atualizar em ml_connections
    const { data: existing } = await supabase
      .from("ml_connections")
      .select("id")
      .eq("user_id", vendedorId)
      .maybeSingle();

    const payload = {
      user_id: vendedorId,
      // IMPORTANTE: a tabela ml_connections tem uma CHECK constraint
      // (ml_connections_status_check) que só aceita os valores em inglês:
      // 'disconnected', 'prepared', 'connected'. Usar "conectado" (português)
      // fazia o insert/update falhar silenciosamente.
      status: "connected",
      account_name: accountName,
      external_account_id: String(mlUserId),
      access_token,
      refresh_token,
      expires_at: expiresAt,
      scope,
      connected_at: new Date().toISOString(),
    };

    // IMPORTANTE: agora capturamos o erro do update/insert. Antes, se essa
    // operação falhasse (RLS, constraint, etc.), o erro era descartado
    // silenciosamente e o usuário era redirecionado como se tivesse dado
    // certo, mesmo com o banco não atualizado.
    let saveError = null;

    if (existing) {
      const { error } = await supabase
        .from("ml_connections")
        .update(payload)
        .eq("id", existing.id);
      saveError = error;
    } else {
      const { error } = await supabase.from("ml_connections").insert(payload);
      saveError = error;
    }

    if (saveError) {
      console.error("Erro ao salvar ml_connections:", saveError);
      await supabase.from("log_integracao_ml").insert({
        contexto: "ml-oauth-callback",
        mensagem: "Falha ao salvar tokens em ml_connections",
        detalhes: saveError,
      });
      return Response.redirect(`${frontendUrl}/dashboard?ml=erro&motivo=falha_ao_salvar`, 302);
    }

    return Response.redirect(`${frontendUrl}/dashboard?ml=conectado`, 302);
  } catch (err) {
    console.error("Erro em ml-oauth-callback:", err);
    await supabase.from("log_integracao_ml").insert({
      contexto: "ml-oauth-callback",
      mensagem: "Erro inesperado no callback OAuth",
      detalhes: { error: String(err) },
    });
    return Response.redirect(`${frontendUrl}/dashboard?ml=erro&motivo=erro_interno`, 302);
  }
});
