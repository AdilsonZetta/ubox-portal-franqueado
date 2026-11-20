export function embaralharPergunta(pergunta, rng) {
  const opcoes = pergunta.opcoes.map((texto, indice) => ({ texto, indice }))
  for (let i = opcoes.length - 1; i > 0; i--) {
    const j = rng(i + 1)
    const atual = opcoes[i]
    opcoes[i] = opcoes[j]
    opcoes[j] = atual
  }
  return {
    ...pergunta,
    opcoes: opcoes.map(({ texto }) => texto),
    correta: opcoes.findIndex(({ indice }) => indice === pergunta.correta),
  }
}
