import type { Pergunta, Tentativa, Trilha, TrilhaItem } from '../types'

export interface ResultadoQuiz {
  acertos: number
  nota: number
  aprovado: boolean
}

export function corrigirQuiz(perguntas: Pick<Pergunta, 'correta'>[], respostas: number[], notaMinima: number): ResultadoQuiz {
  if (!perguntas.length) return { acertos: 0, nota: 0, aprovado: false }
  let acertos = 0
  perguntas.forEach((pergunta, indice) => {
    if (respostas[indice] === pergunta.correta) acertos += 1
  })
  const nota = Math.round((acertos / perguntas.length) * 100)
  return { acertos, nota, aprovado: nota >= notaMinima }
}

export function tentativaConfere(
  tentativa: Pick<Tentativa, 'nota' | 'aprovado' | 'respostas'>,
  perguntas: Pick<Pergunta, 'correta'>[],
  notaMinima: number,
): boolean {
  const resultado = corrigirQuiz(perguntas, tentativa.respostas, notaMinima)
  return resultado.nota === tentativa.nota && resultado.aprovado === tentativa.aprovado
}

export function leituraDaVersao(
  leituras: { uid: string; documentoId: string; versao: number }[],
  uid: string,
  documentoId: string,
  versao: number,
): boolean {
  return leituras.some((leitura) => leitura.uid === uid && leitura.documentoId === documentoId && leitura.versao === versao)
}

export function quizAprovado(tentativas: Pick<Tentativa, 'uid' | 'quizId' | 'aprovado'>[], uid: string, quizId: string): boolean {
  return tentativas.some((tentativa) => tentativa.uid === uid && tentativa.quizId === quizId && tentativa.aprovado)
}

export function trilhaConcluida(
  trilha: Pick<Trilha, 'itens'>,
  uid: string,
  documentos: { id: string; versao: number }[],
  leituras: { uid: string; documentoId: string; versao: number }[],
  tentativas: Pick<Tentativa, 'uid' | 'quizId' | 'aprovado'>[],
): boolean {
  if (!trilha.itens.length) return false
  return trilha.itens.every((item) => itemConcluido(item, uid, documentos, leituras, tentativas))
}

function itemConcluido(
  item: TrilhaItem,
  uid: string,
  documentos: { id: string; versao: number }[],
  leituras: { uid: string; documentoId: string; versao: number }[],
  tentativas: Pick<Tentativa, 'uid' | 'quizId' | 'aprovado'>[],
): boolean {
  if (item.tipo === 'quiz') return quizAprovado(tentativas, uid, item.refId)
  const documento = documentos.find((itemDocumento) => itemDocumento.id === item.refId)
  if (!documento) return false
  return leituraDaVersao(leituras, uid, documento.id, documento.versao)
}

export function ultimaTentativaAprovada(tentativas: Tentativa[], uid: string, quizIds: string[]): Tentativa | undefined {
  return tentativas
    .filter((tentativa) => tentativa.uid === uid && tentativa.aprovado && quizIds.includes(tentativa.quizId))
    .sort((a, b) => millis(b.respondidoEm) - millis(a.respondidoEm))[0]
}

function millis(valor: unknown): number {
  if (!valor) return 0
  if (typeof valor === 'number') return valor
  if (valor instanceof Date) return valor.getTime()
  if (typeof valor === 'object' && valor && 'toMillis' in valor && typeof valor.toMillis === 'function') {
    return valor.toMillis()
  }
  if (typeof valor === 'object' && valor && 'seconds' in valor && typeof valor.seconds === 'number') {
    return valor.seconds * 1000
  }
  return 0
}
