import { describe, expect, it } from 'vitest'
import {
  acaoAtrasada,
  acaoDaUnidade,
  daUnidade,
  naoConformesSemPlano,
  podeGerirAuditoria,
  respostasDoModelo,
  respostasParaGravar,
  resultadoAuditoria,
  resumoAcoes,
  scoreRecalculado,
  validarAuditoria,
  validarModeloAuditoria,
  versaoMudaAud,
  type ModeloAuditoriaForm,
} from './auditoria'
import { calcularTotais, totaisConferem, type Resposta } from './checklist'

const r = (itemId: string, resultado: Resposta['resultado'], peso = 1, extra: Partial<Resposta> = {}): Resposta => ({
  itemId, texto: `Item ${itemId}`, secao: '', peso, resultado, obs: '', evidenciaUrl: '', ...extra,
})

describe('Auditoria: aprovação pela pontuação', () => {
  it('aprova quando a auditoria atinge a nota mínima e não há checklist', () => {
    expect(resultadoAuditoria(80, 80, null)).toBe('aprovada')
    expect(resultadoAuditoria(79, 80, null)).toBe('reprovada')
  })
  it('o checklist de referência também precisa atingir a nota mínima', () => {
    expect(resultadoAuditoria(95, 80, 79)).toBe('reprovada')
    expect(resultadoAuditoria(95, 80, 80)).toBe('aprovada')
  })
  it('recalcula o score do checklist pelas respostas, ignorando o total gravado', () => {
    const execucao = { score: 100, respostas: [r('a', 'ok', 3), r('b', 'nao_ok', 1), r('c', 'na', 5)] }
    expect(scoreRecalculado(execucao)).toBe(75)
  })
})

describe('Auditoria: preenchimento', () => {
  const modelo = { itens: [{ id: 'a1', texto: 'Fachada', secao: 'Loja', peso: 2 }, { id: 'a2', texto: 'Uniforme', secao: 'Equipe', peso: 99 }] }
  it('monta as respostas a partir do modelo com peso válido', () => {
    const lista = respostasDoModelo(modelo)
    expect(lista.map((x) => x.resultado)).toEqual(['', ''])
    expect(lista[1].peso).toBe(10)
  })
  it('para assinar, todo item precisa de marcação e Não OK precisa de explicação', () => {
    const erros = validarAuditoria([r('a', ''), r('b', 'nao_ok'), r('c', 'ok')], true)
    expect(Object.keys(erros)).toEqual(['a', 'b'])
    expect(validarAuditoria([r('a', '')], false)).toEqual({})
  })
  it('evidência só com https', () => {
    expect(validarAuditoria([r('a', 'ok', 1, { evidenciaUrl: 'http://x.com/f.jpg' })], false).a).toMatch(/https/)
    expect(validarAuditoria([r('a', 'ok', 1, { evidenciaUrl: 'https://drive.google.com/x' })], true)).toEqual({})
  })
  it('rascunho grava itens sem marcação como N/A e os totais fecham', () => {
    const gravadas = respostasParaGravar([r('a', 'ok'), r('b', '')])
    expect(gravadas[1].resultado).toBe('na')
    const t = calcularTotais(gravadas)
    expect(t.qtdOk + t.qtdNaoOk + t.qtdNa).toBe(2)
  })
})

describe('Auditoria: modelos', () => {
  const base: ModeloAuditoriaForm = { titulo: 'Visita trimestral', descricao: '', itens: [{ id: 'a1', texto: 'Fachada', secao: '', peso: 2 }], notaMinima: 80, ativo: true, geradoPorIA: false, iaModelo: '' }
  it('valida título, itens, nota mínima e IA', () => {
    expect(validarModeloAuditoria(base)).toEqual([])
    expect(validarModeloAuditoria({ ...base, notaMinima: 101 })).toHaveLength(1)
    expect(validarModeloAuditoria({ ...base, geradoPorIA: true, iaModelo: ' ' })).toHaveLength(1)
    expect(validarModeloAuditoria({ ...base, itens: [] })).toHaveLength(1)
  })
  it('sobe a versão quando itens, título ou peso mudam', () => {
    const antes = { titulo: 'A', pesoTotal: 2, itens: base.itens }
    expect(versaoMudaAud(antes, { ...antes })).toBe(false)
    expect(versaoMudaAud(antes, { ...antes, titulo: 'B' })).toBe(true)
    expect(versaoMudaAud(antes, { ...antes, itens: [{ ...base.itens[0], peso: 3 }], pesoTotal: 3 })).toBe(true)
  })
})

describe('Auditoria: plano de ação e acesso', () => {
  it('unidade avança só para andamento ou conclusão', () => {
    expect(acaoDaUnidade('aberta')).toEqual(['em_andamento', 'concluida_unidade'])
    expect(acaoDaUnidade('reaberta')).toEqual(['em_andamento', 'concluida_unidade'])
    expect(acaoDaUnidade('em_andamento')).toEqual(['concluida_unidade'])
    expect(acaoDaUnidade('concluida_unidade')).toEqual([])
    expect(acaoDaUnidade('validada')).toEqual([])
  })
  it('atraso conta a partir do dia seguinte ao prazo e só para ações em aberto', () => {
    const prazo = new Date(2026, 10, 10, 12).getTime()
    expect(acaoAtrasada({ prazoMs: prazo, status: 'aberta' }, new Date(2026, 10, 10, 23).getTime())).toBe(false)
    expect(acaoAtrasada({ prazoMs: prazo, status: 'aberta' }, new Date(2026, 10, 11, 0, 1).getTime())).toBe(true)
    expect(acaoAtrasada({ prazoMs: prazo, status: 'concluida_unidade' }, new Date(2026, 10, 20).getTime())).toBe(false)
    const resumo = resumoAcoes([{ prazoMs: prazo, status: 'aberta' }, { prazoMs: prazo, status: 'validada' }, { prazoMs: prazo, status: 'concluida_unidade' }], new Date(2026, 10, 20).getTime())
    expect(resumo).toEqual({ abertas: 1, paraValidar: 1, validadas: 1, atrasadas: 1 })
  })
  it('lista as não conformidades ainda sem plano', () => {
    const falta = naoConformesSemPlano({ respostas: [r('a', 'nao_ok'), r('b', 'nao_ok'), r('c', 'ok')] }, [{ itemId: 'a' }])
    expect(falta.map((x) => x.itemId)).toEqual(['b'])
  })
  it('auditor é admin ou equipe da franqueadora com o módulo auditoria', () => {
    expect(podeGerirAuditoria({ papel: 'admin' }, true)).toBe(true)
    expect(podeGerirAuditoria({ papel: 'equipe_franqueadora', modulosLiberados: ['auditoria'] }, false)).toBe(true)
    expect(podeGerirAuditoria({ papel: 'equipe_franqueadora', modulosLiberados: ['checklist'] }, false)).toBe(false)
    expect(podeGerirAuditoria({ papel: 'equipe_franqueadora', ativo: false, modulosLiberados: ['auditoria'] }, false)).toBe(false)
    expect(podeGerirAuditoria({ papel: 'franqueado', modulosLiberados: ['auditoria'] }, false)).toBe(false)
    expect(daUnidade({ papel: 'equipe_franqueado' })).toBe(true)
    expect(daUnidade({ papel: 'equipe_franqueadora' })).toBe(false)
  })
})

describe('Auditoria: totais gravados', () => {
  it('detecta score ou contagens que não conferem com as respostas', () => {
    const respostas = [r('a', 'ok', 3), r('b', 'nao_ok', 1)]
    const certo = { respostas, ...calcularTotais(respostas) }
    expect(totaisConferem(certo)).toBe(true)
    expect(totaisConferem({ ...certo, score: 100 })).toBe(false)
    expect(totaisConferem({ ...certo, qtdNaoOk: 0, qtdOk: 2 })).toBe(false)
  })
})
