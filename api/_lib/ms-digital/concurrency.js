// Roda 'tarefa' para cada item de 'itens', no maximo 'limite' de cada vez em
// paralelo. Necessario porque o Vercel (plano Hobby) tem um limite de tempo
// por funcao -- rodar centenas de requisicoes em serie estouraria esse limite.
export async function mapComLimite(itens, limite, tarefa) {
  const resultados = new Array(itens.length);
  let proximo = 0;

  async function trabalhador() {
    while (proximo < itens.length) {
      const indice = proximo++;
      resultados[indice] = await tarefa(itens[indice], indice);
    }
  }

  const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, trabalhador);
  await Promise.all(trabalhadores);
  return resultados;
}
