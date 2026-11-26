import { expect, it } from 'vitest'
import { adesaoDoPainel, chamadosDoPainel, rotinasDeHoje, treinamentoDaUnidade } from './painelInicial'

it('conta apenas chamados abertos do solicitante e preserva fonte indisponível', () => {
  const base = { unidadeId: 'u1', criadoEmMs: 1, reabertoEmMs: 0, pausadoEmMs: 0, pausaAcumuladaMs: 0, slaHoras: 1 }
  const chamados = [
    { ...base, status: 'aberto' as const, abertoPor: 'ana' },
    { ...base, status: 'aberto' as const, abertoPor: 'bia' },
    { ...base, status: 'aguardando_franqueado' as const, abertoPor: 'ana' },
    { ...base, status: 'aberto' as const, abertoPor: 'ana', unidadeId: 'u2' },
    { ...base, status: 'fechado' as const, abertoPor: 'ana' },
  ]
  expect(chamadosDoPainel(chamados, 7_200_000, 'u1', 'ana')).toMatchObject({ abertos: 2, aguardando: 1 })
  expect(chamadosDoPainel(null, 7_200_000, 'u1')).toBeNull()
})

it('conta uma rotina concluída hoje apenas uma vez e dentro da unidade', () => {
  const agora = new Date('2026-11-26T15:00:00-03:00').getTime()
  const modelo = { id: 'm', titulo: 'Abertura', tipo: 'abertura' as const, frequencia: 'diaria' as const, ativo: true, publico: true, unidades: [], criadoEmMs: 0 }
  const execucao = { unidadeId: 'u1', modeloId: 'm', criadoEmMs: agora - 60000, respostas: [] }
  expect(rotinasDeHoje([modelo], [execucao, execucao], [], 'u1', agora)?.concluidas).toBe(1)
  expect(rotinasDeHoje([modelo], [execucao], [], 'u2', agora)?.concluidas).toBe(0)
})

it('mede adesão apenas com designações e conteúdos atuais da unidade', () => {
  const designados = [
    { unidadeId: 'u1', unidadeNome: 'Uberaba', uid: 'ana', nome: 'Ana' },
    { unidadeId: 'u2', unidadeNome: 'Araxá', uid: 'bia', nome: 'Bia' },
  ]
  const feito = { unidadeId: 'u1', uid: 'ana', conteudoId: 'm1' }
  const conclusoes = [
    feito, feito,
    { ...feito, uid: 'bia' },
    { ...feito, unidadeId: 'u2', uid: 'bia', conteudoId: 'antigo' },
  ]
  expect(adesaoDoPainel(designados, new Set(['m1']), conclusoes)).toEqual({ designados: 2, concluidos: 1 })
  expect(adesaoDoPainel(null, new Set(['m1']), conclusoes)).toBeNull()
})

it('conta pessoas e certificados uma vez e restringe o treinamento à unidade', () => {
  const leitura = { unidadeId: 'u1', uid: 'ana', documentoId: 'm1', status: 'concluido' as const }
  const prova = { unidadeId: 'u1', uid: 'ana', cursoId: 'c1', aprovado: true }
  expect(treinamentoDaUnidade('u1', [leitura, leitura], [prova, prova, { ...prova, uid: 'bia', unidadeId: 'u2' }])).toEqual({
    pessoas: 1, manuais: { concluidos: 1, emAndamento: 0 }, certificados: 1,
  })
  expect(treinamentoDaUnidade('u1', [], null)).toEqual({
    pessoas: 0, manuais: { concluidos: 0, emAndamento: 0 }, certificados: null,
  })
})
