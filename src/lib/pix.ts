/**
 * Código PIX "copia e cola", montado aqui mesmo.
 *
 * O que o banco lê ao colar não é um link nem uma consulta a servidor: é um
 * texto com um formato fixo, o BR Code do Banco Central. Chave, valor e nome de
 * quem recebe vão dentro dele, e no fim um dígito verificador.
 *
 * POR QUE ISSO NÃO PRECISA DE BANCO NEM DE GATEWAY
 *
 * Montar o texto não move dinheiro. Quem move é o app do banco do vendedor,
 * quando ele cola e confirma. O FORNEXA não toca no dinheiro em momento
 * nenhum — o PIX sai da conta do vendedor direto para a do fornecedor.
 *
 * É por isso que este era o degrau mais alto que dava para subir sem contrato
 * com instituição financeira.
 */

/** Cada pedaço do código é: id + tamanho com dois dígitos + conteúdo. */
function campo(id: string, valor: string): string {
  const tamanho = String(valor.length).padStart(2, '0');

  return `${id}${tamanho}${valor}`;
}

/**
 * Tira acento, cedilha e qualquer coisa fora do ASCII.
 *
 * Nome e cidade viajam no código e alguns bancos recusam o que não for ASCII.
 * "MS Digital Comércio" precisa virar "MS DIGITAL COMERCIO" antes de entrar.
 */
function somenteAscii(texto: string, limite: number): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, limite);
}

/**
 * Dígito verificador do BR Code — CRC16/CCITT-FALSE.
 *
 * Calculado sobre o código inteiro, já incluindo "6304". Sem ele, ou com ele
 * errado, o banco recusa o código sem dizer por quê.
 */
function crc16(texto: string): string {
  let resultado = 0xffff;

  for (let i = 0; i < texto.length; i += 1) {
    resultado ^= texto.charCodeAt(i) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      resultado = resultado & 0x8000 ? ((resultado << 1) ^ 0x1021) & 0xffff : (resultado << 1) & 0xffff;
    }
  }

  return resultado.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Deixa a chave no formato que o diretório do PIX entende.
 *
 * O banco recusa com "a chave não foi encontrada" quando ela vai formatada do
 * jeito que a pessoa escreve. Um CNPJ está cadastrado como 12345678000190, mas
 * quem digita escreve 12.345.678/0001-90 — e aí a busca não acha nada, mesmo a
 * chave existindo.
 *
 * O reconhecimento é pelo que a pessoa DIGITOU, não por adivinhação de tipo:
 * onze dígitos podem ser um CPF ou um celular com DDD, e chutar errado troca a
 * chave por outra que pode ser de outra pessoa. Só normaliza o que a pontuação
 * deixa claro; o resto vai exatamente como foi escrito.
 */
export function normalizarChavePix(chave: string): string {
  const original = (chave || '').trim();

  if (!original) {
    return '';
  }

  if (original.includes('@')) {
    return original.toLowerCase();
  }

  // Parênteses ou o + na frente só aparecem em telefone.
  if (original.startsWith('+') || /[()]/.test(original)) {
    const digitos = original.replace(/\D/g, '');

    return `+${digitos.startsWith('55') ? digitos : `55${digitos}`}`;
  }

  // Ponto e barra só aparecem em CPF e CNPJ.
  if (/[./]/.test(original)) {
    return original.replace(/\D/g, '');
  }

  return original;
}

export interface DadosDoPix {
  chave: string;
  /** Quem recebe. Aparece na tela do banco antes de confirmar. */
  nome: string;
  cidade: string;
  valor: number;
  /**
   * Identificador da cobrança, até 25 caracteres. Volta no extrato e é o que
   * permite ao fornecedor saber a que se refere o dinheiro que caiu.
   */
  identificador?: string;
}

/**
 * Monta o código. Devolve string vazia quando falta chave ou o valor não é
 * positivo — sem isso o banco aceitaria um código que não cobra nada.
 */
export function montarCodigoPix(dados: DadosDoPix): string {
  const chave = normalizarChavePix(dados.chave || '');
  const valor = Number(dados.valor || 0);

  if (!chave || !(valor > 0)) {
    return '';
  }

  const nome = somenteAscii(dados.nome || 'FORNECEDOR', 25) || 'FORNECEDOR';
  const cidade = somenteAscii(dados.cidade || 'BRASIL', 15) || 'BRASIL';

  // "***" é o identificador neutro que o Banco Central define para quando não
  // há um. Vazio faz alguns bancos recusarem.
  const identificador = somenteAscii(dados.identificador || '', 25) || '***';

  const contaDoRecebedor = campo('00', 'BR.GOV.BCB.PIX') + campo('01', chave);

  const corpo =
    campo('00', '01') +
    // "11" é o código estático: a chave e o valor vão dentro do próprio texto.
    // "12" é o dinâmico, em que o texto carrega só um endereço que o banco
    // consulta para descobrir o valor. Marcar como dinâmico um código que não
    // tem endereço nenhum faz o aplicativo procurar o que não existe.
    campo('01', '11') +
    campo('26', contaDoRecebedor) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', valor.toFixed(2)) +
    campo('58', 'BR') +
    campo('59', nome) +
    campo('60', cidade) +
    campo('62', campo('05', identificador));

  const semDigito = `${corpo}6304`;

  return `${semDigito}${crc16(semDigito)}`;
}
