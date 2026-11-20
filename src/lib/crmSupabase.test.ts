// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { describe, expect, it } from 'vitest'
import { mapAtividadeSb, mapConfigSb, mapContatoSb, mapLeadSb, mapPropostaSb } from './crmSupabase'
import { MOTIVOS_PERDA_PADRAO, ORIGENS_PADRAO } from './crm'

const data = '2026-11-20T12:00:00Z'

describe('mapeadores do CRM no Supabase', () => {
  it('mapeia o lead sem expor dados de contato', () => {
    const lead = mapLeadSb({
      id: 'ld-1', unidade_id: 'u', unidade_nome: 'Unidade', origem: 'Site',
      responsavel_uid: 'uid', responsavel_nome: 'Equipe', etapa: 'visita',
      valor_estimado_centavos: 0, criado_em: data, etapa_em: data,
      proximo_contato: data, ultima_atividade_em: data, fechado_em: null,
      atualizado_por_nome: 'Equipe', nome: 'Cliente', email: 'cliente@ubox.test',
    })
    expect(lead).toEqual({
      id: 'ld-1', unidadeId: 'u', unidadeNome: 'Unidade', origem: 'Site', etapa: 'visita',
      responsavelUid: 'uid', responsavelNome: 'Equipe', valorEstimadoCentavos: 0, motivoPerda: '',
      proximoContatoMs: Date.parse(data), ultimaAtividadeMs: Date.parse(data), arquivado: false,
      criadoEmMs: Date.parse(data), etapaEmMs: Date.parse(data), fechadoEmMs: 0, atualizadoPorNome: 'Equipe',
    })
  })

  it('mapeia o interesse em texto livre no contato', () => {
    expect(mapContatoSb({
      id: 'ld-1', nome: 'Cliente', telefone: '34 9999', email: 'cliente@ubox.test',
      interesse_tamanho: '6 m²', interesse_periodo: '3 meses', interesse_uso: 'Mudança',
    })).toEqual({
      id: 'ld-1', nome: 'Cliente', telefone: '34 9999', email: 'cliente@ubox.test',
      interesseTamanho: '6 m²', interessePeriodo: '3 meses', interesseUso: 'Mudança',
    })
  })

  it('preserva a autoria, a IA e a data da atividade', () => {
    expect(mapAtividadeSb({
      id: 'at-1', lead_id: 'ld-1', tipo: 'nota', texto: 'Ligou', nome: 'Equipe',
      gerado_por_ia: true, ia_modelo: 'Modelo', criado_em: data,
    })).toEqual({
      id: 'at-1', leadId: 'ld-1', tipo: 'nota', texto: 'Ligou', nome: 'Equipe',
      geradoPorIA: true, iaModelo: 'Modelo', criadoEmMs: Date.parse(data),
    })
  })

  it('mapeia valores, datas e status da proposta', () => {
    expect(mapPropostaSb({
      id: 'pp-1', lead_id: 'ld-1', box: 'Box 12', preco_mensal_centavos: 28990,
      periodo_meses: 3, validade: data, status: 'aceita', obs: 'Observação',
      gerado_por_ia: false, ia_modelo: '', criado_em: data, atualizado_por_nome: 'Equipe',
    })).toEqual({
      id: 'pp-1', leadId: 'ld-1', box: 'Box 12', precoMensalCentavos: 28990,
      periodoMeses: 3, validadeMs: Date.parse(data), status: 'aceita', obs: 'Observação',
      geradoPorIA: false, iaModelo: '', criadoEmMs: Date.parse(data), atualizadoPorNome: 'Equipe',
    })
  })

  it('aplica os padrões quando a configuração está ausente e filtra itens legados', () => {
    expect(mapConfigSb(null)).toEqual({
      origens: ORIGENS_PADRAO, motivosPerda: MOTIVOS_PERDA_PADRAO, atualizadoPorNome: '', atualizadoEmMs: 0,
    })
    expect(mapConfigSb({ origens: ['Site', null], motivos_perda: ['Preço'], atualizado_em: data }))
      .toEqual({ origens: ['Site'], motivosPerda: ['Preço'], atualizadoPorNome: '', atualizadoEmMs: Date.parse(data) })
  })
})
