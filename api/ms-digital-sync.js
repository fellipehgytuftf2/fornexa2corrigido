// Endpoint chamado pelo Cron Job diario da Vercel (ver vercel.json) para
// manter o catálogo da MS Digital em dia dentro do FORNEXA — preço de
// dropship, estoque, categoria, imagens etc. Portado do projeto separado
// msdigital-scraper (github.com/Akira-Ishigami/msdigital-scraper), que já
// rodava isso sozinho contra este mesmo banco; a diferença aqui é que passa
// a viver dentro do próprio FORNEXA, em vez de um projeto Vercel à parte.
//
// ORDEM DAS FONTES:
//
//   1) login na loja + API interna -> a MELHOR fonte. Única com o preço de
//      custo (dropship) e com a quantidade exata de todo o catálogo de uma vez.
//   2) feed público (catalogo.md)  -> rápido (~9s para os 870 produtos) e
//      sempre responde. Traz disponibilidade e quantidade, mas não traz preço
//      de custo: a loja de dropship não mostra preço sem login.
//   3) llms.txt                    -> só se o link padrão do feed mudar.
//
// O comentário antigo aqui dizia que o login "leva 90–105s" e por isso nunca
// cabia nos 60s da função. Conferido no banco em 21/09/2026: os preços gravados
// são exatamente 80% do preço de varejo, ou seja, preço de dropship de verdade
// — o login COUBE e funcionou (a última rodada completa foi 14/09). Então ele
// continua vindo primeiro, com o prazo que já tinha.
//
// O que de fato derrubava a rodada era a gravação: ela reescrevia os ~870
// produtos todo dia, mudassem ou não. Login (40s) + coleta + 870 gravações não
// cabia em 60s, e a Vercel matava a função no meio — deixando parte do catálogo
// com dado velho. Agora só linha que mudou é gravada (ver supabase.js), e o
// caminho mais caro (login falha -> feed público -> gravar) cabe com folga.
//
// PARA QUANDO O PLANO MUDAR: no Vercel Pro o teto por função vai de 60s para
// 300s. Basta subir TETO_FUNCAO_MS e maxDuration (aqui e no vercel.json) que o
// login deixa de ter qualquer aperto.
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
// Quanto fica guardado para o que vem DEPOIS do login, se ele falhar: coletar
// o feed público (~9s) e gravar o que mudou.
const RESERVA_POS_LOGIN_MS = 15000;
// O prazo do login, quando o orçamento permite. Era este valor antes e a
// rodada de 14/09 mostrou que cabe.
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

function motivo(erro) {
  return String(erro && erro.message ? erro.message : erro);
}

async function rodarComFallback(inicio) {
  const tentativas = [];

  // 1. Login primeiro: é a única fonte do preço de custo e a que traz a
  // quantidade exata de todo o catálogo numa tacada. O prazo é o mesmo de
  // antes, mas agora sai de um orçamento explícito — se por algum motivo o
  // login demorar a começar, ele cede tempo em vez de estourar a função.
  const prazoLogin = Math.min(
    PRAZO_LOGIN_MS,
    TETO_FUNCAO_MS - (Date.now() - inicio) - RESERVA_POS_LOGIN_MS
  );

  if (prazoLogin > 0) {
    try {
      const produtos = await comPrazo(
        extrairViaLogin(process.env.MSDIGITAL_EMAIL, process.env.MSDIGITAL_SENHA),
        prazoLogin,
        `login nao terminou em ${prazoLogin}ms`
      );
      tentativas.push({ etapa: "login", ok: true, produtos: produtos.length });
      return { produtos, etapaUsada: "login", tentativas };
    } catch (erro) {
      tentativas.push({ etapa: "login", ok: false, erro: motivo(erro) });
    }
  } else {
    tentativas.push({ etapa: "login", ok: false, erro: "sem orcamento de tempo para o login" });
  }

  // 2. Feed público: sem preço de custo, mas com disponibilidade e quantidade
  // de todos os produtos. Melhor uma rodada sem preço do que nenhuma rodada.
  try {
    const produtos = await extrairViaFeedPublico();
    tentativas.push({ etapa: "feed_publico", ok: true, produtos: produtos.length });
    return { produtos, etapaUsada: "feed_publico", tentativas };
  } catch (erro) {
    tentativas.push({ etapa: "feed_publico", ok: false, erro: motivo(erro) });
  }

  // 3. Último recurso: descobrir o endereço do catálogo pelo llms.txt, caso o
  // link padrão tenha mudado.
  const produtos = await extrairViaLlmsTxt();
  tentativas.push({ etapa: "llms_txt", ok: true, produtos: produtos.length });
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
