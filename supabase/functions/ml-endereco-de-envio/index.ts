// ============================================================================
// ml-endereco-de-envio
//
// De onde o Mercado Livre acha que as encomendas deste vendedor saem.
//
// POR QUE ISTO EXISTE
//
// A etiqueta sai com o endereço cadastrado na conta do vendedor. Em
// dropshipping, a caixa parte do galpão do fornecedor — então esse endereço
// precisa ser o do fornecedor, e quem configura é o vendedor, dentro do
// Mercado Livre.
//
// O problema não é configurar. É descobrir que não configurou: sem conferência,
// o erro só aparece quando a primeira etiqueta é impressa com o endereço
// errado — e nesse ponto o Mercado Livre não deixa mais mudar aquele envio, e a
// devolução já tem para onde ir errado.
//
// GRAVAR NÃO DÁ — CONFIRMADO POR SONDA EM 2026-09-06
//
// POST no mesmo caminho respondeu 404 com a mensagem genérica de rota
// inexistente do Mercado Livre, diferente do 404 com conteúdo próprio que
// provou a existência da API de DC-e. Não há como o FORNEXA gravar o endereço
// de venda de outra conta.
//
// Por isso a tela entrega o endereço pronto para copiar, e esta função só
// confere se o vendedor já colou. Conferir é o que salva: sem isso o erro só
// apareceria na primeira etiqueta impressa, quando o Mercado Livre já não
// deixa mudar aquele envio.
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

/** Só os dígitos: "01310-100" e "01310100" são o mesmo CEP. */
const soDigitos = (texto: unknown) => String(texto ?? '').replace(/\D/g, '');

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

  // Sempre a conexão de quem chamou. Ninguém consulta o endereço de outro.
  const { data: conexao } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status, external_account_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!conexao?.external_account_id) {
    return json({ conectado: false });
  }

  const token = await obterAccessToken(admin, conexao);

  if (!token.ok) {
    return json({ conectado: false, precisa_reconectar: true });
  }

  const enderecoDaApi = `https://api.mercadolibre.com/users/${conexao.external_account_id}/addresses`;

  const resposta = await fetch(enderecoDaApi, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();

    // Sem o motivo, a tela só sabe dizer "não conseguimos conferir" — que é
    // verdade e não dá o que fazer a ninguém.
    await admin.from('log_integracao_ml').insert({
      contexto: 'ml-endereco-de-envio',
      mensagem: `Mercado Livre recusou a leitura de endereços (${resposta.status})`,
      detalhes: {
        user_id: user.id,
        ml_user_id: conexao.external_account_id,
        status: resposta.status,
        resposta: corpo.slice(0, 1000),
      },
    });

    return json({ conectado: true, erro_de_leitura: true, status: resposta.status });
  }

  const enderecos = (await resposta.json()) as Record<string, unknown>[];

  // `default_selling_address` é o que vira remetente da etiqueta. Um vendedor
  // pode ter vários endereços cadastrados; só este importa aqui.
  const deVenda =
    enderecos.find((endereco) =>
      ((endereco.types ?? []) as string[]).includes('default_selling_address')
    ) ?? enderecos[0];

  return json({
    conectado: true,
    cep: soDigitos(deVenda?.zip_code),
    cidade: deVenda?.city ?? null,
    estado: deVenda?.state ?? null,
    logradouro: deVenda?.address_line ?? null,
  });
});
