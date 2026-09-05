// ============================================================================
// FORNEXA — ml-status-conta
// ============================================================================
// Responde se a conta do Mercado Livre do vendedor está apta a vender, e o que
// falta quando não está.
//
// POR QUE EXISTE
// A mesma checagem já era feita dentro de `ml-publish-product`, mas só no
// instante da publicação — depois de o vendedor escolher o produto, ajustar
// margem, revisar título e fotos. Quem estava bloqueado só descobria no fim, e
// muitas vezes com a mensagem genérica de recusa.
//
// Descobrir isso na tela de Integrações, logo depois de conectar, é a diferença
// entre "resolvo meu cadastro hoje" e "esse sistema não funciona".
//
// O Mercado Livre devolve o diagnóstico em GET /users/{id}, no campo `status`:
//
//   status.sell.allow    pode vender?
//   status.list.allow    pode anunciar?
//   status.billing.allow pode faturar?
//   status.*.codes       o que impede, em código
//   mercadoenvios        "not_accepted" quando não aceitou os termos
//
// Só lê. Nada aqui altera conta, nem no Mercado Livre nem no FORNEXA.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chavePublica, chaveSecreta, urlDoProjeto } from "../_shared/chaves.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Pendencia {
  codigo: string;
  titulo: string;
  oQueFazer: string;
  onde: string;
}

/**
 * Traduz os códigos do Mercado Livre em tarefas que o vendedor consegue fazer.
 *
 * O código cru não ajuda ninguém: "rejected_by_regulations" não diz onde
 * clicar. Cada item aqui responde três coisas — o que está errado, o que
 * fazer e onde fazer.
 */
function traduzirPendencias(status: Record<string, any>, dados: Record<string, any>): Pendencia[] {
  const pendencias: Pendencia[] = [];

  const codigos = new Set<string>([
    ...(status?.sell?.codes ?? []),
    ...(status?.list?.codes ?? []),
    ...(status?.billing?.codes ?? []),
  ]);

  if (codigos.has("address_pending")) {
    pendencias.push({
      codigo: "address_pending",
      titulo: "Endereço fiscal incompleto",
      oQueFazer:
        "Complete o endereço da sua conta com CEP, número e complemento. O Mercado Livre precisa dele para emitir nota.",
      onde: "Mercado Livre → Meu perfil → Endereço",
    });
  }

  if (codigos.has("rejected_by_regulations")) {
    pendencias.push({
      codigo: "rejected_by_regulations",
      titulo: "Conta não autorizada a vender",
      oQueFazer:
        "O Mercado Livre bloqueou a venda nesta conta. Abra 'Minha conta' e resolva o que ele apontar: costuma ser documento não validado, dados do Mercado Pago incompletos ou verificação de identidade pendente. Pessoa física com CPF pode vender — só abra CNPJ se o próprio Mercado Livre pedir.",
      onde: "Mercado Livre → Minha conta",
    });
  }

  // Conta pessoal do Mercado Pago não vende. Não vem como código de bloqueio,
  // mas é causa frequente do bloqueio acima — vale aparecer junto.
  if (dados?.status?.mercadopago_account_type === "personal") {
    pendencias.push({
      codigo: "mercadopago_personal",
      titulo: "Conta do Mercado Pago é pessoal",
      oQueFazer:
        "Vender no Mercado Livre exige conta de vendedor. A troca é feita no próprio Mercado Pago, em Tipo de conta, e pessoa física também pode fazer.",
      onde: "Mercado Pago → Seu perfil → Tipo de conta",
    });
  }

  if (dados?.status?.mercadoenvios === "not_accepted") {
    pendencias.push({
      codigo: "mercadoenvios_not_accepted",
      titulo: "Mercado Envios não aceito",
      oQueFazer:
        "Aceite os termos do Mercado Envios. Sem isso, seus anúncios não conseguem gerar etiqueta de envio.",
      onde: "Mercado Livre → Configurações → Envios",
    });
  }

  if (dados?.status?.confirmed_email === false) {
    pendencias.push({
      codigo: "email_nao_confirmado",
      titulo: "E-mail não confirmado",
      oQueFazer: "Confirme o e-mail da conta pelo link que o Mercado Livre enviou.",
      onde: "Caixa de entrada do e-mail cadastrado",
    });
  }

  return pendencias;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = urlDoProjeto();
  const serviceRoleKey = chaveSecreta();
  const anonKey = chavePublica();

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: "Função mal configurada no servidor." }, 500);
  }

  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    return json({ error: "Faça login novamente." }, 401);
  }

  const clienteDoChamador = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await clienteDoChamador.auth.getUser();

  if (!user) {
    return json({ error: "Faça login novamente." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // O token do vendedor fica no servidor e nunca chega ao navegador.
  const { data: conexao } = await admin
    .from("ml_connections")
    .select("access_token, ml_user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conexao?.access_token || !conexao?.ml_user_id) {
    return json({ conectado: false, apto: false, pendencias: [] });
  }

  const resposta = await fetch(
    `https://api.mercadolibre.com/users/${conexao.ml_user_id}`,
    { headers: { Authorization: `Bearer ${conexao.access_token}` } }
  );

  const dados = await resposta.json();

  if (!resposta.ok) {
    // Token vencido é o caso comum aqui, e tem solução própria: reconectar.
    return json({
      conectado: true,
      apto: false,
      erro_de_leitura: true,
      mensagem:
        "Não foi possível consultar sua conta no Mercado Livre. Reconecte a integração e tente de novo.",
      pendencias: [],
    });
  }

  const status = dados?.status ?? {};

  const podeVender = status?.sell?.allow === true;
  const podeAnunciar = status?.list?.allow === true;

  const pendencias = traduzirPendencias(status, dados);

  // Aptidão se decide por `sell.allow` e pela lista de pendências, não por
  // `list.allow`.
  //
  // `list.allow` pode vir falso SEM código nenhum, e isso não é pendência de
  // cadastro: é limite de anúncio, tipicamente a cota de anúncios grátis
  // esgotada. Exigir os dois fazia a tela acusar bloqueio numa conta que
  // publica normalmente — e pior, acusar com a lista de tarefas vazia, dizendo
  // que há um problema sem dizer qual.
  const apto = podeVender && pendencias.length === 0;

  // Aviso separado, e em outro tom: não é impedimento de conta, é limite de
  // quantos anúncios ela pode ter no ar sem pagar.
  const limiteDeAnuncios = apto && !podeAnunciar;

  // Pessoa física ou jurídica, segundo o próprio Mercado Livre.
  //
  // Deixou de ser detalhe no dia em que um envio parou em `invoice_pending`,
  // esperando nota fiscal. A conversa toda foi conduzida supondo que a conta
  // era CPF, e ninguém tinha conferido — supor o tipo da conta muda o
  // diagnóstico inteiro e leva a mandar o cliente atrás da coisa errada.
  //
  // `identification.type` é o campo direto; `company` só existe em conta
  // jurídica e serve de conferência.
  const identificacao = (dados?.identification ?? {}) as Record<string, unknown>;
  const tipoDeDocumento = String(identificacao?.type ?? '').toUpperCase() || null;
  const temEmpresa = Boolean(dados?.company);

  return json({
    conectado: true,
    apto,
    limite_de_anuncios: limiteDeAnuncios,
    pode_vender: podeVender,
    pode_anunciar: podeAnunciar,
    apelido: dados?.nickname ?? null,
    tipo_de_documento: tipoDeDocumento,
    pessoa_juridica: tipoDeDocumento === 'CNPJ' || temEmpresa,
    pendencias,
  });
});
