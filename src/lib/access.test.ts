import { describe, expect, it } from 'vitest'
import { calcularUids } from './access'

const franqueado = {
  uid: 'u1',
  ativo: true,
  papel: 'franqueado' as const,
  unidade: 'Uberaba',
}

describe('calcularUids', () => {
  it('não lista uids quando o item é público', () => {
    expect(
      calcularUids({ publico: true, unidades: ['Uberaba'], papeis: ['franqueado'], uidsExtra: ['u1'] }, [franqueado]),
    ).toEqual([])
  })

  it('inclui unidade, papel e pessoas, e ignora inativos', () => {
    const uids = calcularUids(
      { publico: false, unidades: ['Uberaba'], papeis: [], uidsExtra: ['extra'] },
      [franqueado, { uid: 'u2', ativo: false, papel: 'franqueado', unidade: 'Uberaba' }],
    )
    expect(uids.sort()).toEqual(['extra', 'u1'])
  })

  it('não trata unidade vazia como curinga', () => {
    expect(
      calcularUids({ publico: false, unidades: [''], papeis: [], uidsExtra: [] }, [franqueado]),
    ).toEqual([])
  })
})
