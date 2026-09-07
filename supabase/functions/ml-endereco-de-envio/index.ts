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
// confere se o vendedor já colou.
//
// E CONFERIR TAMBÉM NÃO É PELA LISTA DE ENDEREÇOS
//
// `GET /users/{id}/addresses` responde 403 para esta aplicação — permissão que
// não temos e não depende de nós.
//
// O caminho que funciona é o envio: cada pedido carrega o endereço de origem
// que o Mercado Livre usou, e a leitura de envios já é permitida. Então a
// conferência olha o último pedido do vendedor.
//
// E NEM ASSIM VEM O CEP
//
// No envio, o Mercado Livre mascara CEP, rua e número do remetente para
// aplicações de terceiros: devolve `XXXXXXX` no lugar. Cidade e estado ele
// deixa à vista — e é por eles que a conferência é feita.
//
// É menos preciso e é suficiente: o galpão do fornecedor fica em outra cidade
// que a casa do vendedor, que é justamente o erro que se quer pegar.
//
// A outra limitação é honesta e está na tela: antes da primeira venda não há
// envio para consultar, e aí resta a instrução.
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

/**
 * Cidade e estado vêm ora como texto, ora como `{ id, name }`, conforme o
 * formato do envio. Só interessa o nome.
 */
const nomeDe = (valor: unknown): string | null => {
  if (typeof valor === 'string') return valor || null;
  if (valor && typeof valor === 'object') {
    const nome = (valor as Record<string, unknown>).name;
    return typeof nome === 'string' ? nome : null;
  }
  return null;
};

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

  // O envio mais recente do vendedor. É dele que sai o endereço de origem
  // realmente usado — o que interessa, e não o que está cadastrado em tese.
  const { data: pedido } = await admin
    .from('orders')
    .select('ml_shipment_id, created_at')
    .eq('user_id', user.id)
    .not('ml_shipment_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pedido?.ml_shipment_id) {
    // Antes da primeira venda não há envio para consultar. Não é erro: é cedo.
    return json({ conectado: true, sem_envio_ainda: true });
  }

  const url = `https://api.mercadolibre.com/shipments/${encodeURIComponent(
    pedido.ml_shipment_id
  )}`;

  /**
   * O envio, no formato padrão.
   *
   * Sem `x-format-new` de propósito: no formato novo o endereço de origem vem
   * como `origin.snapshot`, que é só `{ id, version }` — uma referência, sem
   * endereço nenhum. O formato padrão traz `sender_address` inteiro.
   */
  const lerEnvio = async () => {
    const resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });

    if (!resposta.ok) {
      return { ok: false as const, status: resposta.status, corpo: await resposta.text() };
    }

    return { ok: true as const, envio: (await resposta.json()) as Record<string, unknown> };
  };

  /**
   * Onde o endereço pode estar, conforme o formato.
   *
   * Serve o primeiro que tiver CEP; se nenhum tiver, serve o primeiro que ao
   * menos diga a cidade. O Mercado Livre mascara CEP, rua e número do
   * remetente para aplicações de terceiros — devolve `XXXXXXX` no lugar —, mas
   * deixa cidade e estado à vista. É pouco, e é o bastante: o galpão do
   * fornecedor fica em outra cidade que a casa do vendedor.
   */
  const acharEndereco = (envio: Record<string, unknown>) => {
    const origem = (envio?.origin ?? {}) as Record<string, unknown>;

    const candidatos = [
      envio?.sender_address,
      origem?.shipping_address,
      origem?.snapshot,
      envio?.origin_address,
    ].map((candidato) => (candidato ?? {}) as Record<string, unknown>);

    const comCep = candidatos.find((endereco) => soDigitos(endereco?.zip_code));
    if (comCep) return { endereco: comCep, cep: soDigitos(comCep?.zip_code) };

    const comCidade = candidatos.find((endereco) => nomeDe(endereco?.city));
    if (comCidade) return { endereco: comCidade, cep: '' };

    return null;
  };

  const antigo = await lerEnvio();

  if (!antigo.ok) {
    await admin.from('log_integracao_ml').insert({
      contexto: 'ml-endereco-de-envio',
      mensagem: `Mercado Livre recusou a leitura do envio (${antigo.status})`,
      detalhes: {
        user_id: user.id,
        shipment_id: pedido.ml_shipment_id,
        status: antigo.status,
        resposta: antigo.corpo.slice(0, 1000),
      },
    });

    return json({ conectado: true, erro_de_leitura: true, status: antigo.status });
  }

  const achado = acharEndereco(antigo.envio);

  if (!achado) {
    // Sem isto a tela só sabe dizer "não conseguimos conferir", e o motivo
    // fica escondido. Guarda o envio inteiro, para poder ler o certo.
    await admin.from('log_integracao_ml').insert({
      contexto: 'ml-endereco-de-envio',
      mensagem: 'Envio lido, e sem nem cidade de origem',
      detalhes: {
        user_id: user.id,
        shipment_id: pedido.ml_shipment_id,
        campos_do_envio: Object.keys(antigo.envio ?? {}),
        envio: antigo.envio ?? null,
      },
    });

    return json({ conectado: true, sem_endereco_na_resposta: true });
  }

  return json({
    conectado: true,

    // Quando aquele envio saiu. A tela precisa disto para saber se o vendedor
    // já corrigiu o endereço DEPOIS dele: a origem do envio é um retrato
    // congelado no momento da venda e nunca muda, então sem a data a tela
    // acusaria para sempre um erro já consertado.
    envio_em: (antigo.envio?.date_created as string) ?? pedido.created_at ?? null,

    cep: achado.cep,
    cidade: nomeDe(achado.endereco?.city),
    estado: nomeDe(achado.endereco?.state),
  });
});
