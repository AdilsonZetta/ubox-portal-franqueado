// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { describe, expect, it } from 'vitest'
import { mapChamadoSb, mapEventoChamadoSb } from './chamadosSupabase'

const criado = '2026-11-20T13:00:00Z'

describe('mapeadores de chamados no Supabase', () => {
  it('preserva IDs, anexos e datas do chamado', () => {
    const chamado = mapChamadoSb({
      id: 'ch-legado', titulo: 'Porta', categoria: 'operacao', prioridade: 'alta',
      descricao: 'Porta travada', anexos: [{ nome: 'Foto', url: 'https://exemplo.test/foto' }],
      status: 'resolvido', unidade_id: 'un-1', unidade_nome: 'Centro', aberto_por: 'autor',
      aberto_por_nome: 'Pessoa Autora', responsavel_id: 'rede', responsavel_nome: 'Suporte',
      avaliacao: null, sla_horas: 24, criado_em: criado, atualizado_em: criado,
      resolvido_em: criado, fechado_em: null,
    })
    expect(chamado).toMatchObject({
      id: 'ch-legado', unidadeId: 'un-1', unidadeNome: 'Centro', abertoPor: 'autor',
      abertoPorNome: 'Pessoa Autora', responsavelId: 'rede', responsavelNome: 'Suporte',
      anexos: [{ nome: 'Foto', url: 'https://exemplo.test/foto' }],
      slaHoras: 24, avaliacao: null, fechadoEm: null, reabertoEm: null,
    })
    expect(chamado?.criadoEm?.toMillis()).toBe(Date.parse(criado))
    expect(chamado?.atualizadoEm?.toMillis()).toBe(Date.parse(criado))
    expect(chamado?.resolvidoEm?.toMillis()).toBe(Date.parse(criado))
  })

  it('descarta chamado com status desconhecido', () => {
    expect(mapChamadoSb({ id: 'ch', categoria: 'operacao', prioridade: 'alta', status: 'inválido' })).toBeNull()
  })

  it('converte o evento e mantém a data ausente se for inválida', () => {
    const linha = {
      id: 'ev-legado', tipo: 'status', texto: 'Resolvido', de: 'aberto', para: 'resolvido',
      autor_id: 'rede', autor_nome: 'Suporte', criado_em: criado,
    }
    expect(mapEventoChamadoSb(linha)).toMatchObject({
      id: 'ev-legado', tipo: 'status', texto: 'Resolvido', de: 'aberto', para: 'resolvido',
      autorId: 'rede', autorNome: 'Suporte',
    })
    expect(mapEventoChamadoSb(linha)?.criadoEm?.toMillis()).toBe(Date.parse(criado))
    expect(mapEventoChamadoSb({ ...linha, criado_em: 'inválida' })?.criadoEm).toBeUndefined()
  })
})
