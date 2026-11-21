import type { Aceite, Documento } from '../types'

const fontes = [
  ['chamados', 'Chamados', '/chamados', 'em atraso', 'alerta'],
  ['checklists', 'Checklists', '/checklist', 'em atraso', 'alerta'],
  ['crm', 'Follow-ups do CRM', '/crm', 'em atraso', 'alerta'],
  ['cobrancas', 'Cobranças', '/clientes', 'em atraso', 'alerta'],
  ['auditoria', 'Ações de auditoria', '/auditorias', 'em atraso', 'alerta'],
  ['acompanhamento', 'Combinados', '/meu-acompanhamento', 'em atraso', 'alerta'],
  ['leituras', 'Leituras obrigatórias', '/manuais', 'aguardando aceite', 'neutro'],
  ['avisos', 'Avisos de documentos', '/notificacoes', 'não lidos', 'neutro'],
] as const

type Fonte = typeof fontes[number][0]
export type FontesPendencias = Partial<Record<Fonte, number>>

export interface Pendencia {
  id: Fonte
  titulo: string
  detalhe: string
  para: string
  tom?: 'alerta' | 'neutro'
}

type DadosPendencias = FontesPendencias & {
  documentos?: Pick<Documento, 'id' | 'status' | 'leituraObrigatoria' | 'versao'>[]
  aceites?: Pick<Aceite, 'uid' | 'documentoId' | 'versao'>[]
  uid?: string
}

export function montarPendencias({ documentos, aceites, uid, ...contagens }: DadosPendencias): Pendencia[] {
  if (documentos && aceites && uid) {
    const aceitos = new Map<string, Set<number>>()
    for (const aceite of aceites) {
      if (aceite.uid !== uid) continue
      const versoes = aceitos.get(aceite.documentoId) ?? new Set<number>()
      versoes.add(aceite.versao)
      aceitos.set(aceite.documentoId, versoes)
    }
    contagens.leituras = documentos.filter((d) => d.status === 'publicado' && d.leituraObrigatoria
      && !aceitos.get(d.id)?.has(d.versao)).length
  }
  return fontes.flatMap(([id, titulo, para, texto, tom]) => {
    const total = contagens[id] ?? 0
    const detalhe = total === 1 && id === 'avisos' ? '1 não lido' : `${total} ${texto}`
    return total > 0 ? [{ id, titulo, detalhe, para, tom }] : []
  })
}
