import { describe, expect, it } from 'vitest'
import { mapUnidadeSupabase, type LinhaUnidade } from './gestaoSupabase'
import { cnpjValido, filtrarUnidades, formatarCnpj, ufValida } from './unidades'

const linha: LinhaUnidade = {
  id: 'un-a', nome: 'UBOX Varginha', cidade: 'São Paulo', responsavel: '', email: '', uid: null,
  ativo: true, modulos_liberados: [], criado_por: null, criado_em: null, atualizado_em: null,
}

describe('unidades', () => {
  it('formata e valida os dígitos verificadores do CNPJ opcional', () => {
    expect(formatarCnpj('04252011000110')).toBe('04.252.011/0001-10')
    expect(formatarCnpj('04252')).toBe('04.252')
    expect(cnpjValido('04.252.011/0001-10')).toBe(true)
    expect(cnpjValido('')).toBe(true)
    expect(cnpjValido(formatarCnpj('042520110001100'))).toBe(false)
    for (const invalido of ['04.252.011/0001-11', '00000000000000', '123', 'x04252011000110']) {
      expect(cnpjValido(invalido)).toBe(false)
    }
  })

  it('aceita apenas siglas brasileiras, incluindo o Distrito Federal', () => {
    expect(ufValida('MG')).toBe(true)
    expect(ufValida('DF')).toBe(true)
    expect(ufValida('mg')).toBe(false)
    expect(ufValida('XX')).toBe(false)
    expect(ufValida('')).toBe(false)
  })

  it('mapeia UF e CNPJ e aceita linhas antigas', () => {
    expect(mapUnidadeSupabase({ ...linha, uf: 'SP', cnpj: '04252011000110' }))
      .toMatchObject({ uf: 'SP', cnpj: '04252011000110' })
    expect(mapUnidadeSupabase(linha)).toMatchObject({ uf: '', cnpj: '' })
  })

  it('combina status e busca por nome ou cidade sem distinguir acentos e maiúsculas', () => {
    const a = mapUnidadeSupabase(linha)
    const b = { ...a, id: 'un-b', nome: 'UBOX Araxá', cidade: 'Araxá', ativo: false }
    const unidades = [a, b]
    expect(filtrarUnidades(unidades, '  SAO PAULO ', 'ativas')).toEqual([a])
    expect(filtrarUnidades(unidades, 'ubox araxa', 'inativas')).toEqual([b])
    expect(filtrarUnidades(unidades, 'araxa', 'ativas')).toEqual([])
    expect(filtrarUnidades(unidades, '', 'todas')).toEqual(unidades)
  })
})
