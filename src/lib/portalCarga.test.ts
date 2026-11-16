import { describe, expect, it } from 'vitest'
import { deveCarregar } from './portalCarga'
import type { Usuario } from '../types'

const base: Usuario = {
  uid: 'u',
  email: 'a@ubox.net.br',
  nome: 'Ana',
  papel: 'equipe_franqueadora',
  ativo: true,
  recusado: false,
  unidade: 'Rede',
  cidade: 'Uberaba',
  modulosLiberados: ['manuais'],
}

describe('carga do portal', () => {
  it('não busca universidade para quem só tem manuais', () => {
    expect(deveCarregar(base, 'manuais')).toBe(true)
    expect(deveCarregar(base, 'universidade')).toBe(false)
  })

  it('admin carrega os dois e lista ausente não libera', () => {
    expect(deveCarregar({ ...base, papel: 'admin', modulosLiberados: undefined }, 'universidade')).toBe(true)
    expect(deveCarregar({ ...base, papel: 'franqueado', modulosLiberados: undefined }, 'manuais')).toBe(false)
  })
})