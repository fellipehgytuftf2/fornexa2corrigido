// ============================================================================
// admin-aprender-categorias
//
// Preenche de uma vez a tabela de categorias do Mercado Livre, lendo os
// anúncios que os vendedores já publicaram.
//
// POR QUE
//
// Desde 22/10 o Mercado Livre não responde mais qual é a categoria de um
// produto, e a publicação passou a depender de uma categoria aprendida por
// categoria do catálogo. Só que o aprendizado acontece quando alguém publica
// — e quem publica está justamente travado. Começo frio, galinha e ovo.
//
// Esta varredura quebra o ciclo: pega anúncios já no ar, pergunta a categoria
// de cada um e preenche a tabela antes de o primeiro vendedor tentar de novo.
//
// SÓ LÊ DO MERCADO LIVRE, SÓ ESCREVE NA TABELA DE APRENDIZADO
//
// Nenhum anúncio é alterado.
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

  // Anúncios no ar, do mais novo para o mais velho: categoria recente reflete
  // a árvore atual do Mercado Livre melhor que uma de um ano atrás.
  const { data: anuncios } = await admin
    .from('user_products')
    .select('id, user_id, ml_item_id, announcement_category, name')
    .not('ml_item_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(400);

  const porCategoria = new Map<string, { item: string; user: string }[]>();

  for (const anuncio of anuncios ?? []) {
    const categoria = (anuncio.announcement_category ?? '').trim();

    if (!categoria || !anuncio.ml_item_id) continue;

    const lista = porCategoria.get(categoria) ?? [];

    // Três por categoria bastam: o objetivo é descobrir qual categoria do
    // Mercado Livre aquela gaveta usa, não auditar o catálogo inteiro.
    if (lista.length < 3) {
      lista.push({ item: String(anuncio.ml_item_id), user: String(anuncio.user_id) });
      porCategoria.set(categoria, lista);
    }
  }

  const tokens = new Map<string, string>();
  const aprendidas: Array<Record<string, unknown>> = [];
  const semResposta: string[] = [];

  for (const [categoria, itens] of porCategoria) {
    const votos = new Map<string, number>();

    for (const { item, user } of itens) {
      let token = tokens.get(user) ?? null;

      if (!token) {
        const { data: conexao } = await admin
          .from('ml_connections')
          .select('id, user_id, access_token, refresh_token, expires_at, status')
          .eq('user_id', user)
          .maybeSingle();

        if (!conexao) continue;

        const obtido = await obterAccessToken(admin, conexao);

        if (!obtido.ok) continue;

        token = obtido.accessToken;
        tokens.set(user, token);
      }

      const resposta = await fetch(`https://api.mercadolibre.com/items/${item}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resposta.ok) continue;

      const anuncio = await resposta.json().catch(() => null);
      const categoriaMl = anuncio?.category_id;

      if (typeof categoriaMl === 'string' && categoriaMl) {
        votos.set(categoriaMl, (votos.get(categoriaMl) ?? 0) + 1);
      }
    }

    const vencedora = [...votos.entries()].sort((a, b) => b[1] - a[1])[0];

    if (!vencedora) {
      semResposta.push(categoria);
      continue;
    }

    await admin.from('categorias_do_ml').upsert(
      {
        categoria,
        ml_category_id: vencedora[0],
        anuncios: vencedora[1],
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'categoria' }
    );

    aprendidas.push({ categoria, ml_category_id: vencedora[0], anuncios: vencedora[1] });
  }

  await admin.from('log_integracao_ml').insert({
    contexto: 'aprender-categorias',
    mensagem: `${aprendidas.length} categoria(s) do catálogo aprendidas.`,
    detalhes: { aprendidas, sem_resposta: semResposta },
  });

  return json({ ok: true, aprendidas, sem_resposta: semResposta });
});
