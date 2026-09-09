// ============================================================================
// supplier-order-label
//
// Entrega ao fornecedor a etiqueta de envio de um pedido dele, em PDF.
//
// Funciona como proxy. O fornecedor nunca vê token nem fala com o Mercado
// Livre: manda o id do pedido, a função confirma que o pedido é dele, pega o
// token do VENDEDOR dono do pedido, chama o Mercado Livre e devolve o PDF.
//
// Caminho, ao contrário das outras funções ml-*:
//   fornecedor (quem chamou) -> orders.supplier_id (confere dono)
//   -> orders.user_id (o vendedor) -> ml_connections do vendedor -> token
//
// O token não aparece na resposta em momento algum. O PDF não é gravado em
// lugar nenhum: vai direto para o navegador, porque salvar em Storage
// colocaria endereço de cliente num bucket.
//
// NÃO VERIFICADO EM PRODUÇÃO: escrito a partir da documentação do Mercado
// Livre, mas sem pedido real com envio em `ready_to_ship` para testar. Por
// isso os erros do ML são repassados traduzidos, com o status HTTP original,
// em vez de virarem uma mensagem genérica.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chavePublica, chaveSecreta, urlDoProjeto } from '../_shared/chaves.ts';
import { obterAccessToken } from '../_shared/tokenMercadoLivre.ts';
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';

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

/**
 * Traduz o erro do Mercado Livre para algo que o admin consiga agir.
 * Mantém o status original: 403 de elegibilidade e 404 de envio inexistente
 * exigem providências completamente diferentes.
 */
/**
 * Por que o Mercado Livre não gerou a etiqueta, no vocabulário de quem despacha.
 *
 * A recusa do endpoint de etiqueta vem sempre igual — NOT_PRINTABLE_STATUS —
 * sem dizer o que falta. O motivo está no envio, no campo `substatus`, e é ele
 * que separa "espere" de "alguém precisa fazer alguma coisa".
 *
 * A primeira versão desta função supunha que era sempre pagamento em aberto.
 * Estava errada: apareceu um pedido esperando NOTA FISCAL, e o fornecedor leu
 * "não é preciso fazer nada" enquanto o vendedor precisava agir.
 */
/**
 * A partir de quando a trava de remetente vale.
 *
 * Pedido feito antes disto passa mesmo com a origem errada. Não é indulgência:
 * o vendedor não tinha como saber da regra quando vendeu, e o Mercado Livre já
 * congelou o endereço daquele envio — travar agora não corrige endereço
 * nenhum, só cancela uma venda que já estava paga.
 *
 * A regra existe para o que vem depois. Para trás, o estrago já está feito, e
 * a devolução torta é menos ruim que o pedido cancelado.
 *
 * A DATA JÁ FOI ADIADA UMA VEZ, EM 07/09
 *
 * Entre 06 e 07/09 a trava pegou vendas de gente que ainda não tinha sido
 * avisada de nada: o aviso no painel e a tela antes de publicar nasceram
 * depois delas. Travar ali não corrigia endereço nenhum — só segurava pedido
 * pago de quem não tinha como saber.
 *
 * Adiar de novo esvazia a regra, e não é para virar hábito. O que justificou
 * esta vez foi o aviso: a partir daqui o vendedor sabe, vê a cidade de onde
 * seus envios saem e tem um botão para dizer que corrigiu.
 */
const REGRA_DO_REMETENTE_VALE_A_PARTIR_DE = new Date('2026-09-07T05:30:00Z');

/** Cidade e estado vêm ora como texto, ora como `{ id, name }`. */
const nomeDe = (valor: unknown): string | null => {
  if (typeof valor === 'string') return valor || null;
  if (valor && typeof valor === 'object') {
    const nome = (valor as Record<string, unknown>).name;
    return typeof nome === 'string' ? nome : null;
  }
  return null;
};

/**
 * "São José dos Pinhais" e "sao jose dos pinhais" são a mesma cidade.
 *
 * O fornecedor digita a cidade dele à mão no Portal; o Mercado Livre devolve a
 * dele com acento e maiúscula própria. Comparar cru acusaria erro onde não há.
 */
const mesmaCidade = (uma: string, outra: string) => {
  const simplificar = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .toLowerCase();

  return simplificar(uma) === simplificar(outra);
};

/**
 * Quando o Mercado Livre vai soltar um envio que ele está segurando.
 *
 * Vem em `buffering.date`. Sem ela a mensagem só sabia dizer "tente de novo
 * mais tarde" — e mais tarde quando? Quem separa pedido volta de hora em hora
 * clicando num botão que ainda não vai funcionar.
 */
function quandoLibera(envio: Record<string, unknown> | null): string | null {
  const buffering = envio?.buffering as Record<string, unknown> | null | undefined;
  const data = buffering?.date;

  if (typeof data !== 'string' || !data) return null;

  return new Date(data).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function motivoPeloSubstatus(
  substatus: string,
  envio: Record<string, unknown> | null
): string | null {
  if (substatus === 'buffered') {
    const quando = quandoLibera(envio);

    return (
      'O Mercado Livre está segurando este envio para liberar junto com ' +
      'outros. Não é preciso fazer nada — nem você, nem o vendedor. ' +
      (quando
        ? `A etiqueta libera em ${quando}.`
        : 'Ele não informou a hora exata; tente de novo mais tarde.')
    );
  }

  const motivos: Record<string, string> = {
    invoice_pending:
      'Falta a Declaração de Conteúdo (DC-e) deste pedido. Avise o vendedor: no FORNEXA, em Pedidos, ele emite pelo botão Emitir DC-e — e a etiqueta libera na sequência.',

    fraudulent:
      'O Mercado Livre bloqueou este envio por suspeita de fraude. NÃO despache este pedido: o pagamento pode ser revertido e a mercadoria se perde.',

    delivery_failed:
      'Este envio consta como entrega falhada no Mercado Livre. Fale com o vendedor antes de despachar de novo.',
  };

  return motivos[substatus] ?? null;
}

function traduzErroMl(status: number, corpo: string): string {
  if (status === 401) {
    return 'A conexão do vendedor com o Mercado Livre expirou. Peça para ele reconectar em Integrações.';
  }

  if (status === 403) {
    return (
      'O Mercado Livre recusou o acesso à etiqueta. Normalmente é permissão ' +
      'na conta do vendedor. Avise o suporte do FORNEXA.'
    );
  }

  if (status === 404) {
    return 'O Mercado Livre não encontrou este envio. Ele pode ter sido cancelado.';
  }

  // Última linha de defesa. Quando o substatus do envio explica o motivo, quem
  // responde é `motivoPeloSubstatus`, lá em cima — esta frase só aparece se o
  // Mercado Livre recusar com um substatus que ainda não conhecemos.
  if (corpo.includes('NOT_PRINTABLE_STATUS') || corpo.includes('SHPLAB0200')) {
    return (
      'A etiqueta ainda não foi liberada pelo Mercado Livre para este envio. ' +
      'Avise o suporte do FORNEXA para descobrirmos o motivo exato.'
    );
  }

  // O corpo cru fica no log, não na tela. Ele é JSON do Mercado Livre e não
  // ajuda quem está separando pedido.
  return `O Mercado Livre recusou a solicitação (${status}). Se continuar, avise o suporte do FORNEXA.`;
}

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

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();

  if (callerError || !caller) {
    return json({ error: 'Faça login novamente.' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Quem chamou é fornecedor?
  const { data: supplier, error: supplierError } = await admin
    .from('suppliers')
    .select('id, name, company_name, cep, city, state')
    .eq('auth_user_id', caller.id)
    .maybeSingle();

  if (supplierError) {
    return json({ error: `Não foi possível confirmar o fornecedor: ${supplierError.message}` }, 500);
  }

  if (!supplier) {
    return json({ error: 'Apenas fornecedores podem baixar etiquetas por aqui.' }, 403);
  }

  let payload: { pedido_id?: string; formato?: 'pdf' | 'zpl2' };

  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const pedidoId = payload.pedido_id?.trim();

  if (!pedidoId) {
    return json({ error: 'Informe o pedido.' }, 400);
  }

  // 2. O pedido é mesmo deste fornecedor?
  //    O filtro por supplier_id é o que impede um fornecedor de pedir a
  //    etiqueta do pedido de outro.
  const { data: pedido, error: pedidoError } = await admin
    .from('orders')
    .select('id, user_id, ml_shipment_id, status, created_at')
    .eq('id', pedidoId)
    .eq('supplier_id', supplier.id)
    .maybeSingle();

  if (pedidoError) {
    return json({ error: `Não foi possível carregar o pedido: ${pedidoError.message}` }, 500);
  }

  if (!pedido) {
    return json({ error: 'Pedido não encontrado para este fornecedor.' }, 404);
  }

  if (!pedido.ml_shipment_id) {
    return json(
      {
        error:
          'Este pedido ainda não tem envio gerado no Mercado Livre, então não há etiqueta para baixar.',
      },
      409
    );
  }

  // 2b. O pagamento foi confirmado?
  //     A view já esconde a etiqueta nesse caso, mas esta função é outra porta:
  //     quem souber chamá-la direto contornaria a trava sem esforço nenhum.
  //     Regra de dinheiro precisa valer em todas as entradas, não só na tela.
  const { data: liberado, error: erroLiberado } = await admin.rpc(
    'pedido_liberado_para_despacho',
    { p_order_id: pedidoId }
  );

  if (erroLiberado) {
    return json(
      { error: `Não foi possível conferir o pagamento: ${erroLiberado.message}` },
      500
    );
  }

  if (liberado === false) {
    return json(
      {
        error:
          'A etiqueta fica disponível depois que você confirmar o recebimento do pagamento deste pedido.',
      },
      409
    );
  }

  // 3. Token do VENDEDOR dono do pedido — nunca do fornecedor.
  const { data: connection, error: connectionError } = await admin
    .from('ml_connections')
    .select('id, user_id, access_token, refresh_token, expires_at, status')
    .eq('user_id', pedido.user_id)
    // Sem filtro por status, de proposito.
    //
    // Filtrar por 'connected' aqui tornava QUALQUER queda permanente: uma
    // falha de rede marcava a conexao como caida, e a partir dai esta
    // consulta nao achava mais a linha — nem para tentar renovar. O refresh
    // token continuava valido meses no banco e ninguem o usava.
    //
    // Era isso que obrigava o vendedor a reconectar toda hora: nao era a
    // conexao que morria, era o sistema que desistia dela e nunca mais
    // tentava.
    //
    // Quem decide se o token serve e `obterAccessToken`, logo abaixo. Ele
    // renova quando da, e devolve o status para 'connected' sozinho.
    .maybeSingle();

  if (connectionError) {
    return json({ error: `Não foi possível carregar a conexão: ${connectionError.message}` }, 500);
  }

  if (!connection) {
    return json(
      { error: 'O vendedor deste pedido não tem conexão ativa com o Mercado Livre.' },
      409
    );
  }

  const token = await obterAccessToken(admin, connection);

  if (!token.ok) {
    return json(
      { error: 'A conexão do vendedor com o Mercado Livre expirou. Peça para ele reconectar.' },
      409
    );
  }

  const accessToken = token.accessToken;

  // 4b. O envio sai mesmo do galpão do fornecedor?
  //
  //     A etiqueta leva o remetente, e o remetente é para onde a devolução
  //     volta. Se o vendedor não trocou o endereço de origem na conta dele, o
  //     pacote sai do galpão do fornecedor declarando a casa do vendedor — e a
  //     devolução vai bater na porta de quem não tem o que fazer com ela.
  //
  //     Depois de impressa, o Mercado Livre não deixa mais mudar o endereço
  //     daquele envio. Então ou se segura aqui, ou não se segura mais.
  //
  //     A comparação é por cidade porque o Mercado Livre mascara o CEP do
  //     remetente para aplicações de terceiros. Ver `ml-endereco-de-envio`.
  //     Vale só para pedido feito depois que a regra entrou. Ver
  //     `REGRA_DO_REMETENTE_VALE_A_PARTIR_DE`, lá em cima.
  const pedidoAlcancadoPelaRegra =
    new Date(pedido.created_at) >= REGRA_DO_REMETENTE_VALE_A_PARTIR_DE;

  const envioResposta = await fetch(
    `https://api.mercadolibre.com/shipments/${encodeURIComponent(pedido.ml_shipment_id)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const envio = envioResposta.ok
    ? ((await envioResposta.json()) as Record<string, unknown>)
    : null;

  // Esta é a leitura mais recente que existe do envio — mais nova que a da
  // sincronização, porque acabou de acontecer. Guardar aqui é o que faz o
  // cartão parar de dizer "pronto" logo depois de o Mercado Livre recusar.
  if (envio?.substatus) {
    const buffering = envio?.buffering as Record<string, unknown> | null | undefined;

    await admin
      .from('orders')
      .update({
        ml_shipment_substatus: String(envio.substatus),
        ml_shipment_visto_em: new Date().toISOString(),
        ml_liberacao_em: typeof buffering?.date === 'string' ? buffering.date : null,
      })
      .eq('id', pedido.id);
  }

  const remetente = (envio?.sender_address ?? {}) as Record<string, unknown>;
  const cidadeDeOrigem = nomeDe(remetente?.city);
  const estadoDeOrigem = nomeDe(remetente?.state);

  // Só bloqueia o que dá para provar errado. Sem cidade legível não há prova —
  // e travar por falha de leitura pararia o despacho por um soluço da API,
  // não por endereço errado. Fica registrado para não passar despercebido.
  //
  // O CEP entra na condição mesmo sem ser comparado: sem ele o cadastro do
  // fornecedor está pela metade, e endereço pela metade não trava despacho.
  const origemErrada = Boolean(
    cidadeDeOrigem &&
      supplier.city &&
      supplier.cep &&
      !mesmaCidade(cidadeDeOrigem, supplier.city)
  );

  if (origemErrada) {
    await admin.from('log_integracao_ml').insert({
      contexto: 'supplier-order-label',
      mensagem: pedidoAlcancadoPelaRegra
        ? 'Etiqueta bloqueada: origem não é a cidade do fornecedor'
        : 'Origem errada, liberada por ser pedido anterior à regra',
      detalhes: {
        pedido_id: pedido.id,
        shipment_id: pedido.ml_shipment_id,
        vendedor_id: pedido.user_id,
        origem_no_ml: [cidadeDeOrigem, estadoDeOrigem].filter(Boolean).join('/'),
        cidade_do_fornecedor: [supplier.city, supplier.state].filter(Boolean).join('/'),
        pedido_criado_em: pedido.created_at,
        bloqueado: pedidoAlcancadoPelaRegra,
      },
    });
  }

  if (origemErrada && pedidoAlcancadoPelaRegra) {
    return json(
      {
        error:
          `Este envio sairia declarando ${[cidadeDeOrigem, estadoDeOrigem]
            .filter(Boolean)
            .join('/')} como remetente, e não ${[supplier.city, supplier.state]
            .filter(Boolean)
            .join('/')}. A etiqueta fica bloqueada até o vendedor corrigir o ` +
          'endereço de origem na conta dele do Mercado Livre. Avise-o: é em ' +
          'Configurações → Meu perfil → Endereços, e no FORNEXA o endereço ' +
          'certo está pronto para copiar, em Integrações.',
        origem_errada: true,
      },
      409
    );
  }

  // 5. Busca a etiqueta.
  //    A etiqueta só existe quando o envio está em ready_to_ship no Mercado
  //    Livre; antes disso o próprio ML recusa.
  /**
   * PDF ou ZPL.
   *
   * O PDF sai no formato que a conta do VENDEDOR tem configurada no Mercado
   * Livre — A4 ou térmica. Não é parâmetro nosso, e por isso não adianta
   * pedir de outro jeito daqui.
   *
   * O ZPL é a linguagem das impressoras Zebra: vai direto para a impressora,
   * no tamanho exato, sem passar por página nenhuma. Quem tem térmica prefere
   * este, e é a única saída quando a conta do vendedor está em A4.
   *
   * O Mercado Livre devolve o ZPL dentro de um ZIP, junto com o PDF da PLP.
   */
  const zpl = payload.formato === 'zpl2';

  const labelResponse = await fetch(
    `https://api.mercadolibre.com/shipment_labels?shipment_ids=${encodeURIComponent(
      pedido.ml_shipment_id
    )}&response_type=${zpl ? 'zpl2' : 'pdf'}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!labelResponse.ok) {
    const corpo = await labelResponse.text();
    console.error('Mercado Livre recusou a etiqueta:', labelResponse.status, corpo);

    // A recusa não diz o que falta — só que não dá para imprimir. O motivo
    // está no envio, e uma consulta a mais separa "espere" de "o vendedor
    // precisa enviar a nota fiscal". Sem ela, o fornecedor ficava esperando um
    // pedido que nunca ia liberar sozinho.
    // O envio já foi lido acima, para conferir o remetente. Aproveita.
    const motivoDoEnvio = envio
      ? motivoPeloSubstatus(String(envio?.substatus ?? ''), envio)
      : null;

    // O JSON cru sai da tela do fornecedor e passa a viver aqui. Quem separa
    // pedido não tem o que fazer com ele; quem dá suporte, tem.
    await admin.from('log_integracao_ml').insert({
      contexto: 'supplier-order-label',
      mensagem: `Mercado Livre recusou a etiqueta (${labelResponse.status})`,
      detalhes: {
        pedido_id: pedido.id,
        shipment_id: pedido.ml_shipment_id,
        status: labelResponse.status,
        resposta: corpo.slice(0, 2000),
      },
    });

    return json(
      { error: motivoDoEnvio ?? traduzErroMl(labelResponse.status, corpo.slice(0, 500)) },
      labelResponse.status === 401 ? 409 : labelResponse.status
    );
  }

  let arquivo = await labelResponse.arrayBuffer();

  /**
   * Só a etiqueta, sem a DACE.
   *
   * O Mercado Livre entrega as duas no mesmo PDF: página 1 a etiqueta, página
   * 2 a Declaração de Conteúdo. Na impressora térmica isso vira uma etiqueta
   * adesiva cheia de texto miúdo que ninguém cola em lugar nenhum — adesivo
   * jogado fora em toda venda.
   *
   * A DACE continua inteira no botão dela, para sair em papel comum, que é
   * como se faz.
   *
   * Falhando, devolve o PDF como veio: etiqueta com página a mais é
   * inconveniente; etiqueta que não sai é pedido parado.
   */
  if (!zpl) {
    try {
      const original = await PDFDocument.load(arquivo);

      if (original.getPageCount() > 1) {
        const soAEtiqueta = await PDFDocument.create();
        const [primeira] = await soAEtiqueta.copyPages(original, [0]);

        soAEtiqueta.addPage(primeira);

        const bytes = await soAEtiqueta.save();
        arquivo = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer;
      }
    } catch (erro) {
      console.error('Não foi possível separar a etiqueta da DACE:', erro);
    }
  }

  return new Response(arquivo, {
    status: 200,
    headers: {
      ...corsHeaders,
      // `octet-stream` e nao `application/zip`: o cliente do Supabase decide
      // como ler a resposta pelo Content-Type, e para tipo que ele nao conhece
      // tenta ler como texto — o binario se perde e a chamada estoura. Com
      // octet-stream ele devolve um Blob, que e o que o navegador precisa.
      'Content-Type': zpl ? 'application/octet-stream' : 'application/pdf',
      // ZIP é para baixar, PDF é para abrir e conferir antes de imprimir.
      'Content-Disposition': zpl
        ? `attachment; filename="etiqueta-${pedido.ml_shipment_id}.zip"`
        : `inline; filename="etiqueta-${pedido.ml_shipment_id}.pdf"`,
    },
  });
});
