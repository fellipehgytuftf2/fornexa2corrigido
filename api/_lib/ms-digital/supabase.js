// Sincroniza os produtos extraidos com a tabela catalog_products do Supabase
// de producao deste mesmo projeto (FORNEXA) -- ja em uso por vendedores de
// verdade. Os produtos ficam vinculados ao fornecedor "MS Digital" na tabela
// suppliers.
//
// A tabela catalog_products nao tem nenhuma coluna com o ID original do site
// da MS Digital -- so um 'id' proprio (uuid), gerado pelo Postgres. Por isso
// o casamento entre "produto que acabamos de puxar" e "produto que ja existe
// no banco" e feito por NOME (dentro do mesmo fornecedor): achou um nome
// igual, atualiza; nao achou, cria novo.
//
// Cuidados importantes (producao, banco real, ja tem dado de gente usando):
//   - NUNCA mexe no campo 'status' -- isso e controle do app (rascunho,
//     pausado, ativo etc.), nao tem relacao com o produto existir ou nao no
//     site do fornecedor.
//   - So sobrescreve 'stock' quando a coleta realmente trouxe um numero. Sem
//     isso, o campo fica de fora do PATCH e o Postgres mantem o valor que ja
//     estava la (PATCH so mexe nos campos enviados).
//   - Produto que existia antes e sumiu da coleta de hoje (foi descontinuado
//     no site) NAO e apagado -- so marcado como indisponivel_no_fornecedor.
//     Esse mesmo campo tambem e usado pelo Portal do Fornecedor para "estoque
//     zerado" (ver migração produto_sem_estoque_no_fornecedor.sql) -- como a
//     MS Digital não usa o Portal (é só uma fonte de catálogo, sem login),
//     essa sobreposição não tem efeito prático hoje, mas fica registrado aqui
//     caso um dia a MS Digital também passe a logar no Portal.

import { mapComLimite } from "./concurrency.js";
import { chaveSecreta, urlDoProjeto } from "../chavesSupabase.js";

const NOME_FORNECEDOR = "MS Digital";
const CONCORRENCIA_GRAVACAO = 15;

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
 * Monta os campos que sempre sao atualizados/criados a partir do que a
 * coleta trouxe hoje (nunca inclui 'status', ver comentario no topo).
 */
function montarCamposAtuais(produto) {
  const campos = {
    description: produto.descricao || "",
    category: produto.categoria || "Diversos",
    image_url: produto.imagem || "",
    images: produto.imagens && produto.imagens.length ? produto.imagens : produto.imagem ? [produto.imagem] : [],
    supplier_price: precoParaNumero(produto.preco_dropship || produto.preco || produto.preco_varejo),
    indisponivel_no_fornecedor: false, // encontrado na coleta de hoje = disponivel
    updated_at: new Date().toISOString(),
  };
  if (typeof produto.estoque === "number") campos.stock = produto.estoque;
  return campos;
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

  const existentes = await chamarSupabase(
    url,
    chave,
    `catalog_products?supplier_id=eq.${supplierId}&select=id,name,indisponivel_no_fornecedor`
  );
  const mapaPorNome = new Map(existentes.map((p) => [p.name, p]));
  const nomesEncontradosHoje = new Set();

  const novos = [];
  const atualizacoes = [];

  for (const produto of produtos) {
    if (!produto.nome) continue;
    nomesEncontradosHoje.add(produto.nome);
    const existente = mapaPorNome.get(produto.nome);
    const campos = montarCamposAtuais(produto);

    if (existente) {
      atualizacoes.push({ id: existente.id, campos });
    } else {
      novos.push({
        supplier_id: supplierId,
        name: produto.nome,
        stock: typeof produto.estoque === "number" ? produto.estoque : 0,
        status: "active", // so define status na CRIACAO -- depois disso e o app que decide
        ...campos,
      });
    }
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
    sumiram = existentes.filter((p) => !nomesEncontradosHoje.has(p.name) && !p.indisponivel_no_fornecedor);
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
    criados,
    atualizados: atualizacoes.length - erroAtualizacao,
    marcados_indisponiveis: sumiram.length - erroSumidos,
    erros: erroAtualizacao + erroSumidos,
  };
}
