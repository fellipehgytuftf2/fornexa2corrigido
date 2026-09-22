// Sincroniza os produtos extraidos com a tabela catalog_products do Supabase
// de producao deste mesmo projeto (FORNEXA) -- ja em uso por vendedores de
// verdade. Os produtos ficam vinculados ao fornecedor "MS Digital" na tabela
// suppliers.
//
// Casamento produto do site <-> linha do banco:
//   1. por 'fornecedor_produto_id' (o id do produto no site da MS Digital),
//      que e estavel mesmo quando eles renomeiam o produto;
//   2. se nao achar, por NOME, e aproveita para gravar o id -- assim cada
//      produto so passa pelo nome uma vez na vida.
//   Antes era so por nome, e renomear um produto criava um DUPLICADO e marcava
//   o original como indisponivel. A MS Digital mexe no catalogo toda semana.
//
// Cuidados importantes (producao, banco real, ja tem dado de gente usando):
//   - NUNCA mexe no campo 'status' de produto que ja existe -- isso e controle
//     do app (ativo/inativo), nao tem relacao com o produto existir no site.
//   - So grava o que a coleta REALMENTE trouxe. Estoque sem numero, preco de
//     custo que o site nao mostra: ficam de fora do PATCH, e o Postgres mantem
//     o valor que ja estava la.
//   - Produto que existia antes e sumiu da coleta de hoje (foi descontinuado
//     no site) NAO e apagado -- so marcado como indisponivel_no_fornecedor.
//   - So escreve linha que mudou de verdade. A rodada inteira cabia mal nos
//     60s do plano Hobby porque reescrevia os ~870 produtos todo dia, mudando
//     ou nao; quando estourava, a Vercel matava a funcao no meio e metade do
//     catalogo ficava velha, sem ninguem saber qual metade.

import { mapComLimite } from "./concurrency.js";
import { chaveSecreta, urlDoProjeto } from "../chavesSupabase.js";

const NOME_FORNECEDOR = "MS Digital";
const CONCORRENCIA_GRAVACAO = 15;

// O que comparamos para decidir se vale gravar. 'updated_at' fica de fora de
// proposito: ele muda sempre e faria toda linha parecer diferente.
const CAMPOS_COMPARADOS = [
  "name",
  "description",
  "category",
  "image_url",
  "images",
  "supplier_price",
  "stock",
  "indisponivel_no_fornecedor",
];

function precoParaNumero(precoTexto) {
  if (!precoTexto) return null;
  const numero = parseFloat(precoTexto.replace("R$", "").trim().replace(/\./g, "").replace(",", "."));
  return Number.isNaN(numero) ? null : numero;
}

async function chamarSupabase(url, chave, caminho, opcoes = {}) {
  const resposta = await fetch(`${url}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
      ...opcoes.headers,
    },
  });
  const corpoTexto = await resposta.text();
  if (!resposta.ok) {
    throw new Error(`Supabase respondeu ${resposta.status} em ${caminho}: ${corpoTexto.slice(0, 300)}`);
  }
  // POST/PATCH com "Prefer: return=minimal" respondem com corpo vazio (201 ou 204,
  // varia por operacao) -- nunca da pra confiar so no status code pra saber se tem JSON
  if (!corpoTexto) return null;
  return JSON.parse(corpoTexto);
}

/**
 * O preco de CUSTO, e so ele.
 *
 * 'preco_varejo' foi tirado desta conta. Ele vem do catalogo da loja de varejo
 * (msdigitaldrop.com.br/c/varejosp), que e o preco do consumidor final -- a
 * loja de dropship nao mostra preco nenhum sem login. Enquanto o caminho com
 * login nao cabe no tempo da funcao, o fallback publico estava gravando o
 * preco de varejo como se fosse o custo do vendedor: no mesmo produto,
 * R$ 54,23 de varejo no lugar do custo real. O vendedor calculava margem
 * sobre um custo inflado e achava que a venda nao valia a pena.
 *
 * Sem preco de custo confiavel, devolve null -- e quem grava simplesmente nao
 * toca no campo.
 */
function precoDeCusto(produto) {
  return precoParaNumero(produto.preco_dropship || produto.preco);
}

/**
 * Monta os campos que a coleta de hoje tem autoridade para escrever.
 *
 * Regra geral: campo que a coleta nao apurou NAO entra no objeto. O PATCH so
 * mexe no que foi enviado, entao ficar de fora e o mesmo que dizer "nao sei,
 * mantem o que esta ai".
 */
function montarCamposAtuais(produto) {
  const campos = {
    // O nome entra na comparacao porque agora o produto e reconhecido pelo id
    // do site: quando a MS Digital renomeia, a linha certa e encontrada e o
    // nome novo desce junto, em vez de a rodada criar um duplicado.
    name: produto.nome,
    description: produto.descricao || "",
    category: produto.categoria || "Diversos",
    image_url: produto.imagem || "",
    images: produto.imagens && produto.imagens.length ? produto.imagens : produto.imagem ? [produto.imagem] : [],
  };

  const custo = precoDeCusto(produto);
  if (custo !== null) campos.supplier_price = custo;

  if (typeof produto.estoque === "number") campos.stock = produto.estoque;

  // Disponibilidade e estoque sao coisas diferentes, e a MS Digital responde
  // as duas na mesma linha da pagina do produto. 'disponivel' null e "a loja
  // nao disse" -- nesse caso nao afirmamos nada, nem que tem nem que falta.
  if (produto.disponivel === true) {
    campos.indisponivel_no_fornecedor = false;
  } else if (produto.disponivel === false) {
    campos.indisponivel_no_fornecedor = true;
    // "Indisponivel no momento" nao vem com numero. Zerar aqui e o ponto todo
    // do conserto: sem isso o produto ficava com a quantidade da ultima vez em
    // que teve estoque, e ainda marcado como disponivel.
    campos.stock = 0;
  }

  return campos;
}

/** Igualdade tolerante ao que o Postgres devolve (null vs "", "12.50" vs 12.5). */
function mesmoValor(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  }
  if (typeof a === "number" || typeof b === "number") {
    if (a === null || a === undefined || b === null || b === undefined) return false;
    return Number(a) === Number(b);
  }
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) === Boolean(b);
  return (a ?? "") === (b ?? "");
}

/** Só o que mudou de verdade, ou null quando a linha ja esta em dia. */
function apenasMudancas(campos, existente) {
  const diferencas = {};
  let mudou = false;

  for (const chave of CAMPOS_COMPARADOS) {
    if (!(chave in campos)) continue;
    if (mesmoValor(campos[chave], existente[chave])) continue;
    diferencas[chave] = campos[chave];
    mudou = true;
  }

  return mudou ? diferencas : null;
}

/**
 * Le os produtos que ja existem sob este fornecedor.
 *
 * Tenta com 'fornecedor_produto_id' e, se a coluna ainda nao existir no banco
 * (migracao 20260921140000 nao rodada), repete sem ela. O deploy do codigo e
 * automatico e a migracao e rodada a mao -- entre um e outro, a sincronizacao
 * continua funcionando, so que casando por nome como antes.
 */
async function lerExistentes(url, chave, supplierId) {
  const comuns = "id,name,indisponivel_no_fornecedor,description,category,image_url,images,supplier_price,stock";
  try {
    const linhas = await chamarSupabase(
      url,
      chave,
      `catalog_products?supplier_id=eq.${supplierId}&select=${comuns},fornecedor_produto_id`
    );
    return { linhas, temColunaId: true };
  } catch {
    const linhas = await chamarSupabase(url, chave, `catalog_products?supplier_id=eq.${supplierId}&select=${comuns}`);
    return { linhas, temColunaId: false };
  }
}

/**
 * Deixa registrado o que a rodada fez.
 *
 * Ate agora o resultado da sincronizacao era devolvido em JSON para quem
 * chamou -- e quem chama e o Cron da Vercel, que joga a resposta fora. Ou
 * seja: ninguem tinha como saber se rodou, por qual caminho, quantos produtos
 * mudaram, ou se parou de rodar semanas atras. "O estoque nao atualiza" nao
 * tinha onde ser conferido.
 *
 * Nunca derruba a sincronizacao: se o log falhar, o catalogo ja foi gravado e
 * isso e o que importa.
 */
export async function registrarRodada(mensagem, detalhes) {
  const url = urlDoProjeto();
  const chave = chaveSecreta();
  if (!url || !chave) return;

  try {
    await chamarSupabase(url, chave, "log_integracao_ml", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ contexto: "ms-digital-sync", mensagem, detalhes }),
    });
  } catch {
    // sem log e ruim, mas nao e motivo para a rodada contar como falha
  }
}

export async function salvarNoSupabase(produtos, opcoes = {}) {
  // marcarIndisponiveis so deve ficar false em testes com uma amostra pequena --
  // numa rodada de verdade (com o catalogo inteiro), precisa ficar true (padrao)
  // pra realmente detectar produto que saiu do site.
  const marcarIndisponiveis = opcoes.marcarIndisponiveis !== false;
  const url = urlDoProjeto();
  const chave = chaveSecreta();
  if (!url || !chave) {
    return { gravado: false, motivo: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nao configurados ainda" };
  }

  const fornecedores = await chamarSupabase(
    url,
    chave,
    `suppliers?name=eq.${encodeURIComponent(NOME_FORNECEDOR)}&select=id&limit=1`
  );
  if (!fornecedores.length) {
    throw new Error(
      `Fornecedor "${NOME_FORNECEDOR}" nao encontrado na tabela suppliers -- crie o cadastro no app antes de rodar a sincronizacao.`
    );
  }
  const supplierId = fornecedores[0].id;

  const { linhas: existentes, temColunaId } = await lerExistentes(url, chave, supplierId);

  const mapaPorId = new Map();
  const mapaPorNome = new Map();
  for (const linha of existentes) {
    if (linha.fornecedor_produto_id) mapaPorId.set(String(linha.fornecedor_produto_id), linha);
    mapaPorNome.set(linha.name, linha);
  }

  const idsEncontradosHoje = new Set();
  const nomesEncontradosHoje = new Set();

  const novos = [];
  const atualizacoes = [];
  let semMudanca = 0;
  let novosSemCusto = 0;

  for (const produto of produtos) {
    if (!produto.nome) continue;

    const produtoId = produto.id != null ? String(produto.id) : null;
    if (produtoId) idsEncontradosHoje.add(produtoId);
    nomesEncontradosHoje.add(produto.nome);

    const existente = (produtoId && mapaPorId.get(produtoId)) || mapaPorNome.get(produto.nome);
    const campos = montarCamposAtuais(produto);

    if (existente) {
      const diferencas = apenasMudancas(campos, existente);

      // Produto reconhecido pelo nome que ainda nao tem o id gravado: grava
      // agora, para o proximo renomeio nao criar duplicado.
      const precisaGravarId = temColunaId && produtoId && !existente.fornecedor_produto_id;

      if (!diferencas && !precisaGravarId) {
        semMudanca += 1;
        continue;
      }

      const payload = { ...(diferencas ?? {}), updated_at: new Date().toISOString() };
      if (precisaGravarId) payload.fornecedor_produto_id = produtoId;

      atualizacoes.push({ id: existente.id, campos: payload });
      continue;
    }

    // Produto novo. Sem preco de custo, entra INATIVO: aparece na Gestao do
    // Catalogo para o admin precificar e ativar, mas nao vai para a vitrine do
    // vendedor com um custo que ninguem apurou. Antes entrava ativo com o
    // preco de varejo no lugar do custo.
    const custo = precoDeCusto(produto);
    if (custo === null) novosSemCusto += 1;

    const linhaNova = {
      supplier_id: supplierId,
      stock: typeof produto.estoque === "number" ? produto.estoque : 0,
      supplier_price: custo ?? 0,
      status: custo === null ? "inactive" : "active",
      indisponivel_no_fornecedor: produto.disponivel === false,
      updated_at: new Date().toISOString(),
      ...campos,
    };
    if (temColunaId && produtoId) linhaNova.fornecedor_produto_id = produtoId;

    novos.push(linhaNova);
  }

  let criados = 0;
  if (novos.length) {
    await chamarSupabase(url, chave, "catalog_products", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(novos),
    });
    criados = novos.length;
  }

  let erroAtualizacao = 0;
  await mapComLimite(atualizacoes, CONCORRENCIA_GRAVACAO, async ({ id, campos }) => {
    try {
      await chamarSupabase(url, chave, `catalog_products?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(campos),
      });
    } catch {
      erroAtualizacao++;
    }
  });

  // produtos que existiam antes, sob esse fornecedor, e nao apareceram na coleta de
  // hoje -- provavelmente saíram do site. Marca como indisponivel, sem apagar (preserva
  // historico/pedidos que ja referenciam esse produto). So roda numa sincronizacao
  // completa (ver 'marcarIndisponiveis' acima) -- numa amostra parcial, marcaria como
  // indisponivel todo produto que nao esta na amostra, o que seria errado.
  let sumiram = [];
  let erroSumidos = 0;
  if (marcarIndisponiveis) {
    sumiram = existentes.filter((p) => {
      if (p.indisponivel_no_fornecedor) return false;
      if (p.fornecedor_produto_id && idsEncontradosHoje.has(String(p.fornecedor_produto_id))) return false;
      return !nomesEncontradosHoje.has(p.name);
    });
    await mapComLimite(sumiram, CONCORRENCIA_GRAVACAO, async (p) => {
      try {
        await chamarSupabase(url, chave, `catalog_products?id=eq.${p.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ indisponivel_no_fornecedor: true, updated_at: new Date().toISOString() }),
        });
      } catch {
        erroSumidos++;
      }
    });
  }

  return {
    gravado: true,
    fornecedor_id: supplierId,
    no_banco_antes: existentes.length,
    criados,
    criados_sem_preco_de_custo: novosSemCusto,
    atualizados: atualizacoes.length - erroAtualizacao,
    sem_mudanca: semMudanca,
    marcados_indisponiveis: sumiram.length - erroSumidos,
    casamento_por_id: temColunaId,
    erros: erroAtualizacao + erroSumidos,
  };
}
