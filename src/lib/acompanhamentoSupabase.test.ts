// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { describe, expect, it, vi } from 'vitest'
import { mapPassoSb, mapRegistroSb } from './acompanhamentoSupabase'

import { carregarAcompanhamento } from './acompanhamentoApi'

const { from, requireDb } = vi.hoisted(() => ({
  from: vi.fn(),
  requireDb: vi.fn(() => { throw new Error('Acesso inesperado ao Firestore') }),
}))
vi.mock('./backend', () => ({ BACKEND: 'supabase' }))
vi.mock('./firebase', () => ({ requireDb }))
vi.mock('./supabase', () => ({ requireSupabase: () => ({ from }) }))

const data = '2026-11-20T12:00:00Z'
const unidade_id = 'un-ac'

describe('Acompanhamento no Supabase', () => {
  it('mapeia autoria, visibilidade e datas do registro', () => {
    expect(mapRegistroSb({
      id: 'reg', unidade_id, unidade_nome: 'Unidade Ac', data, tipo: 'call', notas: 'Notas',
      compartilhado: false, gerado_por_ia: true, ia_modelo: 'Grok', autor_uid: 'autor',
      autor_nome: 'Autor', criado_em: data, atualizado_por_nome: 'Consultora', atualizado_em: data,
    })).toEqual({
      id: 'reg', unidadeId: unidade_id, unidadeNome: 'Unidade Ac', dataMs: Date.parse(data),
      tipo: 'call', notas: 'Notas', compartilhado: false, geradoPorIA: true, iaModelo: 'Grok',
      autorUid: 'autor', autorNome: 'Autor', criadoEmMs: Date.parse(data),
      atualizadoPorNome: 'Consultora', atualizadoEmMs: Date.parse(data),
    })
  })

  it('mapeia os comentários dos dois lados e tolera datas inválidas', () => {
    expect(mapPassoSb({
      id: 'p', registro_id: 'reg', unidade_id, descricao: 'Descrição', responsavel: 'Equipe', prazo: data,
      status: 'reaberto', compartilhado: true, comentario_unidade: 'Feito', comentario_franqueadora: 'Revisar',
      criado_em: data, atualizado_em: 'inválido', atualizado_por_nome: 'Consultora',
    })).toEqual({
      id: 'p', registroId: 'reg', unidadeId: unidade_id, descricao: 'Descrição', responsavel: 'Equipe',
      prazoMs: Date.parse(data), status: 'reaberto', compartilhado: true, comentarioUnidade: 'Feito',
      comentarioFranqueadora: 'Revisar', criadoEmMs: Date.parse(data), atualizadoEmMs: 0,
      atualizadoPorNome: 'Consultora',
    })
  })

  it('monta o painel com todas as fontes, incluindo auditorias e ações, mesmo quando uma falha', async () => {
    const tabelas: Record<string, Record<string, unknown>[]> = {
      checklist_modelos: [{ id: 'modelo' }],
      checklist_execucoes: [{ id: 'exec', unidade_id }],
      checklist_vigencias: [{
        id: 'vigencia', modelo_id: 'modelo', unidade_id, inicio: '2026-11-26',
        primeiro_vencimento: '2026-11-27', registrado_por_nome: 'Consultora', registrado_em: data,
      }],
      auditorias: [
        { id: 'aud', unidade_id, status: 'concluida' },
        { id: 'rascunho', unidade_id, status: 'rascunho' },
        { id: 'outra', unidade_id: 'un-outra', status: 'concluida' },
      ],
      auditoria_acoes: [{ id: 'acao', auditoria_id: 'aud', unidade_id, prazo: data }],
      chamados: [{ id: 'ch', unidade_id, titulo: 'Chamado', categoria: 'operacao', status: 'aberto', prioridade: 'alta', criado_em: data, sla_horas: 24 }],
      tentativas_prova: [{ id: 'tentativa', unidade_id, curso_id: 'curso', criado_em: data, corrigido_em: null }],
      cursos: [{ id: 'curso', publicado: true }, { id: 'rascunho', publicado: false }],
      progresso_manuais: [{ id: 'progresso', unidade_id, documento_id: 'manual' }],
      manuais_trilha: [{ id: 'manual', ativo: true }, { id: 'inativo', ativo: false }],
      marketing_solicitacoes: [{ id: 'pedido', unidade_id, status: 'aberta' }],
      acompanhamento_registros: [{ id: 'antigo', data, unidade_id }, { id: 'novo', data: '2026-12-01T12:00:00Z', unidade_id }],
      acompanhamento_passos: [{ id: 'tarde', prazo: '2026-12-01T12:00:00Z', unidade_id }, { id: 'cedo', prazo: data, unidade_id }],
    }
    let fonteIndisponivel: string | undefined
    let migracaoPendente = false
    from.mockImplementation((tabela: string) => {
      let linhas = tabelas[tabela]
      const consulta = {
        select: vi.fn(() => consulta),
        eq: vi.fn((coluna: string, valor: unknown) => {
          linhas = linhas.filter((linha) => linha[coluna] === valor)
          return consulta
        }),
        in: vi.fn((coluna: string, valores: unknown[]) => {
          linhas = linhas.filter((linha) => valores.includes(linha[coluna]))
          return consulta
        }),
        gte: vi.fn(() => consulta),
        order: vi.fn(() => consulta),
        range: vi.fn(() => consulta),
        then: (resolver: (resposta: { count: number; error: null }) => void) => resolver({ count: linhas.length, error: null }),
        overrideTypes: vi.fn(async () => tabela === fonteIndisponivel
          ? { data: null, error: new Error('indisponível') }
          : tabela === 'checklist_vigencias' && migracaoPendente
            ? { data: null, error: { code: 'PGRST205' } }
            : { data: linhas, error: null }),
      }
      return consulta
    })
    const painel = await carregarAcompanhamento(unidade_id)
    expect(requireDb).not.toHaveBeenCalled()
    expect(from.mock.calls.map(([tabela]) => tabela).sort()).toEqual(Object.keys(tabelas).sort())
    expect(painel.fontes).toMatchObject({
      modelosChecklist: [{ id: 'modelo' }], execucoes: [{ id: 'exec', unidadeId: unidade_id }],
      auditorias: [{ id: 'aud', status: 'concluida' }], acoes: [{ auditoriaId: 'aud', prazoMs: Date.parse(data) }],
      chamados: [{ unidadeId: unidade_id, criadoEmMs: Date.parse(data), slaHoras: 24 }],
      tentativas: [{ cursoId: 'curso' }], cursosPublicados: 1, progresso: [{ documentoId: 'manual' }],
      trilhaManuais: 1, pedidos: [{ id: 'pedido', unidadeId: unidade_id, status: 'aberta' }],
    })
    expect(painel.vigenciasChecklist).toEqual([{
      id: 'vigencia', modeloId: 'modelo', unidadeId: unidade_id, inicio: '2026-11-26',
      primeiroVencimento: '2026-11-27', registradoPorNome: 'Consultora', registradoEmMs: Date.parse(data),
    }])
    expect(painel.registros.map(({ id }) => id)).toEqual(['novo', 'antigo'])
    expect(painel.passos.map(({ id }) => id)).toEqual(['cedo', 'tarde'])

    fonteIndisponivel = 'auditoria_acoes'
    const parcial = await carregarAcompanhamento(unidade_id)
    expect(parcial.fontes.acoes).toBeNull()
    expect(parcial.fontes.auditorias).toEqual(painel.fontes.auditorias)
    expect(parcial.passos).toEqual(painel.passos)

    migracaoPendente = true
    const semMigracao = await carregarAcompanhamento(unidade_id)
    expect(semMigracao.vigenciasChecklist).toEqual([])
    expect(semMigracao.fontes.execucoes).toEqual(painel.fontes.execucoes)
  })
})
