import { describe, expect, it } from 'vitest'
import type { Usuario } from '../types'
import { acoesPermitidas, escolherRotina, type ModeloInicio } from './inicioUnidade'

const perfil: Usuario = { uid: 'p', email: '', nome: 'Ana', papel: 'franqueado', ativo: true, recusado: false, unidade: 'Uberaba', cidade: 'Uberaba' }
const agora = new Date('2026-11-19T11:00:00Z')
const modelo: ModeloInicio = {
  id: 'abertura', titulo: 'Abertura', criadoEmMs: 0, frequencia: 'diaria', tipo: 'abertura', ativo: true, publico: true, unidades: [],
}
const hoje = { modeloId: modelo.id, unidadeId: 'u', criadoEmMs: +agora }
const ontem = { ...hoje, criadoEmMs: +agora - 86_400_000 }

describe('Ações no início da unidade', () => {
  it('respeita perfil, módulos liberados e vínculo com uma unidade', () => {
    expect(acoesPermitidas({ ...perfil, papel: 'equipe_franqueado', unidadeId: 'u', modulosLiberados: ['checklist', 'manuais'] }, false))
      .toEqual(['checklist', 'manuais'])
    expect(acoesPermitidas({ ...perfil, papel: 'franqueado', modulosLiberados: ['checklist', 'chamados', 'universidade'] }, true))
      .toEqual(['chamados', 'universidade'])
    expect(acoesPermitidas({ ...perfil, papel: 'admin' }, false)).toEqual([])
    expect(acoesPermitidas({ ...perfil, papel: 'franqueado', unidadeId: 'u' }, false)).toEqual([])
  })

  it('distingue pendente, atrasado e concluído e ignora dados de outra unidade', () => {
    expect(escolherRotina([modelo], [ontem], [], 'u', agora)).toMatchObject({ estado: 'pendente' })
    expect(escolherRotina([modelo], [{ ...hoje, unidadeId: 'outra' }], [], 'u', agora)).toMatchObject({ estado: 'atrasado' })
    expect(escolherRotina([modelo], [hoje], [], 'u', agora)).toMatchObject({ estado: 'em_dia' })
    expect(escolherRotina([{ ...modelo, publico: false, unidades: ['outra'] }], [], [], 'u', agora))
      .toEqual({ estado: 'sem_rotina' })
  })

  it('respeita o horário de Brasília e a data de início da vigência', () => {
    expect(escolherRotina([{ ...modelo, horarioLiberacao: '09:00' }], [], [], 'u', agora))
      .toMatchObject({ estado: 'aguardando_horario', horario: '09:00' })
    expect(escolherRotina([modelo], [], [{
      id: 'v', modeloId: modelo.id, unidadeId: 'u', inicio: '2026-11-20', primeiroVencimento: '2026-11-20',
      registradoPorNome: 'Ana', registradoEmMs: 0,
    }], 'u', agora)).toMatchObject({ estado: 'aguardando_inicio', inicio: '2026-11-20' })
  })

  it('prioriza atraso, rotina diária e abertura entre os modelos liberados', () => {
    const semanal = { ...modelo, id: 'semana', frequencia: 'semanal' as const }
    const fechamento = { ...modelo, id: 'fechamento', tipo: 'fechamento' as const }
    expect(escolherRotina([modelo, semanal], [ontem], [], 'u', agora)).toMatchObject({ modelo: semanal, estado: 'atrasado' })
    expect(escolherRotina([semanal, fechamento, modelo], [], [], 'u', agora)).toMatchObject({ modelo })
    expect(escolherRotina([{ ...modelo, horarioLiberacao: '09:00' }, fechamento], [], [], 'u', agora))
      .toMatchObject({ modelo: fechamento, estado: 'atrasado' })
  })
})
