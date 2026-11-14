import { describe, expect, it } from 'vitest'
import { htmlParaTexto, pontuarBusca, trecho } from './text'

describe('busca', () => {
  it('prioriza o título', () => {
    const noTitulo = pontuarBusca('abertura', 'POP de abertura', 'rotina')
    const noCorpo = pontuarBusca('abertura', 'Rotina', 'na abertura da unidade')
    expect(noTitulo).toBeGreaterThan(noCorpo)
  })

  it('ignora acentos', () => {
    expect(pontuarBusca('operacao', 'Operação da loja', '')).toBeGreaterThan(0)
  })

  it('extrai texto e um trecho em volta do termo', () => {
    const texto = htmlParaTexto('<h1>Olá</h1><p>Guarde o contrato no box.</p>')
    expect(texto).toContain('Guarde o contrato')
    expect(trecho(`prefixo ${texto}`, 'contrato')).toContain('contrato')
  })
})
