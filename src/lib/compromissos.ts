import { passoAtrasado, type PassoAc } from './acompanhamento'
import { acaoAtrasada, acaoDaUnidade, type AcaoAuditoria } from './auditoria'

type CamposComuns = 'id' | 'unidadeId' | 'descricao' | 'prazoMs' | 'responsavel' | 'status'
type Situacao = 'atrasado' | 'em_dia' | 'aguardando_validacao'

interface Compromisso {
  chave: string
  tipo: 'auditoria' | 'combinado'
  descricao: string
  prazoMs: number
  responsavel: string
  situacao: Situacao
  podeConcluir: boolean
  para: string
}

const ordem: Record<Situacao, number> = { atrasado: 0, em_dia: 1, aguardando_validacao: 2 }

export function montarCompromissos({ acoes, passos, unidadeId, papel, agoraMs }: {
  acoes: Pick<AcaoAuditoria, CamposComuns | 'auditoriaId'>[]
  passos: Pick<PassoAc, CamposComuns>[]
  unidadeId: string
  papel: string
  agoraMs: number
}): Compromisso[] {
  const itens: Compromisso[] = []
  const franqueado = papel === 'franqueado'
  for (const acao of acoes) {
    if (acao.unidadeId !== unidadeId || acao.status === 'validada') continue
    itens.push({
      chave: `auditoria-${acao.id}`,
      tipo: 'auditoria',
      descricao: acao.descricao,
      prazoMs: acao.prazoMs,
      responsavel: acao.responsavel,
      situacao: acao.status === 'concluida_unidade' ? 'aguardando_validacao'
        : acaoAtrasada(acao, agoraMs) ? 'atrasado' : 'em_dia',
      podeConcluir: franqueado && acaoDaUnidade(acao.status).includes('concluida_unidade'),
      para: `/auditorias/${acao.auditoriaId}?acao=${encodeURIComponent(acao.id)}`,
    })
  }
  for (const passo of passos) {
    if (passo.unidadeId !== unidadeId || passo.status === 'validado') continue
    itens.push({
      chave: `combinado-${passo.id}`,
      tipo: 'combinado',
      descricao: passo.descricao,
      prazoMs: passo.prazoMs,
      responsavel: passo.responsavel,
      situacao: passo.status === 'concluido_unidade' ? 'aguardando_validacao'
        : passoAtrasado(passo, agoraMs) ? 'atrasado' : 'em_dia',
      podeConcluir: franqueado && (passo.status === 'aberto' || passo.status === 'reaberto'),
      para: `/meu-acompanhamento?passo=${encodeURIComponent(passo.id)}`,
    })
  }
  return itens.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.prazoMs - b.prazoMs)
}
