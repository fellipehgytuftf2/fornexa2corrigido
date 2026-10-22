// ============================================================================
// admin-varrer-pj
//
// Quantos vendedores são PJ, e quantos deles vendem de verdade.
//
// POR QUE
//
// A nota fiscal de PJ depende de uma permissão nova no Mercado Livre e, com
// ela, de cada vendedor reconectar a conta. Antes de pedir isso a 400 pessoas,
// a pergunta é quantas seriam atendidas — e isso ninguém sabe de cabeça: o
// nome da loja ("KNSTORE", "AK STORE") não diz nada sobre CNPJ.
//
// O FORNEXA já sabe ler isso de uma conta, em `ml-status-conta`:
// `GET /users/{id}` traz `identification.type` (CPF ou CNPJ) e `company`, que
// só existe em conta empresarial. Esta função faz a mesma pergunta para todas
// as conexões, e conta.
//
// POR QUE SÓ QUEM VENDEU
//
// Conta parada não entra na conta do esforço: quem não vende não precisa de
// nota, e incluí-la inflaria o número que vai sustentar a decisão. O recorte
// padrão é quem teve pedido nos últimos 60 dias.
//
// SÓ LÊ
//
// Nenhuma permissão é mudada, nenhum vendedor é avisado. A varredura pode
// renovar o token de quem está com ele vencido — efeito do próprio uso normal
// do sistema, e que deixa a conexão melhor do que estava.
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
    data: { user: caller },
  } = await createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  }).auth.getUser();

  if (!caller) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: perfil } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();

  if (perfil?.role !== 'admin') {
    return json({ error: 'Apenas administradores.' }, 403);
  }

  let payload: { dias?: number; teto?: number } = {};

  try {
    payload = await req.json();
  } catch {
    // Sem corpo: usa o recorte padrão.
  }

  const dias = Math.min(Math.max(Number(payload.dias ?? 60), 1), 365);

  // Teto por rodada: cada conta é uma chamada ao Mercado Livre, e a função tem
  // tempo limitado. Quem tiver base maior roda de novo — o resultado é uma
  // contagem, não um cadastro.
  const teto = Math.min(Math.max(Number(payload.teto ?? 120), 1), 300);

  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const { data: pedidosRecentes } = await admin
    .from('orders')
    .select('user_id')
    .gte('created_at', desde);

  const vendedoresAtivos = [
    ...new Set(((pedidosRecentes ?? []) as { user_id: string }[]).map((o) => o.user_id)),
  ];

  if (vendedoresAtivos.length === 0) {
    return json({ ok: true, conclusao: 'Nenhum vendedor com pedido no período.', pj: [] });
  }

  const { data: conexoes } = await admin
    .from('ml_connections')
    .select('user_id, external_account_id, access_token, refresh_token, expires_at, status, id')
    .in('user_id', vendedoresAtivos.slice(0, teto));

  const pj: Array<Record<string, unknown>> = [];
  const pf: Array<Record<string, unknown>> = [];
  const naoLidos: Array<Record<string, unknown>> = [];

  for (const conexao of conexoes ?? []) {
    const token = await obterAccessToken(admin, conexao);

    if (!token.ok) {
      naoLidos.push({ user_id: conexao.user_id, motivo: 'conexão caída' });
      continue;
    }

    const resposta = await fetch(
      `https://api.mercadolibre.com/users/${conexao.external_account_id}`,
      { headers: { Authorization: `Bearer ${token.accessToken}` } }
    );

    if (!resposta.ok) {
      naoLidos.push({ user_id: conexao.user_id, motivo: `HTTP ${resposta.status}` });
      continue;
    }

    const dados = await resposta.json().catch(() => null);

    // Mesma leitura de `ml-status-conta`: o tipo do documento é o campo
    // direto, e `company` só existe em conta empresarial.
    const tipo = String(
      (dados?.identification as Record<string, unknown> | undefined)?.type ?? ''
    ).toUpperCase();

    const ehPj = tipo === 'CNPJ' || Boolean(dados?.company);

    const { data: dono } = await admin
      .from('profiles')
      .select('email, name, empresa')
      .eq('id', conexao.user_id)
      .maybeSingle();

    const linha = {
      email: dono?.email ?? null,
      nome: dono?.empresa || dono?.name || null,
      conta_ml: dados?.nickname ?? null,
      documento: tipo || null,
    };

    if (ehPj) pj.push(linha);
    else pf.push(linha);
  }

  const olhados = pj.length + pf.length;

  const conclusao =
    `${pj.length} de ${olhados} vendedores com venda nos últimos ${dias} dias são PJ (CNPJ).` +
    (naoLidos.length ? ` ${naoLidos.length} não puderam ser lidos.` : '');

  await admin.from('log_integracao_ml').insert({
    contexto: 'varredura-pj',
    mensagem: conclusao,
    detalhes: { dias, olhados, pj: pj.length, pf: pf.length, nao_lidos: naoLidos },
  });

  return json({
    ok: true,
    conclusao,
    dias,
    olhados,
    total_ativos: vendedoresAtivos.length,
    pj,
    pf: pf.length,
    nao_lidos: naoLidos,
  });
});
