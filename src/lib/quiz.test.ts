import { describe, expect, it } from 'vitest'
import { corrigirQuiz, tentativaConfere, trilhaConcluida } from './quiz'

const perguntas = [{ correta: 1 }, { correta: 0 }, { correta: 2 }, { correta: 1 }]

describe('corrigirQuiz', () => {
  it('calcula a nota no cliente', () => {
    const resultado = corrigirQuiz(perguntas, [1, 0, 2, 0], 70)
    expect(resultado).toEqual({ acertos: 3, nota: 75, aprovado: true })
  })

  it('reprova abaixo da nota mínima', () => {
    expect(corrigirQuiz(perguntas, [0, 0, 0, 0], 70).aprovado).toBe(false)
  })

  it('detecta nota gravada diferente do gabarito', () => {
    expect(tentativaConfere({ nota: 100, aprovado: true, respostas: [0, 0, 0, 0] }, perguntas, 70)).toBe(false)
  })
})

describe('trilhaConcluida', () => {
  it('exige leitura da versão atual e quiz aprovado', () => {
    const trilha = {
      itens: [
        { id: 'a', tipo: 'documento' as const, refId: 'doc-1', titulo: 'POP' },
        { id: 'b', tipo: 'quiz' as const, refId: 'quiz-1', titulo: 'Quiz' },
      ],
    }
    const documentos = [{ id: 'doc-1', versao: 2 }]
    const leituras = [{ uid: 'u', documentoId: 'doc-1', versao: 1 }]
    const tentativas = [{ uid: 'u', quizId: 'quiz-1', aprovado: true }]
    expect(trilhaConcluida(trilha, 'u', documentos, leituras, tentativas)).toBe(false)
    leituras.push({ uid: 'u', documentoId: 'doc-1', versao: 2 })
    expect(trilhaConcluida(trilha, 'u', documentos, leituras, tentativas)).toBe(true)
  })
})
