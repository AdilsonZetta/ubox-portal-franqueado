// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { describe, expect, it } from 'vitest'
import { mapContagemSb, mapItemSb, mapMovimentoSb, mapPedidoSb } from './estoqueSupabase'

describe('mapeadores de estoque no Supabase', () => {
  it('converte o catálogo e seu carimbo', () => {
    expect(mapItemSb({ id: 'i', unidade_medida: 'cx', estoque_minimo: 4, preco_sugerido_centavos: 250,
      gerado_por_ia: true, ia_modelo: 'Modelo', atualizado_em: '2026-11-20T12:00:00Z' }))
      .toMatchObject({ id: 'i', unidadeMedida: 'cx', estoqueMinimo: 4, precoSugeridoCentavos: 250,
        geradoPorIA: true, iaModelo: 'Modelo', atualizadoEmMs: Date.UTC(2026, 10, 20, 12) })
  })
  it('preserva o delta com sinal e a origem do movimento', () => {
    expect(mapMovimentoSb({ id: 'c_1', unidade_id: 'u', item_id: 'i', tipo: 'ajuste', delta: -2,
      origem: 'contagem', origem_id: 'c', indice: 1 }))
      .toMatchObject({ unidadeId: 'u', itemId: 'i', tipo: 'ajuste', delta: -2, origemId: 'c', indice: 1 })
  })
  it('lê linhas legadas da contagem e carimbos opcionais', () => {
    expect(mapContagemSb({ id: 'c', itens: [{ itemId: 'i', sistema: 3, contado: 1, diferenca: -2 }, { itemId: 'b', contado: null }, { itemId: 'z', contado: 0 }],
      total_divergencias: 1, confirmado_em: null }))
      .toMatchObject({ itens: [{ itemId: 'i', sistema: 3, contado: 1, diferenca: -2 }, { itemId: 'b', contado: null }, { itemId: 'z', contado: 0 }],
        totalDivergencias: 1, confirmadoEmMs: 0 })
  })
  it('lê as quantidades enviadas e o carimbo de recebimento', () => {
    expect(mapPedidoSb({ id: 'p', itens: [{ itemId: 'i', quantidade: 5, quantidadeEnviada: 3 }],
      obs_franqueadora: 'Parcial', recebido_em: '2026-11-20T12:00:00Z' }))
      .toMatchObject({ itens: [{ itemId: 'i', quantidade: 5, quantidadeEnviada: 3 }],
        obsFranqueadora: 'Parcial', recebidoEmMs: Date.UTC(2026, 10, 20, 12) })
  })
})
