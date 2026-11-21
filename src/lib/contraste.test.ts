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
  ['white', 'brand-dark'],
  ['brand-dark', 'paper'],
  ['lime-soft', 'graphite'],
  ['brand-soft', 'graphite'],
  ['surface', 'sidebar-field'],
  ['line-strong', 'sidebar-field'],
  ['sidebar-muted', 'sidebar-field'],
  ['surface', 'brand'],
  ['ink', 'lime'],
  ['ink', 'brand-soft'],
  ['brand-dark', 'surface'],
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

  it.each(['paper', 'surface', 'white', 'graphite', 'sidebar-field'])(
    'a borda de controle contrasta pelo menos 3:1 com %s',
    (fundo) => {
      expect(razaoContraste(cor('line-control'), cor(fundo))).toBeGreaterThanOrEqual(3)
    },
  )
  it.each(['paper', 'surface', 'white'])('o foco claro contrasta com %s', (fundo) => {
    expect(razaoContraste(cor('brand-dark'), cor(fundo))).toBeGreaterThanOrEqual(3)
  })
  it('o contorno do filtro ativo contrasta com o fundo da página', () => {
    expect(razaoContraste(cor('lime-dark'), cor('paper'))).toBeGreaterThanOrEqual(3)
  })
  it('o preenchimento da barra de progresso contrasta com a faixa', () => {
    expect(razaoContraste(cor('lime-dark'), cor('line'))).toBeGreaterThanOrEqual(3)
  })
  it('o foco lateral contrasta com grafite', () => {
    expect(razaoContraste(cor('brand-soft'), cor('graphite'))).toBeGreaterThanOrEqual(3)
  })
})
