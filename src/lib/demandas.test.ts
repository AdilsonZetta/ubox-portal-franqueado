import { describe, expect, it, vi } from 'vitest'
import { agruparPorDia, demandasDaUnidade, diaLocal, diasDoMes, podeAcessarDemandas, semanaDe, atrasada, filtrarDemandas, ordenarDemandas, ordenarListaDemandas, resumoDemandas, type Demanda } from './demandas'

import type { Usuario } from '../types'

const ambiente = vi.hoisted(() => ({ backend: 'supabase' }))
vi.mock('./backend', () => ({ get BACKEND() { return ambiente.backend } }))

const hoje = '2026-11-27'
const demanda = (id: string, dados: Partial<Demanda> = {}): Demanda => ({
  destino: 'interna', unidadeId: null, unidadeNome: null, grupoId: null, responsaveisNomes: {}, temResponsaveisUnidade: false,
  id, titulo: 'Revisão do catálogo', descricao: '', area: 'marketing', prioridade: 'media',
  prazo: null, status: 'a_fazer', anexos: [], responsaveis: ['eu'], criadoPor: 'outra',
  criadoPorNome: 'Outra pessoa', criadoEm: '', atualizadoEm: '', concluidaEm: null, ...dados,
})

describe('demandas', () => {
  it('considera em atraso apenas demandas abertas com prazo anterior ao dia de hoje', () => {
    expect(atrasada(demanda('1', { prazo: '2026-11-26' }), hoje)).toBe(true)
    expect(atrasada(demanda('2', { prazo: hoje }), hoje)).toBe(false)
    expect(atrasada(demanda('3', { prazo: '2026-11-26', status: 'concluida' }), hoje)).toBe(false)
    expect(atrasada(demanda('4'), hoje)).toBe(false)
  })

  it('ordena por atraso, prioridade e prazo sem alterar a lista original', () => {
    const lista = [
      demanda('sem', { prioridade: 'urgente' }),
      demanda('atrasada', { prioridade: 'baixa', prazo: '2026-11-26' }),
      demanda('hoje', { prioridade: 'urgente', prazo: hoje }),
      demanda('alta', { prioridade: 'alta', prazo: hoje }),
    ]
    expect(ordenarDemandas(lista, hoje).map((d) => d.id)).toEqual(['atrasada', 'hoje', 'sem', 'alta'])
    expect(lista[0].id).toBe('sem')
  })

  it('distingue atribuição, área, autoria e busca sem acentos', () => {
    const lista = [
      demanda('atribuida', { area: 'operacao' }),
      demanda('area', { responsaveis: [] }),
      demanda('autoria', { criadoPor: 'eu', responsaveis: [], area: null }),
    ]
    const filtrar = (escopo: 'minhas' | 'area' | 'criadas' | 'todas') =>
      filtrarDemandas(lista, { escopo, uid: 'eu', minhaArea: 'marketing', busca: 'revisao' }).map((d) => d.id)
    expect(filtrar('minhas')).toEqual(['atribuida'])
    expect(filtrar('area')).toEqual(['area'])
    expect(filtrar('criadas')).toEqual(['autoria'])
    expect(filtrar('todas')).toHaveLength(3)
    expect(filtrarDemandas(lista, { escopo: 'area', uid: 'eu', minhaArea: null })).toEqual([])
    expect(filtrarDemandas(lista, { escopo: 'todas', uid: 'eu', area: 'operacao', prioridade: 'alta' })).toEqual([])
  })

  it('resume apenas demandas abertas atribuídas e limita a lista a cinco', () => {
    const lista = [
      demanda('hoje', { prazo: hoje }),
      demanda('atrasada', { prazo: '2026-11-26' }),
      demanda('concluida', { prazo: hoje, status: 'concluida' }),
      demanda('outra', { prazo: hoje, responsaveis: [] }),
      ...Array.from({ length: 5 }, (_, i) => demanda(String(i))),
    ]
    expect(resumoDemandas(lista, 'eu', hoje)).toMatchObject({ abertas: 7, atrasadas: 1, paraHoje: 1 })
    expect(resumoDemandas(lista, 'eu', hoje).proximas.map((d) => d.id)).toEqual(['atrasada', 'hoje', '0', '1', '2'])
  })
})

describe('calendário e visão da unidade', () => {
  it('começa na segunda-feira e inclui as bordas de cada mês', () => {
    expect(diasDoMes(2026, 11).map(diaLocal)).toEqual(
      Array.from({ length: 42 }, (_, i) => diaLocal(new Date(2026, 9, 26 + i, 12))),
    )
    expect(semanaDe(new Date(2027, 0, 1, 12)).map(diaLocal)).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ])
  })

  it('ordena a lista por coluna e mantém itens sem prazo ao final', () => {
    const lista = [
      demanda('sem', { prioridade: 'media' }),
      demanda('hoje', { prazo: hoje, prioridade: 'urgente' }),
      demanda('antes', { prazo: '2026-11-25', prioridade: 'baixa' }),
    ]
    expect(ordenarListaDemandas(lista, 'prazo', false).map((d) => d.id)).toEqual(['antes', 'hoje', 'sem'])
    expect(ordenarListaDemandas(lista, 'prazo', true).map((d) => d.id)).toEqual(['hoje', 'antes', 'sem'])
    expect(ordenarListaDemandas(lista, 'prioridade', true).map((d) => d.id)).toEqual(['hoje', 'sem', 'antes'])
    expect(lista.map((d) => d.id)).toEqual(['sem', 'hoje', 'antes'])
  })

  it('agrupa prazos sem perder itens sem prazo', () => {
    const a = demanda('a', { prazo: hoje })
    const b = demanda('b', { prazo: hoje })
    const c = demanda('c')
    expect(agruparPorDia([a, b, c])).toEqual({ porDia: new Map([[hoje, [a, b]]]), semPrazo: [c] })
  })

  it('limita a unidade e distingue atribuições coletivas das individuais', () => {
    const coletiva = demanda('a', { destino: 'unidade', unidadeId: 'a', responsaveis: ['rede'] })
    const minha = demanda('b', { ...coletiva, id: 'b', temResponsaveisUnidade: true, responsaveis: ['eu'] })
    const outra = demanda('c', { ...minha, id: 'c', responsaveis: ['outra'] })
    const lista = [coletiva, minha, outra, demanda('d', { ...coletiva, id: 'd', unidadeId: 'b' }), demanda('e')]
    expect(demandasDaUnidade(lista, 'a', 'eu').map((d) => d.id)).toEqual(['a', 'b'])
    expect(demandasDaUnidade(lista, 'a').map((d) => d.id)).toEqual(['a', 'b', 'c'])
    expect(demandasDaUnidade(lista, null)).toEqual([])
    expect(filtrarDemandas(lista, { uid: 'eu', escopo: 'todas', destino: 'interna' }).map((d) => d.id)).toEqual(['e'])
    expect(filtrarDemandas(lista, { uid: 'eu', escopo: 'todas', destino: 'unidade', unidadeId: 'b' })
      .map((d) => d.id)).toEqual(['d'])
    expect(resumoDemandas(demandasDaUnidade(lista, 'a'), undefined, hoje).abertas).toBe(3)
  })
})

describe('acesso a demandas', () => {
  const franqueado: Usuario = {
    uid: 'unidade', email: 'conta@exemplo.test', nome: 'Franqueado', papel: 'franqueado',
    ativo: true, recusado: false, unidade: 'Unidade A', cidade: '', unidadeId: 'a',
  }
  const equipe: Usuario = { ...franqueado, papel: 'equipe_franqueado' }
  const admin: Usuario = { ...franqueado, papel: 'admin', unidadeId: null }

  it('permite rede ativa e pessoas ativas vinculadas à unidade no Supabase', () => {
    expect(podeAcessarDemandas(admin, false)).toBe(true)
    expect(podeAcessarDemandas({ ...admin, papel: 'equipe_franqueadora' }, false)).toBe(true)
    expect(podeAcessarDemandas(franqueado, false)).toBe(true)
    expect(podeAcessarDemandas(equipe, false)).toBe(true)
    expect(podeAcessarDemandas({ ...franqueado, unidadeId: null }, false)).toBe(false)
    expect(podeAcessarDemandas({ ...franqueado, ativo: false }, false)).toBe(false)
    expect(podeAcessarDemandas({ ...equipe, recusado: true }, false)).toBe(false)
  })

  it('permite a simulação de uma unidade válida por admin ativo', () => {
    expect(podeAcessarDemandas(admin, true, franqueado)).toBe(true)
    expect(podeAcessarDemandas(admin, true)).toBe(false)
    expect(podeAcessarDemandas(admin, true, admin)).toBe(false)
    expect(podeAcessarDemandas(equipe, true, franqueado)).toBe(false)
  })

  it('mantém o módulo oculto no Firebase', () => {
    ambiente.backend = 'firebase'
    try {
      expect(podeAcessarDemandas(admin, false)).toBe(false)
      expect(podeAcessarDemandas(franqueado, false)).toBe(false)
      expect(podeAcessarDemandas(admin, true, franqueado)).toBe(false)
    } finally {
      ambiente.backend = 'supabase'
    }
  })
})
