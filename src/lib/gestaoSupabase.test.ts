import { describe, expect, it } from 'vitest'
import { mapUnidadeSupabase, patchUsuarioParaLinha } from './gestaoSupabase'

describe('mapUnidadeSupabase', () => {
  it('converte a linha para a Unidade do app', () => {
    expect(
      mapUnidadeSupabase({
        id: 'un-1',
        nome: 'Centro',
        cidade: null,
        responsavel: 'Ana',
        email: 'a@ubox.test',
        uid: null,
        modulos_liberados: null,
        ativo: true,
        criado_por: 'x',
        criado_em: '2026-11-20T12:00:00Z',
        atualizado_em: null,
      }),
    ).toMatchObject({ id: 'un-1', cidade: '', uid: null, modulosLiberados: [], ativo: true, criadoPor: 'x' })
  })
})

describe('patchUsuarioParaLinha', () => {
  it('troca camelCase por coluna e ignora o que não é editável', () => {
    const patch = { nome: ' Bia ', modulosLiberados: ['manuais'], ativo: false, uid: 'outro', email: 'x@y.z' } as never
    expect(patchUsuarioParaLinha(patch)).toEqual({ nome: 'Bia', modulos_liberados: ['manuais'], ativo: false })
  })
  it('patch vazio não grava nada', () => {
    expect(patchUsuarioParaLinha({})).toEqual({})
  })
})
