import { describe, expect, it } from 'vitest'
import { mapDemandaSb, mapEventoDemandaSb } from './demandasSupabase'

const criado = '2026-11-27T13:00:00Z'

describe('mapeadores de demandas no Supabase', () => {
  it('preserva responsáveis, prazo, links e dados de autoria', () => {
    const anexos = [{ nome: 'Briefing', url: 'https://exemplo.test/briefing' }]
    expect(mapDemandaSb({
      id: 'demanda', titulo: 'Campanha', descricao: '', area: 'marketing', prioridade: 'alta', prazo: '2026-11-27',
      status: 'a_fazer', anexos, destino: 'unidade', unidade_id: 'a', demanda_unidade_nome: 'Unidade A',
      grupo_id: 'grupo', tem_responsaveis_unidade: false, demanda_responsaveis: [{ usuario_id: 'rede', usuario_nome: 'Pessoa da rede' }], criado_por: 'autor',
      criado_por_nome: 'Pessoa autora', criado_em: criado, atualizado_em: criado, concluida_em: null,
    })).toEqual({
      id: 'demanda', titulo: 'Campanha', descricao: '', area: 'marketing', prioridade: 'alta', prazo: '2026-11-27',
      status: 'a_fazer', anexos, destino: 'unidade', unidadeId: 'a', unidadeNome: 'Unidade A',
      grupoId: 'grupo', temResponsaveisUnidade: false, responsaveisNomes: { rede: 'Pessoa da rede' }, responsaveis: ['rede'], criadoPor: 'autor', criadoPorNome: 'Pessoa autora',
      criadoEm: criado, atualizadoEm: criado, concluidaEm: null,
    })
  })

  it('converte data e autoria do evento', () => {
    expect(mapEventoDemandaSb({
      id: 'evento', tipo: 'status', texto: 'A fazer → Em andamento', autor_id: 'autor', autor_nome: null, criado_em: criado,
    })).toEqual({
      id: 'evento', tipo: 'status', texto: 'A fazer → Em andamento', autorId: 'autor', autorNome: null, criadoEm: criado,
    })
  })
})
