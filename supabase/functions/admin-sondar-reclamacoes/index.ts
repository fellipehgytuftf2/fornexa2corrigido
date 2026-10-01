// ============================================================================
// admin-sondar-reclamacoes
//
// Pergunta ao Mercado Livre se a aplicação PODE ler reclamações.
//
// POR QUE
//
// O FORNEXA passou a escutar o canal de pós-venda para abrir sozinho a
// devolução que o comprador pede depois de receber. Só que a notificação desse
// canal é rara: ela só nasce quando alguém reclama de verdade. Esperar por ela
// para descobrir que a permissão estava errada significa descobrir no pior dia
// possível — com um cliente reclamando e o relógio da mediação correndo.
//
// Esta sonda não espera. Ela lê as reclamações que já existem na conta. Se a
// API responde, o caminho está aberto e o dia da reclamação real vai só repetir
// o que já funcionou aqui. Se responde 403, a permissão da aplicação precisa
// mudar — e isso dá para arrumar numa terça-feira calma.
//
// SÓ LÊ
//
// Nenhuma devolução é aberta por aqui, nada é gravado em `devolucoes`. A sonda
// responde o que viu e para.
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

  let payload: { email?: string } = {};

  try {
    payload = await req.json();
  } catch {
    // Sem corpo: sonda a conta de quem chamou.
  }

  // Qual conexão usar.
  //
  // A permissão é da APLICAÇÃO, não do vendedor — então qualquer conexão viva
  // responde a pergunta. Mas poder escolher um vendedor ajuda quando a dúvida
  // é sobre uma conta específica, que talvez tenha conectado antes de a
  // permissão mudar e carregue um token com escopo antigo.
  let donoDaConexao = caller.id;

  if (payload.email) {
    const { data: encontrado } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', payload.email.trim())
      .maybeSingle();

    if (!encontrado) {
      return json({ error: 'Nenhuma conta com esse e-mail.' }, 404);
    }

    donoDaConexao = encontrado.id;
  }

  const { data: conexao } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status, external_account_id')
    .eq('user_id', donoDaConexao)
    .maybeSingle();

  if (!conexao) {
    return json(
      { error: 'Esta conta não tem conexão com o Mercado Livre. Escolha outra pelo e-mail.' },
      409
    );
  }

  const token = await obterAccessToken(admin, conexao);

  if (!token.ok) {
    return json({ error: 'A conexão desta conta expirou. Ela precisa reconectar.' }, 409);
  }

  // Os dois endereços do mesmo canal.
  //
  // O Mercado Livre moveu as reclamações para o caminho de pós-venda, mas o
  // antigo ainda responde em algumas contas. Perguntamos aos dois porque a
  // resposta interessante é "qual deles funciona AQUI" — e é esse que a sonda
  // do webhook vai acabar usando.
  const caminhos = [
    `/post-purchase/v1/claims/search?limit=3`,
    `/v1/claims/search?limit=3`,
  ];

  const tentativas: Array<Record<string, unknown>> = [];

  for (const caminho of caminhos) {
    const resposta = await fetch(`https://api.mercadolibre.com${caminho}`, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });

    const texto = await resposta.text();

    let corpo: unknown = null;
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = texto.slice(0, 400);
    }

    const lista = (corpo as { data?: unknown[]; results?: unknown[] } | null);
    const achadas = Array.isArray(lista?.data)
      ? lista.data.length
      : Array.isArray(lista?.results)
        ? lista.results.length
        : null;

    tentativas.push({
      caminho,
      http: resposta.status,
      // 403 quase sempre vem com o motivo escrito; sem ele a pessoa fica
      // adivinhando qual permissão marcar no painel.
      resposta: corpo,
      reclamacoes_encontradas: achadas,
    });
  }

  const algumPassou = tentativas.some((t) => t.http === 200);
  const algumNegou = tentativas.some((t) => t.http === 401 || t.http === 403);

  const veredito = algumPassou
    ? 'A aplicação consegue ler reclamações. Quando o Mercado Livre avisar de uma, a devolução abre sozinha.'
    : algumNegou
      ? 'O Mercado Livre recusou a leitura. A permissão "Venda e envios de um produto" precisa estar em Leitura e escrita no painel da aplicação — e a conta sondada talvez precise reconectar para pegar o escopo novo.'
      : 'Nenhum dos endereços respondeu como esperado. Veja o detalhe abaixo.';

  await admin.from('log_integracao_ml').insert({
    contexto: 'sonda-reclamacoes',
    mensagem: veredito,
    detalhes: { conta_ml: conexao.external_account_id, tentativas },
  });

  return json({ ok: algumPassou, veredito, tentativas });
});
