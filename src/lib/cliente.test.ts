import { describe, expect, it, vi } from 'vitest'
import {
  centavos,
  ativarECopiar,
  estadoResumo,
  gerarToken,
  kpisClientes,
  linkPainel,
  primeiroNomeDe,
  proximaCompetencia,
  resumoCobrancas,
  situacao,
  tokenValido,
  validarCliente,
  validarCobranca,
  validarRecado,
  vencimentoDe,
  type Cliente,
  type Cobranca,
  type Painel,
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

  it('ordena cobranças, visitas e recados do mais recente para o mais antigo', async () => {
    const { ordenarCobrancas, ordenarRecados, ordenarVisitas } = await import('./cliente')
    expect(ordenarCobrancas([cob('2026-01'), cob('2026-03'), cob('2026-02')]).map((c) => c.competencia)).toEqual(['2026-03', '2026-02', '2026-01'])
    expect(ordenarVisitas([{ id: 'a', data: '2026-01-02', hora: '09:00', motivo: '', status: 'agendada' }, { id: 'b', data: '2026-01-02', hora: '10:00', motivo: '', status: 'agendada' }]).map((v) => v.id)).toEqual(['b', 'a'])
    expect(ordenarRecados([{ id: 'x', texto: 'oi', criadoEmMs: 1, autor: '', geradoPorIA: false, iaModelo: '' }, { id: 'y', texto: 'oi', criadoEmMs: 2, autor: '', geradoPorIA: false, iaModelo: '' }]).map((r) => r.id)).toEqual(['y', 'x'])
  })

  it('autor do recado é uma palavra só (primeiro nome) ou "Equipe"', async () => {
    const { autorRecado } = await import('./cliente')
    expect(autorRecado('  Ana Paula Souza ')).toBe('Ana')
    expect(autorRecado('')).toBe('Equipe')
    expect(autorRecado('x'.repeat(60))).toHaveLength(40)
    expect(autorRecado('Maria\tdas Dores')).toMatch(/^[^ ]{1,40}$/)
  })

  it('valida o cadastro e o recado com IA', () => {
    const f = { nome: 'Maria Silva', telefone: '(34) 99999-0000', email: '', box: 'Box 1', contratoInicio: '2026-11-01', contratoFim: '', valorMensal: '289,90', diaVencimento: '10', obs: '' }
    expect(validarCliente(f)).toEqual([])
    expect(validarCliente({ ...f, diaVencimento: '31' })).toHaveLength(1)
    expect(validarCliente({ ...f, contratoFim: '2026-10-01' })).toHaveLength(1)
    expect(validarCliente({ ...f, email: 'x@' })).toHaveLength(1)
    expect(validarCliente({ ...f, valorMensal: '' })).toHaveLength(1)
    expect(validarCliente({ ...f, valorMensal: 'R$' })).toContain('Mensalidade inválida.')
    expect(validarCliente({ ...f, contratoInicio: '2026-11-31' })).toContain('Informe o início do contrato.')
    expect(validarCliente({ ...f, contratoFim: '2027-02-29' })).toContain('Informe uma data válida para o fim do contrato.')
    expect(validarRecado('Olá', true, '')).toHaveLength(1)
    expect(validarRecado('Olá', true, 'Grok Bot')).toEqual([])
  })

  it('monta o link com hash e calcula os números da unidade', () => {
    expect(linkPainel('a'.repeat(32), 'https://x.github.io/app/')).toBe(`https://x.github.io/app/#/painel/${'a'.repeat(32)}`)
    const c = (id: string, status: Cliente['status'], valor: number): Cliente => ({ id, unidadeId: 'u', nome: id, telefone: '', email: '', box: 'B', contratoInicioMs: 1, contratoFimMs: 0, valorMensalCentavos: valor, diaVencimento: 10, status, painelToken: id, obs: '', criadoEmMs: 1, atualizadoPorNome: '', atualizadoEmMs: 1 })
    const p = (clienteId: string, ativo: boolean) => [clienteId, { clienteId, ativo } as unknown as Painel] as const
    const k = kpisClientes([c('a', 'ativo', 20000), c('b', 'ativo', 30000), c('z', 'encerrado', 99999)], new Map([p('a', true), p('b', false)]), new Map([['a', [cob('2026-10')]], ['b', []], ['z', [cob('2026-01')]]]), '2026-11-19')
    expect(k).toEqual({ ativos: 2, receitaMensalCentavos: 50000, atrasadoCentavos: 10000, clientesEmAtraso: 1, linksAtivos: 1 })
  })
})

describe('módulo 12: competência', () => {
  it('escreve o mês com só a primeira letra maiúscula', async () => {
    const { formatarCompetencia } = await import('./cliente')
    expect(formatarCompetencia('2026-12')).toBe('Dezembro de 2026')
  })
})

it('valida o mês e o dia de vencimento da cobrança', () => {
  expect(validarCobranca({ competencia: '2026-13', vencimento: '2026-12-10', valor: '10' })).toContain('Informe o mês de referência.')
  expect(validarCobranca({ competencia: '2026-02', vencimento: '2026-02-30', valor: '10' })).toContain('Informe o vencimento.')
  expect(validarCobranca({ competencia: '2028-02', vencimento: '2028-02-29', valor: '10' })).toEqual([])
})

describe('ativarECopiar', () => {
  it('não copia quando a ativação falha', async () => {
    const copiar = vi.fn()
    const ativar = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await ativarECopiar({ ativar, copiar })).toBe('falha_ativacao')
    expect(copiar).not.toHaveBeenCalled()
  })

  it('preserva a ativação quando copiar falha', async () => {
    const ativar = vi.fn().mockResolvedValue(undefined)
    const copiar = vi.fn().mockRejectedValue(new Error('bloqueado'))
    expect(await ativarECopiar({ ativar, copiar })).toBe('ativado_sem_copia')
  })

  it('copia somente depois de a ativação resolver', async () => {
    let confirmar!: () => void
    const ativar = () => new Promise<void>((resolve) => { confirmar = resolve })
    const copiar = vi.fn().mockResolvedValue(undefined)
    const resultado = ativarECopiar({ ativar, copiar })
    expect(copiar).not.toHaveBeenCalled()
    confirmar()
    expect(await resultado).toBe('copiado')
    expect(copiar).toHaveBeenCalledOnce()
  })
})

describe('estadoResumo', () => {
  const hoje = '2026-11-10'
  it('aguarda a primeira cobrança quando o histórico está vazio', () => {
    expect(estadoResumo([], hoje)).toBe('aguardando_primeira')
  })

  it('prioriza atraso mesmo com uma cobrança pendente', () => {
    expect(estadoResumo([cob('2026-11'), cob('2026-10')], hoje)).toBe('em_atraso')
  })

  it('indica pendência quando a cobrança em aberto vence hoje', () => {
    expect(estadoResumo([cob('2026-11'), cob('2026-10', 'pago')], hoje)).toBe('pendente')
  })

  it('indica em dia quando todas as cobranças do histórico foram pagas', () => {
    expect(estadoResumo([cob('2026-10', 'pago')], hoje)).toBe('em_dia')
  })
})
