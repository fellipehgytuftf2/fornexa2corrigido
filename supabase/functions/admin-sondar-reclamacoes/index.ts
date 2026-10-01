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

  async function perguntar(caminho: string) {
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

  for (const caminho of caminhos) {
    await perguntar(caminho);
  }

  // A BUSCA NÃO É A PERGUNTA QUE IMPORTA
  //
  // O Mercado Livre bloqueia a busca de reclamações para quase toda aplicação
  // — responde 403 do "PolicyAgent" mesmo para quem consegue ler uma
  // reclamação específica. E ler uma específica é exatamente o que o webhook
  // faz: a notificação chega com o id na mão, ninguém precisa procurar.
  //
  // Então procuramos uma reclamação antiga nas vendas da conta e tentamos ler
  // ESSA. É esse resultado que diz se o canal novo vai funcionar.
  let idDeReclamacao: string | null = null;
  let pedidoDaReclamacao: string | null = null;

  for (const offset of [0, 50, 100]) {
    if (idDeReclamacao) break;

    const buscaDeVendas = await fetch(
      `https://api.mercadolibre.com/orders/search?seller=${encodeURIComponent(
        String(conexao.external_account_id)
      )}&sort=date_desc&limit=50&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token.accessToken}` } }
    );

    if (!buscaDeVendas.ok) break;

    const vendas = await buscaDeVendas.json().catch(() => null);
    const resultados = Array.isArray(vendas?.results) ? vendas.results : [];

    if (resultados.length === 0) break;

    for (const venda of resultados) {
      const mediacoes = Array.isArray(venda?.mediations) ? venda.mediations : [];

      if (mediacoes.length > 0 && mediacoes[0]?.id) {
        idDeReclamacao = String(mediacoes[0].id);
        pedidoDaReclamacao = String(venda?.id ?? '');
        break;
      }
    }
  }

  if (idDeReclamacao) {
    await perguntar(`/post-purchase/v1/claims/${idDeReclamacao}`);
    await perguntar(`/v1/claims/${idDeReclamacao}`);
  }

  const leituraDireta = tentativas.some(
    (t) => t.http === 200 && String(t.caminho).includes('claims/') && !String(t.caminho).includes('search')
  );
  const algumPassou = tentativas.some((t) => t.http === 200);
  const algumNegou = tentativas.some((t) => t.http === 401 || t.http === 403);

  const veredito = leituraDireta
    ? 'A aplicação lê reclamação pelo id — que é como o webhook recebe. O canal está pronto: quando o Mercado Livre avisar de uma, a devolução abre sozinha.'
    : !idDeReclamacao
      ? 'Esta conta não tem reclamação antiga para testar a leitura direta. A busca ser recusada é normal (o Mercado Livre bloqueia a busca para quase toda aplicação) e não diz nada sobre o canal. A primeira reclamação real vai ficar registrada no log, com o conteúdo cru, mesmo que não vire devolução.'
      : algumNegou
        ? 'O Mercado Livre recusou até a leitura de uma reclamação específica. A permissão "Venda e envios de um produto" precisa estar em Leitura e escrita no painel da aplicação, e a conta sondada precisa reconectar depois disso — o token guarda o escopo de quando foi criado.'
        : 'Nenhum dos endereços respondeu como esperado. Veja o detalhe abaixo.';

  await admin.from('log_integracao_ml').insert({
    contexto: 'sonda-reclamacoes',
    mensagem: veredito,
    detalhes: {
      conta_ml: conexao.external_account_id,
      reclamacao_testada: idDeReclamacao,
      pedido_da_reclamacao: pedidoDaReclamacao,
      tentativas,
    },
  });

  return json({
    ok: leituraDireta,
    veredito,
    reclamacao_testada: idDeReclamacao,
    pedido_da_reclamacao: pedidoDaReclamacao,
    tentativas,
    algumPassou,
  });
});
