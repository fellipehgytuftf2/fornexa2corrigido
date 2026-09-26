// ============================================================================
// admin-conferir-impressao
//
// Pergunta ao Mercado Livre, conta por conta, quem imprime em térmica.
//
// POR QUE
//
// O aviso diz quantos leram. Ler não é resolver: a pessoa fecha a janela, se
// distrai, e o fornecedor continua cortando folha com tesoura. Isto responde
// quem de fato trocou — e, por consequência, a quem ainda vale cobrar.
//
// O CUSTO
//
// Uma chamada por vendedor: não há endpoint que aceite uma lista de contas. Por
// isso é botão, e não rotina — roda quando alguém quer saber, não o tempo todo.
//
// O teto por chamada existe para uma base grande não estourar o tempo da
// função. Rodando de novo, continua de onde parou: a ordem começa por quem tem
// leitura mais velha.
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

/** Contas por chamada. */
const TETO = 40;

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

  const { data: conexoes } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status, external_account_id')
    .not('external_account_id', 'is', null)
    // Quem tem leitura mais velha primeiro, e quem nunca foi lido antes de
    // todos: rodando de novo, a varredura continua de onde parou.
    .order('impressao_vista_em', { ascending: true, nullsFirst: true })
    .limit(TETO);

  if (!conexoes || conexoes.length === 0) {
    return json({ ok: true, conferidas: 0 });
  }

  let conferidas = 0;
  let emA4 = 0;

  /** Quantas respostas inteiras já foram guardadas para leitura. */
  let sondadas = 0;

  for (const conexao of conexoes) {
    const token = await obterAccessToken(admin, conexao);

    if (!token.ok) continue;

    try {
      const resposta = await fetch(
        `https://api.mercadolibre.com/users/${encodeURIComponent(
          String(conexao.external_account_id)
        )}/shipping_preferences`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );

      if (!resposta.ok) continue;

      const preferencias = (await resposta.json()) as Record<string, unknown>;

      // Sonda: a documentação do Mercado Livre não lista o que esta resposta
      // traz — `thermal_printer` foi achado assim. A pergunta agora é se ela
      // também diz que a conta tem Flex ligado, o que hoje só se descobre
      // quando a venda já chegou marcada como `self_service`.
      if (sondadas < 3) {
        sondadas += 1;

        await admin.from('log_integracao_ml').insert({
          contexto: 'sonda-preferencias-de-envio',
          mensagem: `Campos: ${Object.keys(preferencias).join(', ')}`,
          detalhes: {
            user_id: conexao.user_id,
            resposta: JSON.stringify(preferencias).slice(0, 4000),
          },
        });
      }

      const bruto = preferencias?.thermal_printer;

      // Conta em térmica traz texto, como "ZPL2" — não `true`. Comparar com
      // booleano daria A4 em conta que já está certa.
      const termica = bruto === null || bruto === undefined ? false : Boolean(bruto);

      await admin
        .from('ml_connections')
        .update({
          impressao_termica: termica,
          impressao_vista_em: new Date().toISOString(),
        })
        .eq('id', conexao.id);

      conferidas += 1;
      if (!termica) emA4 += 1;
    } catch (erro) {
      // Uma conta que falha não pode parar a varredura das outras.
      console.error('Falha ao conferir impressão:', conexao.user_id, erro);
    }
  }

  return json({ ok: true, conferidas, em_a4: emA4 });
});
