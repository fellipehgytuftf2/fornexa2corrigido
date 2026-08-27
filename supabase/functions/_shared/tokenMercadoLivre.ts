// ============================================================================
// Token do Mercado Livre, num lugar só
// ============================================================================
// O REFRESH TOKEN DO MERCADO LIVRE VALE UMA VEZ SÓ. Cada renovação devolve um
// token novo e invalida o anterior no mesmo instante.
//
// Cinco funções deste projeto falam com o Mercado Livre, e três delas podem
// rodar ao mesmo tempo — o recebedor de webhook em especial, que chegou a ser
// chamado quinze vezes em trinta minutos para o mesmo pedido, porque o Mercado
// Livre reenvia quando não recebe resposta rápido.
//
// Cada chamada dessas lia o mesmo refresh token do banco e tentava renovar:
//
//   chamada 1  renova  -> Mercado Livre devolve token novo, salva
//   chamada 2  renova  -> recusado, o token que ela tinha já morreu
//   chamada 3  renova  -> recusado
//
// A primeira funcionava e as outras concluíam "a conexão expirou". Era isso
// que fazia o vendedor reconectar toda hora sem nada de errado com a conta.
//
// A saída é simples e é o padrão de quem integra OAuth: quando a renovação
// falhar, RELER O BANCO antes de desistir. Se outra chamada acabou de renovar,
// o token bom já está gravado lá — basta usar.
// ============================================================================

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface ConexaoMercadoLivre {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string | null;
  ml_user_id?: string | number | null;
}

export interface ResultadoDoToken {
  /** Token pronto para uso. Vazio quando não foi possível obter um. */
  accessToken: string;
  ok: boolean;
  /** Verdadeiro quando o refresh token morreu de vez e só reconectando. */
  precisaReconectar: boolean;
  motivo?: string;
}

/**
 * Margem antes de considerar o token vencido.
 *
 * Era de cinco minutos. Uma janela larga faz várias chamadas simultâneas
 * concluírem "está vencendo" ao mesmo tempo e correrem para renovar — que é
 * exatamente a corrida que se quer evitar. Sessenta segundos ainda cobre a
 * demora da própria chamada e reduz muito a sobreposição.
 */
const MARGEM_MS = 60 * 1000;

function estaValido(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return false;
  }

  return new Date(expiresAt).getTime() > Date.now() + MARGEM_MS;
}

/**
 * Devolve um token utilizável, renovando só se for preciso.
 *
 * Nunca lança. Quem chama decide o que fazer com a falha — o recebedor de
 * webhook precisa continuar respondendo ao Mercado Livre mesmo sem token.
 */
export async function obterAccessToken(
  supabase: SupabaseClient,
  conexao: ConexaoMercadoLivre
): Promise<ResultadoDoToken> {
  if (estaValido(conexao.expires_at)) {
    return { accessToken: conexao.access_token, ok: true, precisaReconectar: false };
  }

  const renovar = async (refreshToken: string) =>
    fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: Deno.env.get('ML_CLIENT_ID')!,
        client_secret: Deno.env.get('ML_CLIENT_SECRET')!,
        refresh_token: refreshToken,
      }),
    });

  const resposta = await renovar(conexao.refresh_token);
  const dados = await resposta.json().catch(() => ({}));

  if (resposta.ok && dados?.access_token) {
    await supabase
      .from('ml_connections')
      .update({
        access_token: dados.access_token,
        refresh_token: dados.refresh_token ?? conexao.refresh_token,
        expires_at: new Date(Date.now() + dados.expires_in * 1000).toISOString(),
        status: 'connected',
      })
      .eq('id', conexao.id);

    return { accessToken: dados.access_token, ok: true, precisaReconectar: false };
  }

  // Aqui está o conserto da corrida.
  //
  // A recusa quase sempre significa que OUTRA chamada renovou primeiro e o
  // token que esta tinha já não valia. Nesse caso o banco já guarda um token
  // bom — reler resolve, sem pedir nada ao vendedor.
  const { data: atual } = await supabase
    .from('ml_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('id', conexao.id)
    .maybeSingle();

  if (atual?.access_token && estaValido(atual.expires_at)) {
    return { accessToken: atual.access_token, ok: true, precisaReconectar: false };
  }

  // Outra chamada girou o refresh token, mas o access token dela ainda não
  // chegou ao banco — ou já venceu de novo. Com o token novo em mãos vale uma
  // segunda tentativa; sem ela, esta chamada desistiria de uma conexão que
  // está perfeitamente viva.
  if (atual?.refresh_token && atual.refresh_token !== conexao.refresh_token) {
    const segunda = await renovar(atual.refresh_token);
    const dadosDaSegunda = await segunda.json().catch(() => ({}));

    if (segunda.ok && dadosDaSegunda?.access_token) {
      await supabase
        .from('ml_connections')
        .update({
          access_token: dadosDaSegunda.access_token,
          refresh_token: dadosDaSegunda.refresh_token ?? atual.refresh_token,
          expires_at: new Date(Date.now() + dadosDaSegunda.expires_in * 1000).toISOString(),
          status: 'connected',
        })
        .eq('id', conexao.id);

      return {
        accessToken: dadosDaSegunda.access_token,
        ok: true,
        precisaReconectar: false,
      };
    }
  }

  // Agora sim: ninguém renovou e o refresh token morreu de vez. A tela precisa
  // parar de dizer "Conectada", senão o vendedor só descobre ao tentar
  // publicar — e conclui que o sistema está quebrado.
  //
  // O `.eq('refresh_token', ...)` não é enfeite: é o que impede desconectar
  // uma conexão que está boa.
  //
  // A corrida que sobrava era esta. Duas chamadas simultâneas, a primeira
  // renova no Mercado Livre e demora um instante para gravar. Nesse instante a
  // segunda lê o banco, vê o token velho, conclui "morreu" e grava
  // 'disconnected'. Se essa gravação cair DEPOIS da primeira, a conexão fica
  // marcada como caída com um token perfeitamente válido guardado — e o
  // vendedor reconecta sem que nada estivesse errado.
  //
  // Comparando o refresh token, a desconexão só acontece se ninguém tiver
  // girado nada nesse meio tempo.
  await supabase
    .from('ml_connections')
    .update({ status: 'disconnected' })
    .eq('id', conexao.id)
    .eq('refresh_token', conexao.refresh_token);

  // Sem registro não há como saber se a queda foi corrida, senha trocada,
  // aplicativo revogado ou refresh token de seis meses vencido — e essas
  // quatro pedem respostas diferentes.
  await supabase.from('log_integracao_ml').insert({
    contexto: 'token-mercado-livre',
    mensagem: 'Conexão marcada como desconectada',
    detalhes: {
      conexao_id: conexao.id,
      user_id: conexao.user_id,
      expirava_em: conexao.expires_at,
      resposta: dados,
    },
  });

  return {
    accessToken: '',
    ok: false,
    precisaReconectar: true,
    motivo: String(dados?.error_description ?? dados?.message ?? 'refresh_token inválido'),
  };
}
