import { describe, expect, it } from 'vitest'
import {
  passoAtrasado,
  podeGerirAcompanhamento,
  resumirUnidade,
  saudeDe,
  sinaisSaude,
  slaEstourado,
  validarRegistro,
  type Fontes,
  type RegistroForm,
} from './acompanhamento'

const DIA = 86_400_000
const agora = new Date(2026, 10, 19, 12).getTime()
const vazio = (): Fontes => ({
  modelosChecklist: [], execucoes: [], auditorias: [], acoes: [], chamados: [], tentativas: [], cursosPublicados: 3,
  progresso: [], trilhaManuais: 4, pedidos: [], registros: [], passos: [],
})
const un = { id: 'un-1', modulosLiberados: ['checklist'] }
const ok = (peso: number) => ({ peso, resultado: 'ok' as const })
const nok = (peso: number) => ({ peso, resultado: 'nao_ok' as const })

describe('Acompanhamento: agregação por unidade', () => {
  it('média do checklist recalcula pelas respostas e ignora outras unidades', () => {
    const f = vazio()
    f.execucoes = [
      { unidadeId: 'un-1', modeloId: 'm', criadoEmMs: agora - DIA, respostas: [ok(1), nok(1)] },
      { unidadeId: 'un-1', modeloId: 'm', criadoEmMs: agora - 2 * DIA, respostas: [ok(1), ok(1)] },
      { unidadeId: 'un-2', modeloId: 'm', criadoEmMs: agora - DIA, respostas: [nok(1)] },
    ]
    const r = resumirUnidade(un, f, agora)
    expect(r.checklist).toMatchObject({ aplica: true, media: 75, execucoes: 2 })
  })
  it('conta rotinas atrasadas só de modelos que servem a unidade', () => {
    const f = vazio()
    f.modelosChecklist = [
      { id: 'd', frequencia: 'diaria', criadoEmMs: agora - 30 * DIA, ativo: true, publico: true, unidades: [] },
      { id: 'o', frequencia: 'diaria', criadoEmMs: agora - 30 * DIA, ativo: true, publico: false, unidades: ['un-2'] },
    ]
    expect(resumirUnidade(un, f, agora).checklist?.atrasados).toBe(1)
    expect(resumirUnidade({ id: 'un-1', modulosLiberados: [] }, f, agora).checklist?.atrasados).toBe(0)
  })
  it('última auditoria assinada e ações atrasadas', () => {
    const f = vazio()
    f.auditorias = [
      { id: 'a', unidadeId: 'un-1', dataVisitaMs: agora - 40 * DIA, score: 90, resultado: 'aprovada', status: 'concluida', modeloTitulo: 'T' },
      { id: 'b', unidadeId: 'un-1', dataVisitaMs: agora - 5 * DIA, score: 60, resultado: 'reprovada', status: 'aguardando_ciencia', modeloTitulo: 'T' },
    ]
    f.acoes = [{ unidadeId: 'un-1', status: 'aberta', prazoMs: agora - 3 * DIA }, { unidadeId: 'un-1', status: 'concluida_unidade', prazoMs: agora - 3 * DIA }]
    const r = resumirUnidade(un, f, agora)
    expect(r.auditoria?.ultima?.id).toBe('b')
    expect(r.auditoria).toMatchObject({ acoesAbertas: 1, acoesAtrasadas: 1, acoesParaValidar: 1 })
  })
  it('SLA estourado só para chamados abertos ou em andamento', () => {
    expect(slaEstourado({ unidadeId: 'un-1', status: 'aberto', criadoEmMs: agora - 30 * 3_600_000, slaHoras: 24 }, agora)).toBe(true)
    expect(slaEstourado({ unidadeId: 'un-1', status: 'aguardando_franqueado', criadoEmMs: agora - 30 * 3_600_000, slaHoras: 24 }, agora)).toBe(false)
    expect(slaEstourado({ unidadeId: 'un-1', status: 'em_andamento', criadoEmMs: agora - 2 * 3_600_000, slaHoras: 4 }, agora)).toBe(false)
  })
  it('Universidade: aprovações distintas e pendências sem aprovação', () => {
    const f = vazio()
    f.tentativas = [
      { unidadeId: 'un-1', uid: 'p1', cursoId: 'c1', aprovado: false },
      { unidadeId: 'un-1', uid: 'p1', cursoId: 'c1', aprovado: true },
      { unidadeId: 'un-1', uid: 'p2', cursoId: 'c1', aprovado: null },
    ]
    expect(resumirUnidade(un, f, agora).universidade).toEqual({ pessoas: 2, certificados: 1, pendentes: 1, cursosPublicados: 3 })
  })
  it('manuais: percentual sobre trilha × pessoas', () => {
    const f = vazio()
    f.progresso = [
      { unidadeId: 'un-1', uid: 'p1', documentoId: 'd1', status: 'concluido' },
      { unidadeId: 'un-1', uid: 'p1', documentoId: 'd2', status: 'concluido' },
      { unidadeId: 'un-1', uid: 'p2', documentoId: 'd1', status: 'em_andamento' },
    ]
    expect(resumirUnidade(un, f, agora).manuais).toMatchObject({ pessoas: 2, concluidos: 2, percentual: 25 })
  })
  it('fonte sem leitura fica nula e aparece como neutra na saúde', () => {
    const f = vazio()
    f.chamados = null
    const sinais = sinaisSaude(resumirUnidade(un, f, agora), agora)
    expect(sinais.find((s) => s.chave === 'ch')?.nivel).toBe('neutro')
  })
})

describe('Acompanhamento: saúde', () => {
  it('vermelho com auditoria recente reprovada', () => {
    const f = vazio()
    f.execucoes = [{ unidadeId: 'un-1', modeloId: 'm', criadoEmMs: agora - DIA, respostas: [ok(1)] }]
    f.auditorias = [{ id: 'a', unidadeId: 'un-1', dataVisitaMs: agora - 10 * DIA, score: 50, resultado: 'reprovada', status: 'concluida', modeloTitulo: 'T' }]
    f.registros = [{ unidadeId: 'un-1', dataMs: agora - 5 * DIA }]
    expect(saudeDe(sinaisSaude(resumirUnidade(un, f, agora), agora))).toBe('vermelho')
  })
  it('verde com tudo em dia', () => {
    const f = vazio()
    f.execucoes = [{ unidadeId: 'un-1', modeloId: 'm', criadoEmMs: agora - DIA, respostas: [ok(1)] }]
    f.auditorias = [{ id: 'a', unidadeId: 'un-1', dataVisitaMs: agora - 10 * DIA, score: 95, resultado: 'aprovada', status: 'concluida', modeloTitulo: 'T' }]
    f.registros = [{ unidadeId: 'un-1', dataMs: agora - 5 * DIA }]
    expect(saudeDe(sinaisSaude(resumirUnidade(un, f, agora), agora))).toBe('verde')
  })
  it('amarelo com dois sinais de atenção (sem checklist e sem contato)', () => {
    const f = vazio()
    f.auditorias = [{ id: 'a', unidadeId: 'un-1', dataVisitaMs: agora - 10 * DIA, score: 95, resultado: 'aprovada', status: 'concluida', modeloTitulo: 'T' }]
    expect(saudeDe(sinaisSaude(resumirUnidade(un, f, agora), agora))).toBe('amarelo')
  })
  it('passo atrasado conta a partir do dia seguinte ao prazo', () => {
    const prazo = new Date(2026, 10, 10, 12).getTime()
    expect(passoAtrasado({ status: 'aberto', prazoMs: prazo }, new Date(2026, 10, 10, 23).getTime())).toBe(false)
    expect(passoAtrasado({ status: 'reaberto', prazoMs: prazo }, new Date(2026, 10, 11, 1).getTime())).toBe(true)
    expect(passoAtrasado({ status: 'concluido_unidade', prazoMs: prazo }, new Date(2026, 10, 20).getTime())).toBe(false)
  })
})

describe('Acompanhamento: registros e acesso', () => {
  const base: RegistroForm = { tipo: 'visita', data: '2026-11-19', notas: 'Visita de rotina', compartilhado: true, geradoPorIA: false, iaModelo: '', passos: [] }
  it('valida notas, IA e passos', () => {
    expect(validarRegistro(base)).toEqual([])
    expect(validarRegistro({ ...base, notas: ' ' })).toHaveLength(1)
    expect(validarRegistro({ ...base, geradoPorIA: true, iaModelo: ' ' })).toHaveLength(1)
    expect(validarRegistro({ ...base, passos: [{ descricao: '', responsavel: 'A', prazo: '' }] })).toHaveLength(3)
  })
  it('rejeita datas que seriam normalizadas e aceita dia bissexto válido', () => {
    expect(validarRegistro({ ...base, data: '2026-02-29' })).toHaveLength(1)
    expect(validarRegistro({ ...base, data: '2024-02-29' })).toEqual([])
    expect(validarRegistro({ ...base, passos: [{ descricao: 'Visitar', responsavel: 'Maria', prazo: '2026-11-31' }] })).toHaveLength(1)
  })
  it('consultor é admin ou equipe da franqueadora com o módulo', () => {
    expect(podeGerirAcompanhamento({ papel: 'admin' }, true)).toBe(true)
    expect(podeGerirAcompanhamento({ papel: 'equipe_franqueadora', modulosLiberados: ['acompanhamento'] }, false)).toBe(true)
    expect(podeGerirAcompanhamento({ papel: 'equipe_franqueadora', modulosLiberados: ['auditoria'] }, false)).toBe(false)
    expect(podeGerirAcompanhamento({ papel: 'franqueado', modulosLiberados: ['acompanhamento'] }, false)).toBe(false)
  })
})
