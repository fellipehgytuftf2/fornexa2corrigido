// ============================================================================
// FORNEXA — ml-pending-issues
// ============================================================================
// Objetivo: expor, de forma segura e já traduzida para o vendedor, os
// pedidos do Mercado Livre que o FORNEXA RECEBEU mas não conseguiu
// processar (webhook_events com status 'erro' + falhas registradas em
// log_integracao_ml pelo ml-sync-orders).
//
// Por que uma Edge Function e não uma consulta direta do front-end:
//   - webhook_events guarda ml_user_id (o ID numérico do Mercado Livre), não
//     o user_id do FORNEXA — não dá pra filtrar "só os meus" com uma RLS
//     simples baseada em auth.uid() diretamente nessa tabela.
//   - log_integracao_ml nem sequer tem coluna de usuário; o vendedorId fica
//     dentro do jsonb `detalhes`.
//   Por isso a filtragem é feita aqui, no backend, cruzando com
//   ml_connections (que sim pertence ao vendedor autenticado).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Traduz as mensagens técnicas registradas pelo ml-webhook-receiver e pelo
// ml-sync-orders em explicações claras e acionáveis para o vendedor.
function traduzirMotivo(motivoBruto: string): string {
  if (motivoBruto.includes("sem fornecedor vinculado")) {
    return "O produto vendido não tem um fornecedor vinculado. Vincule um fornecedor a esse produto e sincronize novamente.";
  }
  if (motivoBruto.includes("Fornecedor vinculado") && motivoBruto.includes("não foi encontrado")) {
    return "O fornecedor vinculado a esse produto não foi encontrado (pode ter sido removido do catálogo).";
  }
  if (motivoBruto.includes("Nenhum produto encontrado")) {
    return "Não encontramos, no seu catálogo, qual produto corresponde a este pedido.";
  }
  if (motivoBruto.includes("Nenhuma conexão FORNEXA encontrada")) {
    return "Não foi possível identificar a qual conta do FORNEXA este pedido pertence.";
  }
  if (motivoBruto.includes("Falha ao renovar token")) {
    return "Sua conexão com o Mercado Livre expirou. Reconecte em Integrações e sincronize novamente.";
  }
  if (motivoBruto.includes("Falha ao buscar detalhes do pedido")) {
    return "Não conseguimos buscar os detalhes desse pedido no Mercado Livre. Tente sincronizar novamente.";
  }
  if (motivoBruto.includes("Pedido sem item associado")) {
    return "Este pedido veio sem nenhum item identificável — pode ser um caso incomum do Mercado Livre.";
  }
  return motivoBruto;
}

interface IssueItem {
  origem: "webhook" | "sincronizacao";
  ml_order_id: string | null;
  motivo: string;
  data: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Token de autenticação ausente" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado ou token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vendedorId = userData.user.id;

    const { data: connection } = await supabase
      .from("ml_connections")
      .select("external_account_id")
      .eq("user_id", vendedorId)
      .maybeSingle();

    const issues: IssueItem[] = [];

    // 1. Falhas de webhook (tempo real) — filtradas pelo ml_user_id do
    // vendedor conectado
    if (connection?.external_account_id) {
      const { data: webhookIssues } = await supabase
        .from("webhook_events")
        .select("resource, erro_mensagem, criado_em")
        .eq("ml_user_id", connection.external_account_id)
        .eq("status", "erro")
        .ilike("topic", "%order%")
        .order("criado_em", { ascending: false })
        .limit(30);

      for (const issue of webhookIssues ?? []) {
        const mlOrderId = issue.resource ? issue.resource.split("/").pop() ?? null : null;
        issues.push({
          origem: "webhook",
          ml_order_id: mlOrderId,
          motivo: traduzirMotivo(issue.erro_mensagem ?? "Erro não especificado"),
          data: issue.criado_em,
        });
      }
    }

    // 2. Falhas registradas pela sincronização manual (ml-sync-orders),
    // onde o vendedorId fica dentro do jsonb `detalhes`
    const { data: syncLogs } = await supabase
      .from("log_integracao_ml")
      .select("detalhes, criado_em")
      .eq("contexto", "ml-sync-orders")
      .eq("mensagem", "Alguns pedidos falharam durante a sincronização")
      .order("criado_em", { ascending: false })
      .limit(20);

    for (const log of syncLogs ?? []) {
      const detalhes = log.detalhes as { vendedorId?: string; errors?: { ml_order_id: string; motivo: string }[] };

      if (detalhes?.vendedorId !== vendedorId) continue;

      for (const erro of detalhes.errors ?? []) {
        issues.push({
          origem: "sincronizacao",
          ml_order_id: erro.ml_order_id,
          motivo: traduzirMotivo(erro.motivo ?? "Erro não especificado"),
          data: log.criado_em,
        });
      }
    }

    // Remove duplicados (o mesmo pedido pode ter falhado tanto no webhook
    // quanto numa sincronização manual) — mantém a ocorrência mais recente.
    const unicos = new Map<string, IssueItem>();
    for (const issue of issues.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())) {
      const chave = issue.ml_order_id ?? `${issue.origem}-${issue.data}`;
      if (!unicos.has(chave)) {
        unicos.set(chave, issue);
      }
    }

    return new Response(
      JSON.stringify({ success: true, issues: Array.from(unicos.values()) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erro em ml-pending-issues:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno ao buscar pedidos com problema" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});