/**
 * Busca que entende como o vendedor digita.
 *
 * A busca do catálogo comparava o texto exato: "robo" não achava "Robô",
 * "cachorro robo" não achava "Cachorro Robô" e "fones" não achava "Fone".
 * Quem não digitava com acento, ou na ordem do nome, achava que o produto
 * não existia.
 *
 * Aqui o texto e a busca passam pela mesma limpeza — sem acento, sem
 * maiúscula, sem pontuação — e cada palavra digitada só precisa aparecer em
 * algum lugar, em qualquer ordem. Plural simples ("fones", "luzes") também
 * acha o singular.
 */

/** "Robô Inteligente Wi-fi" -> "robo inteligente wi fi". */
export function normalizarParaBusca(texto: string | null | undefined): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** As formas de uma palavra que contam como ela: "luzes" também vale "luz". */
function formasDaPalavra(palavra: string): string[] {
  const formas = [palavra];
  if (palavra.length > 4 && palavra.endsWith('es')) formas.push(palavra.slice(0, -2));
  if (palavra.length > 3 && palavra.endsWith('s')) formas.push(palavra.slice(0, -1));
  return formas;
}

/** As palavras da busca, já limpas. Vazio = sem busca. */
export function palavrasDaBusca(busca: string): string[] {
  return normalizarParaBusca(busca).split(' ').filter(Boolean);
}

/**
 * Quanto um texto combina com a busca: 0 é "não combina".
 *
 * Todas as palavras precisam aparecer em algum dos campos. Achar no nome vale
 * mais que achar na descrição, para o produto certo vir primeiro.
 */
export function pontuarBusca(
  palavras: string[],
  campos: { nome: string; outros?: string }
): number {
  if (palavras.length === 0) return 1;

  let pontos = 0;

  // "wifi" precisa achar "Wi-Fi", que depois da limpeza vira "wi fi".
  const contem = (campo: string, forma: string) =>
    campo.includes(forma) || campo.replace(/ /g, '').includes(forma);

  for (const palavra of palavras) {
    const formas = formasDaPalavra(palavra);
    const noNome = formas.some((forma) => contem(campos.nome, forma));
    const noResto = !noNome && formas.some((forma) => contem(campos.outros ?? '', forma));

    if (!noNome && !noResto) return 0;
    pontos += noNome ? 3 : 1;
  }

  // A busca inteira, na ordem digitada, dentro do nome: o mais parecido possível.
  if (campos.nome.includes(palavras.join(' '))) pontos += 5;

  return pontos;
}
