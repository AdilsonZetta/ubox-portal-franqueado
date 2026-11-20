import { describe, expect, it } from 'vitest'
import {
  ORIGENS_PADRAO,
  atrasado,
  calcularKpis,
  centavos,
  followUps,
  kpisPorUnidade,
  normalizarLista,
  podeGerirCrm,
  porEtapa,
  validarContato,
  validarLead,
  validarProposta,
  type Etapa,
  type Lead,
} from './crm'

const DIA = 86_400_000
const AGORA = new Date('2026-11-19T15:00:00').getTime()
let n = 0
const lead = (etapa: Etapa, extra: Partial<Lead> = {}): Lead => ({
  id: `l${++n}`, unidadeId: 'u1', unidadeNome: 'U1', origem: 'Site', interesseTamanho: '', interessePeriodo: '', interesseUso: '', valorEstimadoCentavos: null,
  etapa, motivoPerda: etapa === 'perdido' ? 'Preço' : '', responsavelUid: 'a', responsavelNome: 'A', proximoContatoMs: 0, ultimaAtividadeMs: 0, arquivado: false,
  criadoEmMs: AGORA - 10 * DIA, etapaEmMs: 0, fechadoEmMs: etapa === 'ganho' || etapa === 'perdido' ? AGORA - 4 * DIA : 0, atualizadoPorNome: '', ...extra,
})

describe('KPIs', () => {
  it('conversão, tempo até fechar, origem e motivos', () => {
    const leads = [
      lead('ganho', { origem: 'Instagram', valorEstimadoCentavos: 30000 }),
      lead('ganho', { origem: 'Site', criadoEmMs: AGORA - 20 * DIA, fechadoEmMs: AGORA - 10 * DIA }),
      lead('perdido', { origem: 'Site' }),
      lead('contato', { origem: 'Site', proximoContatoMs: AGORA - DIA }),
    ]
    const k = calcularKpis(leads, AGORA)
    expect(k.total).toBe(4)
    expect(k.conversao).toBe(67)
    expect(k.diasParaFechar).toBe(8)
    expect(k.atrasados).toBe(1)
    expect(k.valorGanhoCentavos).toBe(30000)
    expect(k.porOrigem[0]).toEqual({ origem: 'Site', total: 3, ganhos: 1 })
    expect(k.motivosPerda).toEqual([{ motivo: 'Preço', total: 1 }])
  })
  it('sem fechados não há conversão', () => {
    expect(calcularKpis([lead('novo')], AGORA).conversao).toBeNull()
  })
  it('filtra pelo período de criação', () => {
    expect(calcularKpis([lead('novo', { criadoEmMs: AGORA - 100 * DIA }), lead('novo')], AGORA, AGORA - 30 * DIA).total).toBe(1)
  })
  it('agrupa por unidade', () => {
    const r = kpisPorUnidade([lead('ganho'), lead('perdido', { unidadeId: 'u2', unidadeNome: 'U2' })], AGORA)
    expect(r.map((u) => [u.unidadeId, u.conversao])).toEqual([['u1', 100], ['u2', 0]])
  })
})

describe('follow-up e kanban', () => {
  it('atrasado só se aberto, não arquivado e com data passada', () => {
    expect(atrasado(lead('contato', { proximoContatoMs: AGORA - 1 }), AGORA)).toBe(true)
    expect(atrasado(lead('ganho', { proximoContatoMs: AGORA - 1 }), AGORA)).toBe(false)
    expect(atrasado(lead('contato', { proximoContatoMs: AGORA - 1, arquivado: true }), AGORA)).toBe(false)
    expect(atrasado(lead('contato'), AGORA)).toBe(false)
  })
  it('separa atrasados, hoje e sem data', () => {
    const f = followUps([lead('novo', { proximoContatoMs: AGORA - DIA }), lead('visita', { proximoContatoMs: AGORA + 3600_000 }), lead('proposta')], AGORA)
    expect([f.atrasados.length, f.hoje.length, f.semData.length]).toEqual([1, 1, 1])
  })
  it('kanban esconde arquivados por padrão', () => {
    const g = porEtapa([lead('novo'), lead('novo', { arquivado: true })])
    expect(g.novo).toHaveLength(1)
    expect(porEtapa([lead('novo'), lead('novo', { arquivado: true })], true).novo).toHaveLength(2)
  })
})

describe('validações', () => {
  const base = { nome: 'Maria Souza', telefone: '(34) 99999-0000', email: '', origem: 'Site', interesseTamanho: '6 m²', interessePeriodo: '', interesseUso: '', valorEstimado: '', responsavelUid: 'a', proximoContato: '' }
  it('lead', () => {
    expect(validarLead(base, ORIGENS_PADRAO)).toEqual([])
    expect(validarLead({ ...base, origem: 'TikTok' }, ORIGENS_PADRAO)).toHaveLength(1)
    expect(validarLead({ ...base, valorEstimado: 'abc' }, ORIGENS_PADRAO)).toHaveLength(1)
  })
  it('contato precisa de um canal e formatos válidos', () => {
    expect(validarContato({ nome: 'Maria', telefone: '', email: '' })).toHaveLength(1)
    expect(validarContato({ nome: 'Maria', telefone: 'abc', email: '' }).length).toBeGreaterThan(0)
    expect(validarContato({ nome: 'Maria', telefone: '', email: 'maria@x' })).toHaveLength(1)
    expect(validarContato({ nome: 'Maria', telefone: '', email: 'maria@x.com' })).toEqual([])
  })
  it('proposta', () => {
    expect(validarProposta('Box 12', '289,90', 3, '2026-12-01', AGORA)).toEqual([])
    expect(validarProposta('', '0', 0, '2026-01-01', AGORA)).toHaveLength(4)
  })
  it('centavos e listas', () => {
    expect(centavos('289,90')).toBe(28990)
    expect(centavos('')).toBeNull()
    expect(normalizarLista([' Site ', 'site', '', 'Google'])).toEqual(['Site', 'Google'])
  })
  it('quem gere', () => {
    expect(podeGerirCrm({ papel: 'equipe_franqueadora', modulosLiberados: ['crm'] }, false)).toBe(true)
    expect(podeGerirCrm({ papel: 'franqueado', modulosLiberados: ['crm'] }, false)).toBe(false)
  })
})
