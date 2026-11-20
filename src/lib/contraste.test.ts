import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { razaoContraste } from './contraste'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const cores = new Map([...css.matchAll(/--color-([\w-]+):\s*(#[\da-f]{6});/gi)].map(([, nome, hex]) => [nome, hex]))

function cor(nome: string): string {
  const hex = cores.get(nome)
  if (!hex) throw new Error(`Token ausente: --color-${nome}`)
  return hex
}

const pares = [
  ...['paper', 'surface', 'brand-tint', 'lime-tint'].flatMap((fundo) =>
    ['ink', 'ink-soft', 'muted', 'brand', 'lime-dark'].map((texto) => [texto, fundo]),
  ),
  ['white', 'brand'],
  ['surface', 'brand'],
  ['ink', 'lime'],
  ...['surface', 'line-strong', 'sidebar-muted'].map((texto) => [texto, 'graphite']),
]

describe('Contraste da identidade UBOX', () => {
  it('calcula os extremos da escala WCAG', () => {
    expect(razaoContraste('#ffffff', '#000000')).toBe(21)
    expect(razaoContraste('#23292A', '#23292A')).toBe(1)
  })

  it.each(pares)('%s sobre %s atende ao WCAG AA para texto normal', (texto, fundo) => {
    expect(razaoContraste(cor(texto), cor(fundo))).toBeGreaterThanOrEqual(4.5)
  })
})
