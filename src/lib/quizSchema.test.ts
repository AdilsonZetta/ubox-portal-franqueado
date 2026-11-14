import { describe, expect, it } from 'vitest'
import { aplicarGabarito, extrairItensTrilha, extrairPerguntas } from './quizSchema'

describe('schema flexível de quiz', () => {
  it('lê perguntas e gabarito em campos alternativos', () => {
    const perguntas = extrairPerguntas({
      questoes: [{ pergunta: 'Qual o horário?', alternativas: ['8h', '22h'], resposta: 'A' }],
    })
    expect(perguntas[0]?.correta).toBe(0)
    const comLista = aplicarGabarito(
      [{ id: 'p1', enunciado: 'P', opcoes: ['a', 'b'], correta: 0 }],
      [1],
    )
    expect(comLista[0]?.correta).toBe(1)
  })

  it('monta a trilha a partir de documentos e quizzes soltos', () => {
    const itens = extrairItensTrilha({
      documentos: ['ubx-ope-01'],
      quizzes: [{ id: 'quiz-ope', titulo: 'Quiz operacional' }],
    })
    expect(itens.map((item) => item.tipo)).toEqual(['documento', 'quiz'])
    expect(itens[1]?.refId).toBe('quiz-ope')
  })
})