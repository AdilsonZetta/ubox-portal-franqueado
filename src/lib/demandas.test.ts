import { describe, expect, it } from 'vitest'
import { atrasada, filtrarDemandas, ordenarDemandas, resumoDemandas, type Demanda } from './demandas'

const hoje = '2026-11-27'
const demanda = (id: string, dados: Partial<Demanda> = {}): Demanda => ({
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
