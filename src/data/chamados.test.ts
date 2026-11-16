import { describe, expect, it } from 'vitest'
import { SLA_HORAS, chamadoAtrasado, chamadoPendente, prazoMillis, slaHoras, tempoMedioResolucaoHoras } from './chamados'

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