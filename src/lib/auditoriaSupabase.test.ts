// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { describe, expect, it } from 'vitest'
import { mapAcaoSb, mapAuditoriaSb, mapModeloAudSb } from './auditoriaSupabase'

describe('mapeadores da auditoria no Supabase', () => {
  it('preserva a versão, os limites, a autoria e os itens do modelo', () => {
    const itens = [{ id: 'i1', texto: 'Validar estoque', secao: 'Operação', peso: 4 }]
    expect(mapModeloAudSb({
      id: 'modelo-antigo', titulo: 'Qualidade', descricao: 'Rotina', itens,
      total_itens: 1, peso_total: 4, nota_minima: 85, versao: 2, ativo: true,
      gerado_por_ia: true, ia_modelo: 'Gemini', atualizado_por_nome: 'Lia',
      criado_em: '2026-11-20T12:00:00Z', atualizado_em: '2026-11-20T12:01:00Z',
    })).toEqual({
      id: 'modelo-antigo', titulo: 'Qualidade', descricao: 'Rotina', itens,
      totalItens: 1, pesoTotal: 4, notaMinima: 85, versao: 2, ativo: true,
      geradoPorIA: true, iaModelo: 'Gemini', atualizadoPorNome: 'Lia',
      criadoEmMs: 1795176000000, atualizadoEmMs: 1795176060000,
    })
  })

  it('preserva a nota zero do checklist e converte a ciência ausente para os valores da interface', () => {
    const respostas = [{
      itemId: 'i1', texto: 'Validar estoque', secao: 'Operação', peso: 4,
      resultado: 'ok', obs: 'Conferido', evidenciaUrl: 'https://example.com/comprovante',
    }]
    expect(mapAuditoriaSb({
      id: 'auditoria-antiga', unidade_id: 'u1', unidade_nome: 'Loja 1', modelo_id: 'm1',
      modelo_titulo: 'Qualidade', modelo_versao: 2, modalidade: 'remota',
      data_visita: '2026-11-20T12:00:00Z', auditor_uid: 'auditor-uuid', auditor_nome: 'Lia',
      respostas, total_itens: 1, peso_total: 4, qtd_ok: 1, qtd_nao_ok: 0, qtd_na: 0,
      pontos_obtidos: 4, pontos_possiveis: 4, score: 100, nota_minima: 85,
      checklist_execucao_id: 'c1', checklist_score: 0, resultado: 'reprovada',
      obs_geral: 'Checklist pendente', gerado_por_ia: false, ia_modelo: '',
      status: 'aguardando_ciencia', assinatura_auditor_uid: 'auditor-uuid',
      assinatura_auditor_nome: 'Lia', assinatura_auditor_em: '2026-11-20T12:01:00Z',
      ciencia_uid: null, ciencia_nome: '', ciencia_em: null, contestacao: '',
      criado_em: '2026-11-20T12:00:00Z', atualizado_em: '2026-11-20T12:01:00Z',
    })).toEqual({
      id: 'auditoria-antiga', unidadeId: 'u1', unidadeNome: 'Loja 1', modeloId: 'm1',
      modeloTitulo: 'Qualidade', modeloVersao: 2, modalidade: 'remota',
      dataVisitaMs: 1795176000000, auditorUid: 'auditor-uuid', auditorNome: 'Lia',
      respostas, totalItens: 1, pesoTotal: 4, qtdOk: 1, qtdNaoOk: 0, qtdNa: 0,
      pontosObtidos: 4, pontosPossiveis: 4, score: 100, notaMinima: 85,
      checklistExecucaoId: 'c1', checklistScore: 0, resultado: 'reprovada',
      obsGeral: 'Checklist pendente', geradoPorIA: false, iaModelo: '',
      status: 'aguardando_ciencia', assinaturaAuditorUid: 'auditor-uuid',
      assinaturaAuditorNome: 'Lia', assinaturaAuditorEmMs: 1795176060000,
      cienciaUid: '', cienciaNome: '', cienciaEmMs: 0, contestacao: '',
      criadoEmMs: 1795176000000, atualizadoEmMs: 1795176060000,
    })
  })

  it('preserva os vínculos, o prazo e os comentários de cada parte na ação', () => {
    expect(mapAcaoSb({
      id: 'acao-antiga', auditoria_id: 'au1', unidade_id: 'u1', item_id: 'i1',
      item_texto: 'Validar estoque', descricao: 'Conferir produtos', responsavel: 'Susana',
      prazo: '2026-11-20T12:00:00Z', status: 'reaberta', evidencia_url: 'https://example.com/foto',
      comentario_unidade: 'Conferido', comentario_franqueadora: 'Rever a foto',
      criado_em: '2026-11-20T12:00:00Z', atualizado_em: '2026-11-20T12:01:00Z',
      atualizado_por_nome: 'Lia',
    })).toEqual({
      id: 'acao-antiga', auditoriaId: 'au1', unidadeId: 'u1', itemId: 'i1',
      itemTexto: 'Validar estoque', descricao: 'Conferir produtos', responsavel: 'Susana',
      prazoMs: 1795176000000, status: 'reaberta', evidenciaUrl: 'https://example.com/foto',
      comentarioUnidade: 'Conferido', comentarioFranqueadora: 'Rever a foto',
      criadoEmMs: 1795176000000, atualizadoEmMs: 1795176060000, atualizadoPorNome: 'Lia',
    })
  })
})
