export interface Designado {
  uid: string
  nome: string
  unidadeId: string
  unidadeNome: string
}

export type SituacaoTreinamento = 'Não iniciou' | 'Em andamento' | 'Concluiu'

export function situacaoTreinamento(iniciou: boolean, concluidos: number, total: number): SituacaoTreinamento {
  if (!iniciou) return 'Não iniciou'
  return total > 0 && concluidos === total ? 'Concluiu' : 'Em andamento'
}

export function totaisTreinamento(pessoas: { situacao: SituacaoTreinamento }[]) {
  const totais = { Designados: pessoas.length, 'Não iniciou': 0, 'Em andamento': 0, Concluiu: 0 }
  for (const pessoa of pessoas) totais[pessoa.situacao]++
  return totais
}
