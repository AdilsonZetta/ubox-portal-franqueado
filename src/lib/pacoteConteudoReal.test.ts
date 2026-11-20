import { expect, it } from 'vitest'
import arquivo from '../../content/pacotes/exemplo-minimo.json?raw'
import { verificarConteudoPacote } from '../../scripts/lib/verificar-pacote.mjs'

it('aceita o exemplo sintético', () => {
  expect(() => verificarConteudoPacote(JSON.parse(arquivo))).not.toThrow()
})

it('recusa texto exclusivo da franqueadora em campos aninhados', () => {
  const pacote = { cursos: [{ prova: { perguntas: [{ opcoes: ['Ficha de Qualificação'] }] } }] }
  expect(() => verificarConteudoPacote(pacote)).toThrow(/opcoes\.0 contém conteúdo exclusivo/)
})

it('recusa texto exclusivo apresentado em HTML', () => {
  expect(() => verificarConteudoPacote({ html: '<b>Circular</b>&nbsp;de Oferta' })).toThrow(/conteúdo exclusivo/)
})
