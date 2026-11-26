import { describe, expect, it } from 'vitest'
import { acessoAoManual, veTodosOsManuais } from './manuaisTrilha'

const itens = [
  { documentoId: 'm1', anteriorId: '', ativo: true, consultaLivre: false },
  { documentoId: 'm2', anteriorId: 'm1', ativo: true, consultaLivre: false },
  { documentoId: 'm3', anteriorId: 'm2', ativo: true, consultaLivre: false },
  { documentoId: 'm9', anteriorId: '', ativo: false, consultaLivre: false },
]

describe('trilha como única porta dos manuais', () => {
  it('manual fora da trilha abre normalmente', () => {
    expect(acessoAoManual('outro', itens, [], false)).toEqual({ liberado: true, naTrilha: false, estado: null })
  })
  it('item inativo conta como fora da trilha', () => {
    expect(acessoAoManual('m9', itens, [], false).liberado).toBe(true)
  })
  it('primeiro manual está disponível e o seguinte bloqueado', () => {
    expect(acessoAoManual('m1', itens, [], false)).toMatchObject({ liberado: true, estado: 'disponivel' })
    expect(acessoAoManual('m2', itens, [], false)).toEqual({ liberado: false, naTrilha: true, estado: 'bloqueado' })
  })
  it('em andamento e concluído abrem', () => {
    const progresso = [
      { documentoId: 'm1', status: 'concluido' as const },
      { documentoId: 'm2', status: 'em_andamento' as const },
    ]
    expect(acessoAoManual('m1', itens, progresso, false).estado).toBe('concluido')
    expect(acessoAoManual('m2', itens, progresso, false).estado).toBe('em_andamento')
    expect(acessoAoManual('m3', itens, progresso, false).liberado).toBe(false)
  })
  it('concluído continua aberto mesmo se a ordem mudar', () => {
    expect(acessoAoManual('m3', itens, [{ documentoId: 'm3', status: 'concluido' }], false).liberado).toBe(true)
  })
  it('franqueadora vê tudo, mas não durante a simulação', () => {
    expect(acessoAoManual('m3', itens, [], true).liberado).toBe(true)
    expect(veTodosOsManuais({ papel: 'admin' }, false)).toBe(true)
    expect(veTodosOsManuais({ papel: 'equipe_franqueadora' }, false)).toBe(true)
    expect(veTodosOsManuais({ papel: 'admin' }, true)).toBe(false)
    expect(veTodosOsManuais({ papel: 'franqueado' }, false)).toBe(false)
    expect(veTodosOsManuais({ papel: 'equipe_franqueado' }, false)).toBe(false)
  })
})

it('permite consultar um manual bloqueado sem liberá-lo na trilha', () => {
  const consulta = itens.map((item) => ({ ...item, consultaLivre: true }))
  expect(acessoAoManual('m2', consulta, [], false)).toEqual({
    liberado: true, naTrilha: true, estado: 'bloqueado', consulta: true,
  })
  expect(acessoAoManual('m2', consulta, [], true)).toEqual({ liberado: true, naTrilha: true, estado: null })
})
