// Endpoint chamado pelo Cron Job diario da Vercel (ver vercel.json) para
// manter o catálogo da MS Digital em dia dentro do FORNEXA — preço de
// dropship, estoque, categoria, imagens etc. Portado do projeto separado
// msdigital-scraper (github.com/Akira-Ishigami/msdigital-scraper), que já
// rodava isso sozinho contra este mesmo banco; a diferença aqui é que passa
// a viver dentro do próprio FORNEXA, em vez de um projeto Vercel à parte.
//
// Cadeia de fallback:
//   1) login na loja + API interna  -> traz preco real de dropship
//   2) feed publico (catalogo.md)   -> sem preco de dropship, mas com preco_varejo
//   3) llms.txt                     -> ultimo recurso, caso os links padrao mudem
//
// Ao final, grava no Supabase (catalog_products, casado por nome dentro do
// fornecedor "MS Digital" -- ver lib/ms-digital/supabase.js).

import { extrairViaLogin } from "./_lib/ms-digital/loginScrape.js";
import { extrairViaFeedPublico, extrairViaLlmsTxt } from "./_lib/ms-digital/publicScrape.js";
import { salvarNoSupabase } from "./_lib/ms-digital/supabase.js";

export const config = {
  maxDuration: 60, // maximo permitido no plano Hobby do Vercel
};

// IMPORTANTE: medido no projeto original, o caminho de login (paginando os
// ~860 produtos pela API interna, logado) leva 90-105s -- mais do que os 60s
// que o plano Hobby permite por funcao. Por isso o login roda com um prazo
// interno -- se nao terminar a tempo, desiste e cai pro feed publico (rapido,
// ~5-10s) pra garantir que a funcao sempre responde antes do Vercel matar
// por timeout.
const PRAZO_LOGIN_MS = 40000;

function comPrazo(promise, ms, mensagem) {
  let temporizador;
  const prazo = new Promise((_, reject) => {
    temporizador = setTimeout(() => reject(new Error(mensagem)), ms);
  });
  // evita "unhandled rejection" se a promise original falhar depois do prazo,
  // quando ninguem mais esta esperando o resultado dela
  promise.catch(() => {});
  return Promise.race([promise, prazo]).finally(() => clearTimeout(temporizador));
}

async function rodarComFallback() {
  const tentativas = [];

  try {
    const produtos = await comPrazo(
      extrairViaLogin(process.env.MSDIGITAL_EMAIL, process.env.MSDIGITAL_SENHA),
      PRAZO_LOGIN_MS,
      `login nao terminou em ${PRAZO_LOGIN_MS}ms (plano Hobby tem 60s no total por funcao)`
    );
    tentativas.push({ etapa: "login", ok: true });
    return { produtos, etapaUsada: "login", tentativas };
  } catch (erro) {
    tentativas.push({ etapa: "login", ok: false, erro: String(erro.message || erro) });
  }

  try {
    const produtos = await extrairViaFeedPublico();
    tentativas.push({ etapa: "feed_publico", ok: true });
    return { produtos, etapaUsada: "feed_publico", tentativas };
  } catch (erro) {
    tentativas.push({ etapa: "feed_publico", ok: false, erro: String(erro.message || erro) });
  }

  const produtos = await extrairViaLlmsTxt(); // se essa tambem falhar, deixa o erro subir
  tentativas.push({ etapa: "llms_txt", ok: true });
  return { produtos, etapaUsada: "llms_txt", tentativas };
}

export default async function handler(req, res) {
  // Protege o endpoint: so aceita chamadas do Cron da Vercel (que envia esse
  // header automaticamente) ou, em teste manual, com o CRON_SECRET certo.
  // Sem isso, qualquer um na internet poderia chamar este endpoint e forçar
  // gravações repetidas na tabela de catálogo de produção.
  const segredoConfigurado = process.env.CRON_SECRET;
  const autorizadoPeloCron = req.headers["x-vercel-cron"] != null;
  const autorizadoPeloSegredo =
    segredoConfigurado && req.headers.authorization === `Bearer ${segredoConfigurado}`;

  if (!autorizadoPeloCron && !autorizadoPeloSegredo) {
    res.status(401).json({ erro: "nao autorizado" });
    return;
  }

  const inicio = Date.now();
  try {
    const { produtos, etapaUsada, tentativas } = await rodarComFallback();

    let resultadoSupabase;
    try {
      resultadoSupabase = await salvarNoSupabase(produtos);
    } catch (erro) {
      resultadoSupabase = { gravado: false, erro: String(erro.message || erro) };
    }

    res.status(200).json({
      sucesso: true,
      etapaUsada,
      totalProdutos: produtos.length,
      tentativas,
      supabase: resultadoSupabase,
      duracaoMs: Date.now() - inicio,
    });
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: String(erro.message || erro),
      duracaoMs: Date.now() - inicio,
    });
  }
}
