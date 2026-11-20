// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { describe, expect, it } from 'vitest'
import { podeGerirTrilha } from './manuaisTrilha'

describe('acesso à gestão de manuais', () => {
  const equipe = { papel: 'equipe_franqueadora', ativo: true, recusado: false, modulosLiberados: ['manuais'] }
  const admin = { ...equipe, papel: 'admin', modulosLiberados: [] }

  it('libera o admin em sua visão e a equipe com o módulo', () => {
    expect(podeGerirTrilha(admin, true)).toBe(true)
    expect(podeGerirTrilha(equipe, false)).toBe(true)
  })

  it('bloqueia a visão simulada, contas inativas ou recusadas e usuários sem permissão', () => {
    expect(podeGerirTrilha(admin, false)).toBe(false)
    expect(podeGerirTrilha({ ...admin, ativo: false }, true)).toBe(false)
    expect(podeGerirTrilha({ ...equipe, ativo: false }, false)).toBe(false)
    const recusado = { ...equipe, recusado: true }
    expect(podeGerirTrilha(recusado, false)).toBe(false)
    expect(podeGerirTrilha({ ...equipe, modulosLiberados: [] }, false)).toBe(false)
    expect(podeGerirTrilha({ ...equipe, modulosLiberados: undefined }, false)).toBe(false)
    expect(podeGerirTrilha({ ...equipe, papel: 'franqueado' }, false)).toBe(false)
    expect(podeGerirTrilha({ ...equipe, papel: 'equipe_franqueado' }, false)).toBe(false)
    expect(podeGerirTrilha(null, false)).toBe(false)
  })
})
