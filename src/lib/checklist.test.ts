import { describe, expect, it } from 'vitest'
import {
  calcularTotais,
  faixaScore,
  fazChecklist,
  filtrarExecucoes,
  horarioValido,
  inicioHistoricoVigencias,
  inicioPeriodo,
  liberacaoChecklist,
  itensMudaram,
  mediaScore,
  modeloServeUnidade,
  naoConformidades,
  novoItemId,
  periodoAnterior,
  periodoRascunho,
  mesclarRespostasRascunho,
  pesoTotalDe,
  pesoValido,
  podeGerirChecklist,
  porSecao,
  primeiroVencimentoPadrao,
  respostasIniciais,
  situacaoModelo,
  totaisConferem,
  validarExecucao,
  validarModelo,
  validarVigencia,
  versaoMuda,
  type ExecucaoChecklist,
  type ItemModelo,
  type ModeloForm,
  type Resposta,
} from './checklist'

const DIA = 86_400_000
const itens: ItemModelo[] = [
  { id: 'i1', texto: 'Luzes', secao: 'Loja', peso: 1, exigeEvidencia: false, exigeObs: false },
  { id: 'i2', texto: 'Caixa', secao: 'Loja', peso: 2, exigeEvidencia: true, exigeObs: false },
  { id: 'i3', texto: 'Limpeza', secao: 'Corredor', peso: 3, exigeEvidencia: false, exigeObs: true },
]

function resp(resultados: Resposta['resultado'][], extra: Partial<Resposta>[] = []): Resposta[] {
  return respostasIniciais({ itens }).map((r, i) => ({ ...r, resultado: resultados[i] ?? '', ...(extra[i] ?? {}) }))
}

function exec(extra: Partial<ExecucaoChecklist>): ExecucaoChecklist {
  return {
    id: 'e', modeloId: 'm1', modeloTitulo: 'Abertura', modeloVersao: 1, tipo: 'abertura', frequencia: 'diaria', unidadeId: 'u1', unidadeNome: 'Centro',
    uid: 'x', nome: 'Ana', respostas: [], totalItens: 0, qtdOk: 0, qtdNaoOk: 0, qtdNa: 0, pontosObtidos: 0, pontosPossiveis: 0, score: 100,
    obsGeral: '', obsProprietario: '', obsProprietarioNome: '', obsProprietarioEmMs: 0, criadoEmMs: 0, ...extra,
  }
}

describe('pontuação', () => {
  it('soma pesos, ignora N/A e arredonda para baixo (mesma conta das rules)', () => {
    expect(calcularTotais(resp(['ok', 'nao_ok', 'ok']))).toEqual({ totalItens: 3, qtdOk: 2, qtdNaoOk: 1, qtdNa: 0, pontosObtidos: 4, pontosPossiveis: 6, score: 66 })
    expect(calcularTotais(resp(['ok', 'na', 'nao_ok'])).score).toBe(25)
    expect(calcularTotais(resp(['na', 'na', 'na'])).score).toBe(100)
    expect(calcularTotais(resp(['ok', 'ok', 'ok'])).score).toBe(100)
  })

  it('peso fica entre 1 e 10', () => {
    expect(pesoValido(0)).toBe(1)
    expect(pesoValido(15)).toBe(10)
    expect(pesoValido('3')).toBe(3)
    expect(pesoValido('x')).toBe(1)
    expect(pesoTotalDe(itens)).toBe(6)
  })

  it('detecta totais gravados que não conferem com as respostas', () => {
    const r = resp(['ok', 'nao_ok', 'ok'])
    const t = calcularTotais(r)
    expect(totaisConferem({ respostas: r, ...t })).toBe(true)
    expect(totaisConferem({ respostas: r, ...t, qtdNaoOk: 0, qtdOk: 3, score: 100 })).toBe(false)
    expect(totaisConferem({ respostas: r, ...t, pontosObtidos: 5 })).toBe(false)
    expect(totaisConferem({ respostas: r, ...t, pontosPossiveis: 7 })).toBe(false)
  })

  it('faixas de score', () => {
    expect(faixaScore(95)).toBe('bom')
    expect(faixaScore(80)).toBe('atencao')
    expect(faixaScore(50)).toBe('critico')
    expect(mediaScore([{ score: 100 }, { score: 51 }])).toBe(76)
    expect(mediaScore([])).toBeNull()
  })
})

describe('validação do preenchimento', () => {
  it('exige resultado em todos os itens', () => {
    const v = validarExecucao({ itens }, resp(['ok', '', '']))
    expect(Object.keys(v.porItem)).toEqual(['i2', 'i3'])
    expect(v.gerais.length).toBeGreaterThan(0)
  })

  it('exige evidência https, observação e explicação do Não OK', () => {
    const base = resp(['ok', 'ok', 'ok'], [{}, { evidenciaUrl: 'https://drive.google.com/f' }, { obs: 'Feito' }])
    expect(validarExecucao({ itens }, base).gerais).toEqual([])
    expect(validarExecucao({ itens }, resp(['ok', 'ok', 'ok'], [{}, {}, { obs: 'Feito' }])).porItem.i2).toMatch(/evidência/)
    expect(validarExecucao({ itens }, resp(['ok', 'ok', 'ok'], [{}, { evidenciaUrl: 'http://x' }, { obs: 'Feito' }])).porItem.i2).toMatch(/https/)
    expect(validarExecucao({ itens }, resp(['ok', 'ok', 'ok'], [{}, { evidenciaUrl: 'https://a.b' }, {}])).porItem.i3).toMatch(/observação/)
    expect(validarExecucao({ itens }, resp(['nao_ok', 'na', 'na'])).porItem.i1).toMatch(/não está OK/)
    expect(validarExecucao({ itens }, resp(['na', 'na', 'na'])).gerais).toEqual([])
  })
})

describe('modelos', () => {
  const form: ModeloForm = { titulo: 'Abertura', descricao: '', tipo: 'abertura', frequencia: 'diaria', itens, publico: true, unidades: [], ativo: true, geradoPorIA: false, iaModelo: '' }
  it('valida título, itens, unidades e IA', () => {
    expect(validarModelo(form)).toEqual([])
    expect(validarModelo({ ...form, itens: [] })).toHaveLength(1)
    expect(validarModelo({ ...form, publico: false })).toHaveLength(1)
    expect(validarModelo({ ...form, geradoPorIA: true })).toHaveLength(1)
    expect(validarModelo({ ...form, itens: [...itens, { ...itens[0] }] })).toHaveLength(1)
    expect(validarModelo({ ...form, itens: [{ ...itens[0], texto: ' ' }] })).toHaveLength(1)
  })
  it('detecta mudança de itens para subir a versão', () => {
    expect(itensMudaram(itens, itens.map((i) => ({ ...i })))).toBe(false)
    expect(itensMudaram(itens, [itens[1], itens[0], itens[2]])).toBe(true)
    expect(itensMudaram(itens, itens.map((i) => (i.id === 'i1' ? { ...i, peso: 5 } : i)))).toBe(true)
    const m = { itens, titulo: 'A', tipo: 'abertura' as const, frequencia: 'diaria' as const, pesoTotal: 6 }
    expect(versaoMuda(m, { ...m, itens: itens.map((i) => ({ ...i })) })).toBe(false)
    expect(versaoMuda(m, { ...m, titulo: 'B' })).toBe(true)
    expect(versaoMuda(m, { ...m, tipo: 'limpeza' })).toBe(true)
    expect(versaoMuda(m, { ...m, frequencia: 'mensal' })).toBe(true)
    expect(versaoMuda(m, { ...m, pesoTotal: 7 })).toBe(true)
    expect(novoItemId(itens)).toBe('i4')
    expect(novoItemId([{ id: 'i2' }])).toBe('i3')
  })
  it('agrupa por seção e confere a quem o modelo serve', () => {
    expect(porSecao(itens).map((g) => [g.secao, g.itens.length])).toEqual([['Loja', 2], ['Corredor', 1]])
    expect(modeloServeUnidade({ ativo: true, publico: false, unidades: ['u1'] }, 'u1')).toBe(true)
    expect(modeloServeUnidade({ ativo: true, publico: false, unidades: ['u1'] }, 'u2')).toBe(false)
    expect(modeloServeUnidade({ ativo: false, publico: true, unidades: [] }, 'u1')).toBe(false)
  })
})

describe('períodos, pendências e atrasos', () => {
  const quinta = new Date(2026, 10, 19, 15).getTime() // quinta-feira
  it('calcula o início do período', () => {
    expect(new Date(inicioPeriodo('diaria', quinta)).getDate()).toBe(19)
    expect(new Date(inicioPeriodo('semanal', quinta)).getDate()).toBe(16) // segunda
    expect(new Date(inicioPeriodo('mensal', quinta)).getDate()).toBe(1)
    expect(new Date(periodoAnterior('semanal', inicioPeriodo('semanal', quinta))).getDate()).toBe(9)
    expect(new Date(periodoAnterior('mensal', inicioPeriodo('mensal', quinta))).getMonth()).toBe(9)
  })
  const modelo = { id: 'm1', frequencia: 'diaria' as const, criadoEmMs: new Date(2026, 0, 1).getTime() }
  it('em dia, pendente e atrasado', () => {
    expect(situacaoModelo(modelo, [{ modeloId: 'm1', criadoEmMs: quinta - 3600_000 }], quinta).situacao).toBe('em_dia')
    expect(situacaoModelo(modelo, [{ modeloId: 'm1', criadoEmMs: quinta - DIA }], quinta).situacao).toBe('pendente')
    expect(situacaoModelo(modelo, [{ modeloId: 'm1', criadoEmMs: quinta - 3 * DIA }], quinta).situacao).toBe('atrasado')
    expect(situacaoModelo(modelo, [{ modeloId: 'outro', criadoEmMs: quinta }], quinta).situacao).toBe('atrasado')
    expect(situacaoModelo({ ...modelo, criadoEmMs: quinta - 3600_000 }, [], quinta).situacao).toBe('pendente')
    expect(situacaoModelo({ ...modelo, frequencia: 'avulsa' }, [], quinta).situacao).toBe('avulso')
    expect(situacaoModelo(modelo, [{ modeloId: 'm1', criadoEmMs: quinta - DIA }], quinta).ultimaMs).toBe(quinta - DIA)
  })
})

describe('histórico e não conformidades', () => {
  it('filtra por unidade, modelo, datas e só com não conformidade', () => {
    const lista = [
      exec({ id: 'a', unidadeId: 'u1', criadoEmMs: 10 * DIA, qtdNaoOk: 1 }),
      exec({ id: 'b', unidadeId: 'u2', criadoEmMs: 20 * DIA }),
      exec({ id: 'c', unidadeId: 'u1', modeloId: 'm2', criadoEmMs: 30 * DIA }),
    ]
    expect(filtrarExecucoes(lista, {}).map((e) => e.id)).toEqual(['c', 'b', 'a'])
    expect(filtrarExecucoes(lista, { unidadeId: 'u1' }).map((e) => e.id)).toEqual(['c', 'a'])
    expect(filtrarExecucoes(lista, { modeloId: 'm2' }).map((e) => e.id)).toEqual(['c'])
    expect(filtrarExecucoes(lista, { deMs: 15 * DIA, ateMs: 20 * DIA }).map((e) => e.id)).toEqual(['b'])
    expect(filtrarExecucoes(lista, { soComNaoConformidade: true }).map((e) => e.id)).toEqual(['a'])
  })
  it('lista os itens Não OK com explicação e evidência', () => {
    const r = resp(['ok', 'nao_ok', 'nao_ok'], [{}, { obs: 'Sem troco', evidenciaUrl: 'https://x.y' }, { obs: 'Sujo' }])
    const ncs = naoConformidades([exec({ id: 'e1', respostas: r, criadoEmMs: 5 })])
    expect(ncs.map((n) => n.texto)).toEqual(['Caixa', 'Limpeza'])
    expect(ncs[0]).toMatchObject({ execucaoId: 'e1', obs: 'Sem troco', evidenciaUrl: 'https://x.y', secao: 'Loja' })
  })
})

describe('papéis', () => {
  it('gestão para admin ou equipe da franqueadora com o módulo', () => {
    expect(podeGerirChecklist({ papel: 'admin' }, true)).toBe(true)
    expect(podeGerirChecklist({ papel: 'equipe_franqueadora', modulosLiberados: ['checklist'] }, false)).toBe(true)
    expect(podeGerirChecklist({ papel: 'equipe_franqueadora', modulosLiberados: [] }, false)).toBe(false)
    expect(podeGerirChecklist({ papel: 'franqueado', modulosLiberados: ['checklist'] }, false)).toBe(false)
    expect(fazChecklist({ papel: 'equipe_franqueado' })).toBe(true)
    expect(fazChecklist({ papel: 'admin' })).toBe(false)
  })
})

describe('horário de liberação', () => {
  const modelo = { horarioLiberacao: '08:30' }

  it.each([
    ['2026-11-26T11:29:59Z', false],
    ['2026-11-26T11:30:00Z', true],
    ['2026-11-27T10:00:00Z', false],
    ['2026-11-27T03:00:00Z', false],
  ])('avalia %s em Brasília', (iso, liberado) => {
    expect(liberacaoChecklist(modelo, new Date(iso))).toEqual({ liberado, horario: '08:30' })
  })

  it.each([{}, { horarioLiberacao: null }])('libera modelo sem horário (%j)', (semHorario) => {
    expect(liberacaoChecklist(semHorario, new Date('2026-11-26T03:00:00Z')))
      .toEqual({ liberado: true, horario: null })
  })

  it.each(['00:00', '08:30', '23:59'])('aceita %s', (horario) => {
    expect(horarioValido(horario)).toBe(true)
  })

  it.each(['', '8:30', '24:00', '08:60', '08:30:00', '08:30 ', '08:30\n', null])('rejeita %j', (horario) => {
    expect(horarioValido(horario)).toBe(false)
  })
})

describe('primeiro vencimento por unidade', () => {
  it.each(['diaria', 'semanal', 'mensal'] as const)('mantém a rotina %s antiga de Aurora pendente até o fim do primeiro vencimento', (frequencia) => {
    const hoje = new Date(2026, 10, 26, 12).getTime()
    const amanhaFim = new Date(2026, 10, 27, 23, 59).getTime()
    const depois = new Date(2026, 10, 28).getTime()
    const modelo = { id: 'm1', frequencia, criadoEmMs: new Date(2026, 2, 1).getTime() }
    const vigencia = { inicio: '2026-11-26', primeiroVencimento: '2026-11-27' }
    const feita = [{ modeloId: modelo.id, criadoEmMs: hoje }]

    expect(situacaoModelo(modelo, [], hoje).situacao).toBe('atrasado')
    expect(situacaoModelo(modelo, [], hoje, vigencia)).toMatchObject({
      situacao: 'pendente', venceEmMs: depois, primeiroVencimentoMs: depois, aguardandoInicio: false,
    })
    expect(situacaoModelo(modelo, [], amanhaFim, vigencia).situacao).toBe('pendente')
    expect(situacaoModelo(modelo, [], depois, vigencia).situacao).toBe('atrasado')
    expect(situacaoModelo(modelo, feita, depois, vigencia).situacao).toBe(frequencia === 'diaria' ? 'pendente' : 'em_dia')
  })
})

describe('datas e transição da vigência', () => {
  it('mostra a data inicial futura e ignora execuções anteriores ao início', () => {
    const modelo = { id: 'm1', frequencia: 'semanal' as const, criadoEmMs: new Date(2026, 1, 1).getTime() }
    const vigencia = { inicio: '2026-11-26', primeiroVencimento: '2026-11-29' }
    const antiga = [{ modeloId: 'm1', criadoEmMs: new Date(2026, 10, 25, 12).getTime() }]
    expect(situacaoModelo(modelo, antiga, new Date(2026, 10, 25, 18).getTime(), vigencia)).toMatchObject({
      situacao: 'pendente', aguardandoInicio: true, ultimaMs: null, venceEmMs: new Date(2026, 10, 30).getTime(),
    })
    expect(situacaoModelo(modelo, antiga, new Date(2026, 10, 30).getTime(), vigencia).situacao).toBe('atrasado')
  })

  it('usa execuções de uma janela inicial longa e depois volta aos períodos regulares', () => {
    const modelo = { id: 'm1', frequencia: 'mensal' as const, criadoEmMs: 0 }
    const inicio = new Date(2026, 5, 1).getTime()
    const vigencia = {
      id: 'v1', modeloId: 'm1', unidadeId: 'aurora', registradoPorNome: 'Ana', registradoEmMs: inicio,
      inicio: '2026-06-01', primeiroVencimento: '2026-11-27',
    }
    const execucoes = [{ modeloId: 'm1', criadoEmMs: inicio }]
    const depois = new Date(2026, 10, 28).getTime()
    const dezembro = new Date(2026, 11, 1).getTime()
    const janeiro = new Date(2027, 0, 1).getTime()
    const deMs = new Date(2026, 9, 1).getTime()
    expect(inicioHistoricoVigencias([vigencia], [modelo], depois, deMs)).toBe(inicio)
    expect(situacaoModelo(modelo, execucoes, depois, vigencia).situacao).toBe('em_dia')
    expect(situacaoModelo(modelo, execucoes, dezembro, vigencia).situacao).toBe('pendente')
    expect(situacaoModelo(modelo, execucoes, janeiro, vigencia).situacao).toBe('atrasado')
    expect(inicioHistoricoVigencias([vigencia], [modelo], janeiro, deMs)).toBe(deMs)
  })

  it('valida datas de calendário e sugere o fim do período que contém o início', () => {
    expect(validarVigencia({ inicio: '2026-02-30', primeiroVencimento: '2026-03-02' }, '2026-03-01')).toHaveLength(1)
    expect(validarVigencia({ inicio: '2026-03-03', primeiroVencimento: '2026-03-02' }, '2026-03-01')).toHaveLength(1)
    expect(validarVigencia({ inicio: '2026-03-01', primeiroVencimento: '2026-03-01' }, '2026-03-02')).toEqual([])
    expect(primeiroVencimentoPadrao('diaria', '2026-12-31')).toBe('2026-12-31')
    expect(primeiroVencimentoPadrao('semanal', '2026-12-31')).toBe('2027-01-03')
    expect(primeiroVencimentoPadrao('mensal', '2028-02-12')).toBe('2028-02-29')
  })
})

describe('rascunhos', () => {
  it('usa o dia de Brasília, a segunda-feira e o primeiro dia do mês', () => {
    const agora = Date.parse('2026-12-01T01:00:00Z')
    expect(periodoRascunho('diaria', agora)).toBe('2026-11-30')
    expect(periodoRascunho('semanal', agora)).toBe('2026-11-30')
    expect(periodoRascunho('mensal', agora)).toBe('2026-11-01')
    expect(periodoRascunho('avulsa', agora)).toBe('avulsa')
    expect(periodoRascunho('semanal', Date.parse('2026-11-30T01:00:00Z'))).toBe('2026-11-23')
  })

  it('recupera por ID, preserva o modelo e limpa valores dispensados', () => {
    const iniciais = respostasIniciais({ itens })
    expect(mesclarRespostasRascunho({ itens }, [
      { itemId: 'i3', resultado: 'na', obs: 'antiga', evidenciaUrl: 'https://example.com' },
      { itemId: 'removido', resultado: 'ok' },
      { resultado: 'ok' },
      { itemId: 'i2', resultado: 'inválido', obs: 15, peso: 99 },
    ])).toEqual([iniciais[0], iniciais[1], { ...iniciais[2], resultado: 'na' }])
  })

  it('dispensa foto e observação de item N/A com ambas obrigatórias', () => {
    const modelo = { itens: [{ ...itens[0], exigeEvidencia: true, exigeObs: true }] }
    const respostas = respostasIniciais(modelo).map((r): Resposta => ({ ...r, resultado: 'na' }))
    expect(validarExecucao(modelo, respostas)).toEqual({ gerais: [], porItem: {} })
  })
})
