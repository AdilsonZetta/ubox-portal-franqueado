import { describe, expect, it } from 'vitest'
import type { Usuario } from '../types'
import { opcoesDePedido, protocoloDe } from './pedidosUnidade'

const franqueado: Usuario = {
  uid: 'pessoa', email: '', nome: 'Pessoa', papel: 'franqueado', ativo: true,
  recusado: false, unidade: 'Unidade', cidade: '', unidadeId: 'unidade',
  modulosLiberados: ['marketing', 'estoque', 'chamados'],
}

describe('protocoloDe', () => {
  it.each([
    ['chamado', 'a1b2c3d4-5678-9000-abcd-000000000000', 'CH-A1B2C3D4'],
    ['arte', 'kL3mN4pQ5678qrstuvwx', 'MK-KL3MN4PQ'],
    ['reposicao', 'a-b_c.1234567', 'RP-ABC12345'],
  ] as const)('formata %s', (tipo, id, esperado) => {
    expect(protocoloDe(tipo, id)).toBe(esperado)
  })
})

describe('opcoesDePedido', () => {
  it('encaminha o franqueado aos três fluxos na ordem prevista', () => {
    expect(opcoesDePedido(franqueado, false).map(({ id, para }) => [id, para])).toEqual([
      ['arte', '/marketing/pedidos?novo=1'],
      ['reposicao', '/estoque?aba=pedidos'],
      ['franqueadora', '/chamados?novo=1'],
    ])
  })

  it('não oferece reposição à equipe da unidade', () => {
    expect(opcoesDePedido({ ...franqueado, papel: 'equipe_franqueado' }, true).map(({ id }) => id)).toEqual(['arte', 'franqueadora'])
  })

  it('não oferece pedidos sem módulos liberados', () => {
    expect(opcoesDePedido({ ...franqueado, modulosLiberados: undefined }, false)).toEqual([])
  })

  it('omite chamados quando falta o vínculo com a unidade', () => {
    expect(opcoesDePedido({ ...franqueado, unidadeId: null }, false).map(({ id }) => id)).toEqual(['arte', 'reposicao'])
  })

  it.each(['admin', 'equipe_franqueadora'] as const)('não oferece pedidos para %s', (papel) => {
    expect(opcoesDePedido({ ...franqueado, papel }, false)).toEqual([])
  })

  it('não oferece pedidos sem usuário', () => {
    expect(opcoesDePedido(null, false)).toEqual([])
  })
})
