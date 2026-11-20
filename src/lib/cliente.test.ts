import { describe, expect, it } from 'vitest'
import {
  MAX_COBRANCAS,
  MAX_RECADOS,
  MAX_VISITAS,
  centavos,
  gerarToken,
  incluirCobranca,
  incluirRecado,
  incluirVisita,
  kpisClientes,
  linkPainel,
  primeiroNomeDe,
  proximaCompetencia,
  resumoCobrancas,
  situacao,
  tokenValido,
  validarCliente,
  validarRecado,
  vencimentoDe,
  type Cliente,
  type Cobranca,
  type Painel,
  type Visita,
} from './cliente'

const cob = (competencia: string, status: Cobranca['status'] = 'pendente', valor = 10000): Cobranca => ({ id: competencia, competencia, valorCentavos: valor, vencimento: `${competencia}-10`, status, pagoEm: status === 'pago' ? `${competencia}-09` : '' })

describe('módulo 12: painel do cliente', () => {
  it('gera token de 128 bits em hex e valida o formato', () => {
    const t = gerarToken()
    expect(t).toMatch(/^[0-9a-f]{32}$/)
    expect(gerarToken()).not.toBe(t)
    expect(tokenValido(t)).toBe(true)
    expect(tokenValido('abc')).toBe(false)
    expect(tokenValido('Z'.repeat(32))).toBe(false)
  })

  it('leva só o primeiro nome para o link público', () => {
    expect(primeiroNomeDe('  Maria   da Silva ')).toBe('Maria')
    expect(primeiroNomeDe('x'.repeat(50))).toHaveLength(40)
    expect(primeiroNomeDe('Ana')).toMatch(/^[^ ]{1,40}$/)
  })

  it('converte reais em centavos', () => {
    expect(centavos('289,90')).toBe(28990)
    expect(centavos('1.234,56')).toBe(123456)
    expect(centavos('R$ 99')).toBe(9900)
    expect(centavos('abc')).toBe(0)
  })

  it('classifica cobrança paga, em aberto e atrasada', () => {
    expect(situacao(cob('2026-11', 'pago'), '2026-12-01')).toBe('pago')
    expect(situacao(cob('2026-11'), '2026-11-10')).toBe('pendente')
    expect(situacao(cob('2026-11'), '2026-11-11')).toBe('atrasado')
  })

  it('resume o que está em aberto e a próxima cobrança', () => {
    const r = resumoCobrancas([cob('2026-10'), cob('2026-11'), cob('2026-12'), cob('2026-09', 'pago')], '2026-11-01')
    expect(r.atrasadas).toBe(1)
    expect(r.atrasadoCentavos).toBe(10000)
    expect(r.emAbertoCentavos).toBe(30000)
    expect(r.proxima?.competencia).toBe('2026-11')
  })

  it('sugere vencimento e a próxima competência livre', () => {
    expect(vencimentoDe('2026-02', 31)).toBe('2026-02-28')
    expect(vencimentoDe('2026-02', 5)).toBe('2026-02-05')
    const agora = new Date(2026, 10, 19).getTime()
    expect(proximaCompetencia([cob('2026-11')], agora)).toBe('2026-12')
    expect(proximaCompetencia([], agora)).toBe('2026-11')
  })

  it('limita as cobranças: sai a paga mais antiga e recusa repetidas ou tudo em aberto', () => {
    const cheias = Array.from({ length: MAX_COBRANCAS }, (_, i) => cob(`20${24 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, i < 2 ? 'pago' : 'pendente'))
    const nova = incluirCobranca(cheias, cob('2030-01'))
    expect(nova).toHaveLength(MAX_COBRANCAS)
    expect(nova?.some((c) => c.competencia === '2024-01')).toBe(false)
    expect(incluirCobranca(cheias, cob('2025-05'))).toBeNull()
    expect(incluirCobranca(cheias.map((c) => ({ ...c, status: 'pendente' as const })), cob('2030-02'))).toBeNull()
  })

  it('limita visitas e recados', () => {
    const v = (i: number, status: Visita['status']): Visita => ({ id: `v${i}`, data: `2026-11-${String(i + 1).padStart(2, '0')}`, hora: '10:00', motivo: '', status })
    const cheias = Array.from({ length: MAX_VISITAS }, (_, i) => v(i, i === 0 ? 'realizada' : 'agendada'))
    expect(incluirVisita(cheias, v(20, 'agendada'))?.some((x) => x.id === 'v0')).toBe(false)
    expect(incluirVisita(cheias.map((x) => ({ ...x, status: 'agendada' as const })), v(21, 'agendada'))).toBeNull()
    let recados = [] as Parameters<typeof incluirRecado>[0]
    for (let i = 0; i < 15; i++) recados = incluirRecado(recados, { id: `r${i}`, texto: 'oi', emMs: i, autor: 'Ana', geradoPorIA: false, iaModelo: '' })
    expect(recados).toHaveLength(MAX_RECADOS)
    expect(recados[0].id).toBe('r14')
  })

  it('valida o cadastro e o recado com IA', () => {
    const f = { nome: 'Maria Silva', telefone: '(34) 99999-0000', email: '', box: 'Box 1', contratoInicio: '2026-11-01', contratoFim: '', valorMensal: '289,90', diaVencimento: '10', obs: '' }
    expect(validarCliente(f)).toEqual([])
    expect(validarCliente({ ...f, diaVencimento: '31' })).toHaveLength(1)
    expect(validarCliente({ ...f, contratoFim: '2026-10-01' })).toHaveLength(1)
    expect(validarCliente({ ...f, email: 'x@' })).toHaveLength(1)
    expect(validarCliente({ ...f, valorMensal: '' })).toHaveLength(1)
    expect(validarRecado('Olá', true, '')).toHaveLength(1)
    expect(validarRecado('Olá', true, 'Grok Bot')).toEqual([])
  })

  it('monta o link com hash e calcula os números da unidade', () => {
    expect(linkPainel('a'.repeat(32), 'https://x.github.io/app/')).toBe(`https://x.github.io/app/#/painel/${'a'.repeat(32)}`)
    const c = (id: string, status: Cliente['status'], valor: number): Cliente => ({ id, unidadeId: 'u', nome: id, telefone: '', email: '', box: 'B', contratoInicioMs: 1, contratoFimMs: 0, valorMensalCentavos: valor, diaVencimento: 10, status, painelToken: id, obs: '', criadoEmMs: 1, atualizadoPorNome: '', atualizadoEmMs: 1 })
    const p = (clienteId: string, ativo: boolean, cobrancas: Cobranca[]) => [clienteId, { clienteId, ativo, cobrancas } as unknown as Painel] as const
    const k = kpisClientes([c('a', 'ativo', 20000), c('b', 'ativo', 30000), c('z', 'encerrado', 99999)], new Map([p('a', true, [cob('2026-10')]), p('b', false, [])]), '2026-11-19')
    expect(k).toEqual({ ativos: 2, receitaMensalCentavos: 50000, atrasadoCentavos: 10000, clientesEmAtraso: 1, linksAtivos: 1 })
  })
})

describe('módulo 12: competência', () => {
  it('escreve o mês com só a primeira letra maiúscula', async () => {
    const { formatarCompetencia } = await import('./cliente')
    expect(formatarCompetencia('2026-12')).toBe('Dezembro de 2026')
  })
})
