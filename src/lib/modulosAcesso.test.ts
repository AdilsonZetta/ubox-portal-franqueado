import { describe, expect, it } from 'vitest'
import { subconjunto } from '../data/modulos'
import { modulosEfetivos, podeMostrarModulo } from './modulosAcesso'
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

describe('visibilidade dos módulos', () => {
  it.each(['admin', 'equipe_franqueadora'] as const)('mostra apenas os arquivos da rede para %s', (papel) => {
    const pessoa = { ...base, papel, modulosLiberados: ['nuvem', 'nuvem-rede'] }
    const visao = { ehAdmin: papel === 'admin', simulando: false }
    expect(podeMostrarModulo(pessoa, 'nuvem', visao)).toBe(false)
    expect(podeMostrarModulo(pessoa, 'nuvem-rede', visao)).toBe(true)
  })

  it.each(['franqueado', 'equipe_franqueado'] as const)('exige o módulo de arquivos da unidade para %s', (papel) => {
    const pessoa = { ...base, papel }
    const visao = { ehAdmin: false, simulando: false }
    expect(podeMostrarModulo(pessoa, 'nuvem', visao)).toBe(false)
    expect(podeMostrarModulo({ ...pessoa, modulosLiberados: ['nuvem'] }, 'nuvem', visao)).toBe(true)
  })

  it('respeita os módulos da unidade simulada', () => {
    const pessoa = { ...base, modulosLiberados: ['nuvem'] }
    const visao = { ehAdmin: false, simulando: true }
    expect(podeMostrarModulo(pessoa, 'nuvem', visao)).toBe(true)
    expect(podeMostrarModulo(pessoa, 'nuvem-rede', visao)).toBe(false)
    expect(podeMostrarModulo(base, 'nuvem', visao)).toBe(false)
  })
})
