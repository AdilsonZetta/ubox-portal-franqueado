import { describe, expect, it } from 'vitest'
import { montarCsv } from './csv'

describe('montarCsv', () => {
  it('usa BOM, CRLF, vírgulas e escapa campos especiais', () => {
    expect(montarCsv(['Título', 'Valor'], [['a,"b"', 0], ['x\ny', null], ['a;b', undefined]]))
      .toBe('\uFEFFTítulo,Valor\r\n"a,""b""",0\r\n"x\ny",\r\n"a;b",')
  })

  it('neutraliza fórmulas em campos de texto para planilhas', () => {
    expect(montarCsv(['Valor'], [['=1+1'], [' +2'], [-2]])).toBe("\uFEFFValor\r\n'=1+1\r\n' +2\r\n-2")
  })
})
