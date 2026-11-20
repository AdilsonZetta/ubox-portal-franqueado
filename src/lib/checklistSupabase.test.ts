// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { describe, expect, it } from 'vitest'
import { mapExecucaoSb, mapModeloSb } from './checklistSupabase'

describe('mapeadores do Checklist no Supabase', () => {
  it('converte a versão, os itens e o carimbo do modelo', () => {
    expect(mapModeloSb({
      id: 'ck-1', titulo: 'Abertura', frequencia: 'diaria', tipo: 'abertura',
      itens: [{ id: 'i1', texto: 'Luzes', peso: 2, exigeObs: true }],
      peso_total: 2, total_itens: 1, versao: 3, unidades: ['un-1'],
      atualizado_por_nome: 'Gestora', atualizado_em: '2026-11-20T12:00:00Z',
    })).toMatchObject({
      id: 'ck-1', versao: 3, pesoTotal: 2, totalItens: 1, unidades: ['un-1'],
      itens: [{ id: 'i1', peso: 2, exigeObs: true }],
      atualizadoPorNome: 'Gestora', atualizadoEmMs: Date.UTC(2026, 10, 20, 12),
    })
  })

  it('converte totais, respostas e observação do proprietário', () => {
    expect(mapExecucaoSb({
      id: 'ex-1', modelo_id: 'ck-1', modelo_versao: 3, unidade_id: 'un-1',
      respostas: [{ itemId: 'i1', resultado: 'nao_ok', evidenciaUrl: 'https://example.test/foto' }],
      qtd_nao_ok: 1, pontos_possiveis: 2, score: 0,
      obs_proprietario_nome: 'Dona', obs_proprietario_em: null,
      criado_em: '2026-11-20T12:00:00-03:00',
    })).toMatchObject({
      id: 'ex-1', modeloId: 'ck-1', modeloVersao: 3, unidadeId: 'un-1',
      respostas: [{ itemId: 'i1', resultado: 'nao_ok', evidenciaUrl: 'https://example.test/foto' }],
      qtdNaoOk: 1, pontosPossiveis: 2, score: 0, obsProprietarioNome: 'Dona',
      obsProprietarioEmMs: 0, criadoEmMs: Date.UTC(2026, 10, 20, 15),
    })
  })
})
