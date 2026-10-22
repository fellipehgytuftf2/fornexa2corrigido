// ============================================================================
// ml-renovar-caidas
//
// Tenta pôr de volta no ar as contas do Mercado Livre marcadas como caídas.
//
// POR QUE EXISTE
//
// Em 24/09/2026: 112 conexões com status 'disconnected' contra 232
// conectadas. Dessas 112, 85 ainda têm refresh token guardado — ou seja,
// poderiam voltar sozinhas. Ninguém tentava: a renovação só roda quando o
// vendedor faz alguma coisa no sistema (publica, abre a tela, recebe webhook).
// Quem não entra, fica caído; e conta caída não recebe pedido, não publica e
// não deixa o FORNEXA pausar anúncio sem estoque — 67 dos 170 anúncios que
// falharam ao pausar falharam exatamente por isso.
//
// O QUE ELA FAZ
//
// Chama `obterAccessToken` para cada conexão caída que ainda tem refresh
// token. Toda a lógica difícil já mora lá: renova, grava o token novo (o
// Mercado Livre gira o refresh a cada uso), trata a corrida com outra chamada
// e devolve o status a 'connected' sozinha quando dá certo.
//
// O QUE ELA NUNCA FAZ
//
// Mexer em conexão que nunca completou o OAuth. São 27 hoje, com
// `external_account_id` vazio e sem token nenhum: nunca estiveram conectadas,
// e tentar renovar o nada só gastaria chamada.
//
// QUEM CHAMA
//
// Quem tiver a senha de `segredos_internos`, no cabeçalho `x-segredo` — mesmo
// desenho de `ml-pausar-sem-estoque`. Não há login de usuário.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chaveSecreta, urlDoProjeto } from '../_shared/chaves.ts';
import { obterAccessToken } from '../_shared/tokenMercadoLivre.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Conexões por rodada.
 *
 * Cada uma é uma ida ao Mercado Livre. Oitenta cobre o acumulado de hoje numa
 * passada e ainda cabe folga no tempo da função.
 */
const TETO = 80;

interface Conexao {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string | null;
  status: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = urlDoProjeto();
  const serviceRoleKey = chaveSecreta();

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Função mal configurada no servidor.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: segredo } = await admin
    .from('segredos_internos')
    .select('valor')
    .eq('nome', 'renovar-caidas')
    .maybeSingle();

  const recebido = req.headers.get('x-segredo');

  if (!segredo?.valor || !recebido || recebido !== segredo.valor) {
    return json({ error: 'Não autorizado.' }, 401);
  }

  const { data: caidas, error: erroDaBusca } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status')
    .eq('status', 'disconnected')
    .not('refresh_token', 'is', null)
    .neq('refresh_token', '')
    // As mais recentes primeiro: refresh token do Mercado Livre vale uns seis
    // meses, então a chance de uma conta voltar cai com o tempo parada.
    .order('updated_at', { ascending: false })
    .limit(TETO);

  if (erroDaBusca) {
    return json({ error: erroDaBusca.message }, 500);
  }

  const lista = (caidas ?? []) as Conexao[];

  let voltaram = 0;
  let precisamReconectar = 0;
  let falharam = 0;
  const motivos: Record<string, number> = {};

  for (const conexao of lista) {
    const resultado = await obterAccessToken(admin, conexao);

    if (resultado.ok) {
      voltaram += 1;
      continue;
    }

    if (resultado.precisaReconectar) {
      precisamReconectar += 1;
    } else {
      falharam += 1;
    }

    const motivo = (resultado.motivo ?? 'sem motivo').slice(0, 80);
    motivos[motivo] = (motivos[motivo] ?? 0) + 1;
  }

  const resumo = {
    tentadas: lista.length,
    voltaram,
    precisam_reconectar: precisamReconectar,
    falharam,
    motivos,
  };

  await admin.from('log_integracao_ml').insert({
    contexto: 'ml-renovar-caidas',
    mensagem: `${voltaram} de ${lista.length} conta(s) voltaram ao ar`,
    detalhes: resumo,
  });

  return json(resumo);
});
