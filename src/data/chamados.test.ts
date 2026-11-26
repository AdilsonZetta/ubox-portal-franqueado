import { describe, expect, it } from 'vitest'
import { SLA_HORAS, calcularPrazoChamado, chamadoAtrasado, chamadoPendente, prazoMillis, slaHoras, tempoMedioResolucaoHoras } from './chamados'

const hora = 60 * 60 * 1000

describe('SLA de chamados', () => {
  it('usa os prazos da constante', () => {
    expect(slaHoras('urgente')).toBe(SLA_HORAS.urgente)
    expect(slaHoras('alta')).toBe(24)
    expect(slaHoras('media')).toBe(48)
    expect(slaHoras('baixa')).toBe(72)
    expect(prazoMillis(1_000, 4)).toBe(1_000 + 4 * hora)
  })

  it('marca atrasado só enquanto o chamado segue aberto', () => {
    const criado = Date.now() - 5 * hora
    expect(chamadoAtrasado('aberto', criado, 4)).toBe(true)
    expect(chamadoAtrasado('fechado', criado, 4)).toBe(false)
    expect(chamadoAtrasado('aberto', Date.now(), 4)).toBe(false)
    expect(chamadoAtrasado('aberto', criado, 4, Date.now(), Date.now())).toBe(false)
    expect(chamadoPendente('aguardando_franqueado')).toBe(true)
    expect(chamadoPendente('resolvido')).toBe(false)
  })

  it('calcula o tempo médio só dos chamados resolvidos ou fechados', () => {
    const inicio = hora
    const media = tempoMedioResolucaoHoras([
      { status: 'resolvido', criadoEm: inicio, resolvidoEm: inicio + 2 * hora, fechadoEm: 0 },
      { status: 'fechado', criadoEm: inicio, resolvidoEm: 0, fechadoEm: inicio + 4 * hora },
      { status: 'aberto', criadoEm: inicio, resolvidoEm: 0, fechadoEm: 0 },
    ])
    expect(media).toBe(3)
  })
})

describe('Prazo unificado dos chamados', () => {
  const base = { status: 'aberto', criadoEmMs: 1_000, slaHoras: 24 }

  it('congela o tempo restante durante a pausa e protege registros antigos', () => {
    const aguardando = { ...base, status: 'aguardando_franqueado', pausadoEmMs: base.criadoEmMs + 2 * hora }
    for (const agora of [base.criadoEmMs + 3 * hora, base.criadoEmMs + 30 * hora]) {
      expect(calcularPrazoChamado(aguardando, agora)).toMatchObject({
        pausado: true, pendente: true, atrasado: false, restanteMs: 22 * hora,
      })
    }
    expect(calcularPrazoChamado({ ...aguardando, pausadoEmMs: undefined }, 30 * hora)).toMatchObject({
      pausado: true, pausaMs: 0, atrasado: false,
    })
    expect(chamadoAtrasado(aguardando.status, base.criadoEmMs, 24, 30 * hora)).toBe(false)
  })

  it('soma pausas concluídas e só vence após o limite', () => {
    const chamado = { ...base, pausaAcumuladaMs: 2 * hora }
    const vence = base.criadoEmMs + 26 * hora
    expect(calcularPrazoChamado(chamado, vence)).toMatchObject({
      venceEmMs: vence, pausaMs: 2 * hora, restanteMs: 0, atrasado: false,
    })
    expect(calcularPrazoChamado(chamado, vence + 1).atrasado).toBe(true)
    expect(calcularPrazoChamado({ ...base, slaHoras: 0 }, vence).venceEmMs).toBe(0)
    expect(calcularPrazoChamado({ ...base, criadoEmMs: 0 }, vence).atrasado).toBe(false)
  })

  it.each([
    ['aberto', null, undefined, 'franqueadora', 'Franqueadora'],
    ['em_andamento', 'Ana', undefined, 'franqueadora', 'Franqueadora · Ana'],
    ['aguardando_franqueado', null, undefined, 'unidade', 'Unidade'],
    ['aguardando_franqueado', null, 'Centro', 'unidade', 'Unidade · Centro'],
    ['resolvido', null, 'Centro', 'unidade', 'Unidade confirma a solução'],
    ['fechado', null, undefined, 'ninguem', 'Encerrado'],
    ['outro', null, undefined, 'ninguem', 'Encerrado'],
  ])('indica quem responde no status %s', (status, responsavelNome, unidadeNome, quemResponde, rotuloQuemResponde) => {
    expect(calcularPrazoChamado({ ...base, status, responsavelNome, unidadeNome })).toMatchObject({
      quemResponde, rotuloQuemResponde,
    })
  })
})
