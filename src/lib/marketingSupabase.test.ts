// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { describe, expect, it } from 'vitest'
import { mapCampanhaSb, mapMaterialSb, mapPedidoSb } from './marketingSupabase'

const data = '2026-12-01T00:00:00-03:00'

describe('mapeamento do Marketing no Supabase', () => {
  it('converte links, audiência e vigência do material', () => {
    expect(mapMaterialSb({
      id: 'mat', tipo: 'arte', previa_url: 'https://exemplo.test/a',
      valido_de: data, valido_ate: null, unidades: ['un-1'], gerado_por_ia: true,
    })).toMatchObject({
      id: 'mat', tipo: 'arte', previaUrl: 'https://exemplo.test/a', validoDeMs: Date.parse(data),
      validoAteMs: null, unidades: ['un-1'], geradoPorIA: true,
    })
  })

  it('converte as datas da campanha e usa o padrão para tipo desconhecido', () => {
    expect(mapCampanhaSb({ id: 'camp', tipo: 'legado', inicio: data, fim: 'inválido', ativo: true }))
      .toMatchObject({ id: 'camp', tipo: 'campanha', inicioMs: Date.parse(data), fimMs: 0, ativo: true })
  })

  it('converte autoria, unidade, entrega e datas opcionais do pedido', () => {
    expect(mapPedidoSb({
      id: 'sol', uid: 'autor', unidade_id: 'un-1', unidade_nome: 'Unidade Um',
      tipo_peca: 'post', status: 'entregue', prazo_desejado: null, entregue_em: data,
      entrega_url: 'https://exemplo.test/entrega', responsavel_nome: 'Rede Mkt',
    })).toMatchObject({
      id: 'sol', uid: 'autor', unidadeId: 'un-1', unidadeNome: 'Unidade Um', tipoPeca: 'post',
      status: 'entregue', prazoDesejadoMs: null, entregueEmMs: Date.parse(data),
      entregaUrl: 'https://exemplo.test/entrega', responsavelNome: 'Rede Mkt',
    })
  })
})
