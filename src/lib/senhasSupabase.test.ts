// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { describe, expect, it, vi } from 'vitest'
import { buscarSegredoSb, mapAcessoSb, mapEventoAcessoSb, mapSegredoSb, mapSolicitacaoAcessoSb } from './senhasSupabase'

const { consultarSegredo } = vi.hoisted(() => ({ consultarSegredo: vi.fn() }))
vi.mock('./supabase', () => ({
  requireSupabase: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: consultarSegredo }) }) }),
  }),
}))

describe('leitura do segredo no Supabase', () => {
  it('distingue falha de consulta de segredo indisponível sem propagar detalhes', async () => {
    consultarSegredo.mockReset()
    consultarSegredo
      .mockResolvedValueOnce({ data: null, error: { message: 'detalhes da consulta' } })
      .mockRejectedValueOnce(new Error('detalhes do transporte'))
      .mockResolvedValueOnce({ data: null, error: null })

    const mensagemFalha = 'Não foi possível consultar a credencial.'
    await expect(buscarSegredoSb('acesso')).rejects.toThrow(mensagemFalha)
    await expect(buscarSegredoSb('acesso')).rejects.toThrow(mensagemFalha)
    await expect(buscarSegredoSb('acesso')).rejects.toThrow('Segredo não encontrado ou você não tem permissão para visualizá-lo.')
  })
})

const data = '2026-11-20T17:00:00Z'
const instante = Date.parse(data)

describe('mapeadores do cofre no Supabase', () => {
  it('converte metadados e descarta campos do segredo', () => {
    const acesso = mapAcessoSb({
      id: 'ac-legado', nome: 'Portal', categoria: 'gestao', escopo: 'unidade',
      unidade_id: 'un-1', unidade_nome: 'Centro', responsavel_id: null,
      responsavel_nome: 'Gerência', visivel_para: ['uid-1'], visivel_para_equipe: true,
      ultima_troca_em: data, pendente_troca: true, criado_por: 'uid-2',
      criado_por_nome: 'Autora', criado_em: data, atualizado_em: data, login: 'campo intruso',
    })
    expect(acesso).toMatchObject({
      id: 'ac-legado', unidadeId: 'un-1', unidadeNome: 'Centro', responsavelId: null,
      responsavelNome: 'Gerência', visivelPara: ['uid-1'], visivelParaEquipe: true,
      pendenteTroca: true, criadoPor: 'uid-2', criadoPorNome: 'Autora',
    })
    expect(acesso).not.toHaveProperty('login')
    expect(acesso?.ultimaTrocaEm?.toMillis()).toBe(instante)
    expect(acesso?.criadoEm?.toMillis()).toBe(instante)
    expect(acesso?.atualizadoEm?.toMillis()).toBe(instante)
  })

  it('rejeita categoria e escopo desconhecidos', () => {
    expect(mapAcessoSb({ id: 'x', categoria: 'inválida', escopo: 'unidade' })).toBeNull()
    expect(mapAcessoSb({ id: 'x', categoria: 'gestao', escopo: 'inválido' })).toBeNull()
  })

  it('converte o carimbo do segredo e rejeita uma linha incompleta', () => {
    const segredo = mapSegredoSb({ senha: String.fromCharCode(32), atualizado_em: data, atualizado_por: 'uid-1' })
    expect(segredo).toMatchObject({ login: '', senha: ' ', notas: '', atualizadoPor: 'uid-1' })
    expect(segredo?.atualizadoEm?.toMillis()).toBe(instante)
    expect(mapSegredoSb({ atualizado_em: data })).toBeNull()
  })

  it('converte o evento e omite sua data se for inválida', () => {
    const linha = { id: 'ev-legado', tipo: 'copiou', texto: 'Copiou a senha.', autor_id: 'uid-1', autor_nome: 'Autora' }
    expect(mapEventoAcessoSb({ ...linha, criado_em: data })).toMatchObject({
      id: 'ev-legado', tipo: 'copiou', texto: 'Copiou a senha.', autorId: 'uid-1', autorNome: 'Autora',
    })
    expect(mapEventoAcessoSb({ ...linha, criado_em: data })?.criadoEm?.toMillis()).toBe(instante)
    expect(mapEventoAcessoSb({ ...linha, criado_em: 'inválida' })?.criadoEm).toBeUndefined()
    expect(mapEventoAcessoSb({ ...linha, tipo: 'inválido' })).toBeNull()
  })

  it('converte a solicitação preservando o alvo e a decisão ausente', () => {
    const linha = {
      id: 'sol-legado', tipo: 'pedir_acesso', status: 'aberta', acesso_id: 'ac-legado',
      acesso_nome: 'Portal', unidade_id: 'un-1', unidade_nome: 'Centro', solicitado_por: 'uid-1',
      solicitado_por_nome: 'Autora', motivo: 'Operação', alvo_uid: 'uid-2', alvo_nome: 'Alvo',
      decidido_por: null, decidido_por_nome: null, criado_em: data, atualizado_em: data,
    }
    expect(mapSolicitacaoAcessoSb(linha)).toMatchObject({
      id: 'sol-legado', acessoId: 'ac-legado', acessoNome: 'Portal', unidadeId: 'un-1',
      unidadeNome: 'Centro', solicitadoPor: 'uid-1', solicitadoPorNome: 'Autora',
      alvoUid: 'uid-2', alvoNome: 'Alvo', decididoPor: null, decididoPorNome: null,
    })
    expect(mapSolicitacaoAcessoSb(linha)?.criadoEm?.toMillis()).toBe(instante)
    expect(mapSolicitacaoAcessoSb(linha)?.atualizadoEm?.toMillis()).toBe(instante)
    expect(mapSolicitacaoAcessoSb({ ...linha, status: 'inválido' })).toBeNull()
  })
})
