// Endpoint chamado pelo Cron Job diario da Vercel (ver vercel.json) para
// manter o catálogo da MS Digital em dia dentro do FORNEXA — preço de
// dropship, estoque, categoria, imagens etc. Portado do projeto separado
// msdigital-scraper (github.com/Akira-Ishigami/msdigital-scraper), que já
// rodava isso sozinho contra este mesmo banco; a diferença aqui é que passa
// a viver dentro do próprio FORNEXA, em vez de um projeto Vercel à parte.
//
// ORDEM DAS FONTES — mudou, e o motivo importa:
//
//   1) feed público (catalogo.md)  -> rápido e sempre responde. Traz nome,
//      categoria, imagens, descrição e — o que mais faltava — a DISPONIBILIDADE
//      e a quantidade de cada produto. Não traz preço de custo: a loja de
//      dropship não mostra preço sem login.
//   2) login na loja + API interna -> a única fonte do preço de custo real.
//   3) llms.txt                    -> só se o link padrão do feed mudar.
//
// Antes o login vinha primeiro, com 40 dos 60 segundos da função reservados
// para ele. Só que o próprio login leva 90–105s (medido no projeto original,
// paginando os ~870 produtos pela API interna, que o servidor da loja
// serializa). Ou seja: toda rodada gastava 40s numa tentativa que nunca
// termina e depois tentava coletar E gravar o catálogo inteiro nos ~20s que
// sobravam. Quando não dava, a Vercel matava a função no meio da gravação e
// parte do catálogo ficava com o estoque velho — sem ninguém saber qual parte.
//
// Agora o feed público roda primeiro (~8s para os 870 produtos) e garante que
// a rodada TEM o que gravar. O login fica com o tempo que sobrar, e se ele
// terminar, os dados dele ganham — porque só ele tem o preço de custo.
//
// PARA QUANDO O PLANO MUDAR: no Vercel Pro o teto por função vai de 60s para
// 300s. Basta subir TETO_FUNCAO_MS (e maxDuration aqui embaixo e no
// vercel.json) que o login passa a caber e o preço de custo volta sozinho.
//
// Ao final, grava no Supabase (catalog_products, ver lib/ms-digital/supabase.js)
// e registra a rodada em log_integracao_ml.

import { extrairViaLogin } from "./_lib/ms-digital/loginScrape.js";
import { extrairViaFeedPublico, extrairViaLlmsTxt } from "./_lib/ms-digital/publicScrape.js";
import { salvarNoSupabase, registrarRodada } from "./_lib/ms-digital/supabase.js";

export const config = {
  maxDuration: 60, // maximo permitido no plano Hobby do Vercel
};

// Teto real da função, com folga para responder antes de a Vercel cortar.
const TETO_FUNCAO_MS = 55000;
// Quanto fica guardado para a gravação no Supabase, aconteça o que acontecer.
const RESERVA_GRAVACAO_MS = 15000;
// Abaixo disto nem vale começar o login: não dá tempo nem de abrir o navegador.
const PRAZO_LOGIN_MINIMO_MS = 20000;

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

function motivo(erro) {
  return String(erro && erro.message ? erro.message : erro);
}

async function rodarComFallback(inicio) {
  const tentativas = [];

  // 1. Feed público — o piso da rodada. Se ele responder, a sincronização já
  // tem o que gravar mesmo que todo o resto falhe.
  let produtosPublicos = null;
  let etapaPublica = null;

  try {
    produtosPublicos = await extrairViaFeedPublico();
    etapaPublica = "feed_publico";
    tentativas.push({ etapa: "feed_publico", ok: true, produtos: produtosPublicos.length });
  } catch (erro) {
    tentativas.push({ etapa: "feed_publico", ok: false, erro: motivo(erro) });

    try {
      produtosPublicos = await extrairViaLlmsTxt();
      etapaPublica = "llms_txt";
      tentativas.push({ etapa: "llms_txt", ok: true, produtos: produtosPublicos.length });
    } catch (erroLlms) {
      tentativas.push({ etapa: "llms_txt", ok: false, erro: motivo(erroLlms) });
    }
  }

  // 2. Login — com o tempo que sobrou, nunca com o tempo que faz falta.
  const restante = TETO_FUNCAO_MS - (Date.now() - inicio) - RESERVA_GRAVACAO_MS;

  if (restante < PRAZO_LOGIN_MINIMO_MS) {
    tentativas.push({
      etapa: "login",
      ok: false,
      erro: `sem tempo: sobraram ${restante}ms do orcamento da funcao`,
    });
  } else {
    try {
      const produtos = await comPrazo(
        extrairViaLogin(process.env.MSDIGITAL_EMAIL, process.env.MSDIGITAL_SENHA),
        restante,
        `login nao terminou em ${restante}ms (teto de ${TETO_FUNCAO_MS}ms por funcao)`
      );
      tentativas.push({ etapa: "login", ok: true, produtos: produtos.length });
      return { produtos, etapaUsada: "login", tentativas };
    } catch (erro) {
      tentativas.push({ etapa: "login", ok: false, erro: motivo(erro) });
    }
  }

  if (!produtosPublicos) {
    throw new Error("nenhuma fonte respondeu: feed publico, llms.txt e login falharam");
  }

  return { produtos: produtosPublicos, etapaUsada: etapaPublica, tentativas };
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
    const { produtos, etapaUsada, tentativas } = await rodarComFallback(inicio);

    let resultadoSupabase;
    try {
      resultadoSupabase = await salvarNoSupabase(produtos);
    } catch (erro) {
      resultadoSupabase = { gravado: false, erro: motivo(erro) };
    }

    const resumo = {
      sucesso: true,
      etapaUsada,
      totalProdutos: produtos.length,
      tentativas,
      supabase: resultadoSupabase,
      duracaoMs: Date.now() - inicio,
    };

    await registrarRodada(
      resultadoSupabase.gravado
        ? `Catálogo da MS Digital sincronizado por ${etapaUsada}`
        : `Sincronização coletou por ${etapaUsada} mas não gravou`,
      resumo
    );

    res.status(200).json(resumo);
  } catch (erro) {
    const resumo = {
      sucesso: false,
      erro: motivo(erro),
      duracaoMs: Date.now() - inicio,
    };

    await registrarRodada("Sincronização do catálogo da MS Digital falhou", resumo);

    res.status(500).json(resumo);
  }
}
