import { describe, expect, it } from 'vitest'
import { subconjunto } from '../data/modulos'
import { modulosEfetivos } from './modulosAcesso'
import type { Usuario } from '../types'

const base: Usuario = {
  uid: 'u',
  email: 'a@ubox.net.br',
  nome: 'Ana',
  papel: 'franqueado',
  ativo: true,
  recusado: false,
  unidade: 'Uberaba',
  cidade: 'Uberaba',
}

describe('módulos efetivos', () => {
  it('admin vê todos', () => {
    expect(modulosEfetivos({ ...base, papel: 'admin' })).toBeNull()
  })

  it('franqueado sem lista não recebe módulo', () => {
    expect(modulosEfetivos(base)).toEqual([])
  })

  it('lista explícita vale mesmo vazia', () => {
    expect(modulosEfetivos({ ...base, modulosLiberados: [] })).toEqual([])
  })

  it('equipe não recebe módulo fora do teto', () => {
    expect(subconjunto(['manuais', 'crm'], ['manuais'])).toBe(false)
    expect(subconjunto(['manuais'], ['manuais', 'universidade'])).toBe(true)
  })
})