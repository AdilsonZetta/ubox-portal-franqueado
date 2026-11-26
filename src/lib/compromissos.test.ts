import { describe, expect, it } from 'vitest'
import type { PassoAc } from './acompanhamento'
import type { AcaoAuditoria } from './auditoria'
import { montarCompromissos } from './compromissos'

const prazoMs = new Date(2026, 10, 20, 12).getTime()
const agoraMs = new Date(2026, 10, 26, 12).getTime()
const base = { unidadeId: 'aurora', descricao: 'Revisar sinalização', responsavel: 'Maria', prazoMs }
const acao = { ...base, id: 'ação & 1', auditoriaId: 'auditoria-1', status: 'aberta' } satisfies Partial<AcaoAuditoria>
const passo = { ...base, id: 'passo #1', status: 'aberto' } satisfies Partial<PassoAc>
const entrada = { unidadeId: 'aurora', papel: 'franqueado', agoraMs, acoes: [acao], passos: [passo] }

describe('montarCompromissos', () => {
  it('mostra os dois compromissos atrasados da Aurora com atalhos para os registros', () => {
    expect(montarCompromissos(entrada)).toMatchObject([
      { tipo: 'auditoria', situacao: 'atrasado', podeConcluir: true, para: '/auditorias/auditoria-1?acao=a%C3%A7%C3%A3o%20%26%201' },
      { tipo: 'combinado', situacao: 'atrasado', podeConcluir: true, para: '/meu-acompanhamento?passo=passo%20%231' },
    ])
  })

  it('exclui os itens validados', () => {
    expect(montarCompromissos({
      ...entrada,
      acoes: [{ ...acao, status: 'validada' }],
      passos: [{ ...passo, status: 'validado' }],
    })).toEqual([])
  })

  it('identifica itens que aguardam a validação e impede nova conclusão', () => {
    expect(montarCompromissos({
      ...entrada,
      acoes: [{ ...acao, status: 'concluida_unidade' }],
      passos: [{ ...passo, status: 'concluido_unidade' }],
    })).toMatchObject([
      { situacao: 'aguardando_validacao', podeConcluir: false },
      { situacao: 'aguardando_validacao', podeConcluir: false },
    ])
  })

  it('mostra os itens à equipe da unidade em modo leitura', () => {
    expect(montarCompromissos({ ...entrada, papel: 'equipe_franqueado' })).toMatchObject([
      { tipo: 'auditoria', podeConcluir: false },
      { tipo: 'combinado', podeConcluir: false },
    ])
  })

  it('descarta registros de outra unidade mesmo se vierem na consulta', () => {
    expect(montarCompromissos({ ...entrada, unidadeId: 'brisa' })).toEqual([])
    expect(montarCompromissos({
      ...entrada,
      acoes: [...entrada.acoes, { ...acao, unidadeId: 'brisa' }],
      passos: [...entrada.passos, { ...passo, unidadeId: 'brisa' }],
    })).toEqual(montarCompromissos(entrada))
  })

  it('ordena atrasados e itens em dia por prazo e deixa a validação para o fim', () => {
    const amanha = new Date(2026, 10, 27, 12).getTime()
    const itens = montarCompromissos({
      ...entrada,
      acoes: [
        { ...acao, id: 'em-validacao', status: 'concluida_unidade' },
        { ...acao, id: 'amanha', prazoMs: amanha, status: 'em_andamento' },
        { ...acao, id: 'mais-antigo', prazoMs: prazoMs - 86_400_000, status: 'reaberta' },
      ],
      passos: [passo, { ...passo, id: 'hoje', prazoMs: agoraMs, status: 'reaberto' }],
    })
    expect(itens.map(({ chave, situacao }) => [chave, situacao])).toEqual([
      ['auditoria-mais-antigo', 'atrasado'],
      ['combinado-passo #1', 'atrasado'],
      ['combinado-hoje', 'em_dia'],
      ['auditoria-amanha', 'em_dia'],
      ['auditoria-em-validacao', 'aguardando_validacao'],
    ])
  })
})
