// ============================================================================
// ml-sonda-gravar-impressao
//
// PROVISÓRIA. Descobre se dá para TROCAR a preferência de impressão pela API.
//
// A PERGUNTA
//
// Ler já se sabe que dá: `GET /users/{id}/shipping_preferences` traz
// `thermal_printer`. Gravar é outra autorização — a lista de endereços ensinou
// isso do pior jeito: lê com 403 e grava com 404, e são coisas diferentes.
//
// Se gravar funcionar, o FORNEXA passa a deixar a etiqueta em térmica sozinho,
// e o fornecedor para de cortar folha com tesoura.
//
// A TRAVA QUE IMPORTA
//
// Escreve SOMENTE na conta conectada de quem chamou. Não aceita id de conta,
// não aceita pedido, não olha para outro vendedor. Uma sonda de escrita que
// aceitasse alvo acabaria, uma hora, apontada para a conta de um cliente.
//
// Exige `confirmo: true` no corpo, para nenhum clique de curiosidade mudar
// configuração de conta real.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chavePublica, chaveSecreta, urlDoProjeto } from '../_shared/chaves.ts';
import { obterAccessToken } from '../_shared/tokenMercadoLivre.ts';

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

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: perfil } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (perfil?.role !== 'admin') {
    return json({ error: 'Apenas administradores.' }, 403);
  }

  let payload: { confirmo?: boolean };

  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  if (payload.confirmo !== true) {
    return json({ error: 'Esta sonda escreve na sua conta. Confirme para seguir.' }, 400);
  }

  // A conexão de quem chamou, e nenhuma outra.
  const { data: conexao } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status, external_account_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!conexao?.external_account_id) {
    return json({ error: 'Sua conta não tem Mercado Livre conectado.' }, 409);
  }

  const token = await obterAccessToken(admin, conexao);

  if (!token.ok) {
    return json({ error: 'Sua conexão com o Mercado Livre expirou.' }, 409);
  }

  const url = `https://api.mercadolibre.com/users/${encodeURIComponent(
    String(conexao.external_account_id)
  )}/shipping_preferences`;

  const cabecalho = {
    Authorization: `Bearer ${token.accessToken}`,
    'Content-Type': 'application/json',
  };

  const antes = await (await fetch(url, { headers: cabecalho })).text();

  // Dois verbos e dois formatos de corpo: não há documentação dizendo qual é o
  // certo, e um 405 já elimina o verbo sem custo nenhum.
  const tentativas = [
    { verbo: 'PUT', corpo: { thermal_printer: true } },
    { verbo: 'POST', corpo: { thermal_printer: true } },
    { verbo: 'PUT', corpo: { thermal_printer: 'thermal' } },
  ];

  const resultados: Record<string, unknown>[] = [];

  for (const tentativa of tentativas) {
    try {
      const resposta = await fetch(url, {
        method: tentativa.verbo,
        headers: cabecalho,
        body: JSON.stringify(tentativa.corpo),
      });

      const corpo = await resposta.text();

      resultados.push({
        verbo: tentativa.verbo,
        enviado: tentativa.corpo,
        status: resposta.status,
        resposta: corpo.slice(0, 600),
      });

      // Deu certo: para de tentar. Insistir depois de um 200 escreveria de
      // novo por nada.
      if (resposta.ok) break;
    } catch (erro) {
      resultados.push({ verbo: tentativa.verbo, erro: String(erro) });
    }
  }

  const depois = await (await fetch(url, { headers: cabecalho })).text();

  await admin.from('log_integracao_ml').insert({
    contexto: 'ml-sonda-gravar-impressao',
    mensagem: 'Sonda de escrita da preferência de impressão',
    detalhes: {
      user_id: user.id,
      ml_user_id: conexao.external_account_id,
      resultados,
    },
  });

  const valorDe = (texto: string) => {
    try {
      return (JSON.parse(texto) as Record<string, unknown>).thermal_printer ?? null;
    } catch {
      return null;
    }
  };

  return json({
    ml_user_id: conexao.external_account_id,
    thermal_printer_antes: valorDe(antes),
    thermal_printer_depois: valorDe(depois),
    resultados,
  });
});
