export const SLA_HORAS = {
  urgente: 4,
  alta: 24,
  media: 48,
  baixa: 72,
} as const

export const CATEGORIAS_CHAMADO = [
  { id: 'operacao', nome: 'Operação' },
  { id: 'marketing', nome: 'Marketing' },
  { id: 'financeiro', nome: 'Financeiro' },
  { id: 'juridico', nome: 'Jurídico' },
  { id: 'sistemas', nome: 'Sistemas/TI' },
  { id: 'implantacao', nome: 'Implantação' },
  { id: 'outros', nome: 'Outros' },
] as const

export const PRIORIDADES_CHAMADO = [
  { id: 'baixa', nome: 'Baixa' },
  { id: 'media', nome: 'Média' },
  { id: 'alta', nome: 'Alta' },
  { id: 'urgente', nome: 'Urgente' },
] as const

export const STATUS_CHAMADO = [
  { id: 'aberto', nome: 'Aberto' },
  { id: 'em_andamento', nome: 'Em andamento' },
  { id: 'aguardando_franqueado', nome: 'Aguardando franqueado' },
  { id: 'resolvido', nome: 'Resolvido' },
  { id: 'fechado', nome: 'Fechado' },
] as const

export type CategoriaChamado = (typeof CATEGORIAS_CHAMADO)[number]['id']
export type PrioridadeChamado = (typeof PRIORIDADES_CHAMADO)[number]['id']
export type StatusChamado = (typeof STATUS_CHAMADO)[number]['id']

export const STATUS_PENDENTES: StatusChamado[] = ['aberto', 'em_andamento', 'aguardando_franqueado']
export const STATUS_FRANQUEADORA: StatusChamado[] = ['aberto', 'em_andamento', 'aguardando_franqueado', 'resolvido']

export function nomeCategoria(id: string): string {
  return CATEGORIAS_CHAMADO.find((item) => item.id === id)?.nome ?? id
}

export function nomePrioridade(id: string): string {
  return PRIORIDADES_CHAMADO.find((item) => item.id === id)?.nome ?? id
}

export function nomeStatus(id: string): string {
  return STATUS_CHAMADO.find((item) => item.id === id)?.nome ?? id
}

export function slaHoras(prioridade: PrioridadeChamado): number {
  return SLA_HORAS[prioridade]
}

export function prazoMillis(criadoEm: number, horas: number): number {
  if (!criadoEm || !horas) return 0
  return criadoEm + horas * 60 * 60 * 1000
}

export function chamadoPendente(status: string): boolean {
  return (STATUS_PENDENTES as string[]).includes(status)
}

export function chamadoAtrasado(status: string, criadoEm: number, horas: number, agora = Date.now()): boolean {
  if (!chamadoPendente(status)) return false
  const prazo = prazoMillis(criadoEm, horas)
  return prazo > 0 && agora > prazo
}

export function tempoMedioResolucaoHoras(itens: { status: string; criadoEm: number; resolvidoEm: number; fechadoEm: number }[]): number | null {
  const resolvidos = itens.flatMap((item) => {
    if (item.status !== 'resolvido' && item.status !== 'fechado') return []
    const fim = item.resolvidoEm || item.fechadoEm
    if (item.criadoEm <= 0 || fim <= item.criadoEm) return []
    return [fim - item.criadoEm]
  })
  if (!resolvidos.length) return null
  return resolvidos.reduce((total, item) => total + item, 0) / resolvidos.length / (60 * 60 * 1000)
}
