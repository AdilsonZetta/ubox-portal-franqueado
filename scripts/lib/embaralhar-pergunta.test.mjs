import { expect, it } from 'vitest'
import { embaralharPergunta } from './embaralhar-pergunta.mjs'

it('embaralha de forma determinística com o RNG injetado e mantém a resposta correta', () => {
  const pergunta = { id: 'p1', opcoes: ['A', 'B', 'C'], correta: 0 }
  const resultado = embaralharPergunta(pergunta, () => 0)
  expect(resultado).toEqual({ id: 'p1', opcoes: ['B', 'C', 'A'], correta: 2 })
  expect(resultado.opcoes[resultado.correta]).toBe(pergunta.opcoes[pergunta.correta])
  expect(pergunta.opcoes).toEqual(['A', 'B', 'C'])
})
