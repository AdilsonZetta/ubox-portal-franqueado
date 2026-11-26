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

export function prazoMillis(inicio: number, horas: number): number {
  if (!inicio || !horas) return 0
  return inicio + horas * 60 * 60 * 1000
}

export function inicioDoPrazo(criadoEm: number, reabertoEm: number): number {
  return reabertoEm > 0 ? reabertoEm : criadoEm
}

export function chamadoPendente(status: string): boolean {
  return (STATUS_PENDENTES as string[]).includes(status)
}

export interface EntradaPrazo {
  status: string
  criadoEmMs: number
  reabertoEmMs?: number
  slaHoras: number
  pausadoEmMs?: number
  pausaAcumuladaMs?: number
  responsavelNome?: string | null
  unidadeNome?: string
}

export interface PrazoChamado {
  inicioMs: number
  venceEmMs: number
  pausado: boolean
  pausaMs: number
  atrasado: boolean
  pendente: boolean
  quemResponde: 'franqueadora' | 'unidade' | 'ninguem'
  rotuloQuemResponde: string
  restanteMs: number
}

export function calcularPrazoChamado(c: EntradaPrazo, agoraMs = Date.now()): PrazoChamado {
  const inicioMs = inicioDoPrazo(c.criadoEmMs, c.reabertoEmMs ?? 0)
  const pendente = chamadoPendente(c.status)
  const pausado = c.status === 'aguardando_franqueado'
  const pausadoEmMs = c.pausadoEmMs ?? 0
  const pausaAtualMs = pausado && pausadoEmMs > 0 ? Math.max(0, agoraMs - pausadoEmMs) : 0
  const pausaMs = Math.max(0, c.pausaAcumuladaMs ?? 0) + pausaAtualMs
  const prazoBase = prazoMillis(inicioMs, c.slaHoras)
  const venceEmMs = prazoBase ? prazoBase + pausaMs : 0
  const atrasado = pendente && !pausado && venceEmMs > 0 && agoraMs > venceEmMs

  let quemResponde: PrazoChamado['quemResponde'] = 'ninguem'
  let rotuloQuemResponde = 'Encerrado'
  if (pausado) {
    quemResponde = 'unidade'
    rotuloQuemResponde = c.unidadeNome ? `Unidade · ${c.unidadeNome}` : 'Unidade'
  } else if (pendente) {
    quemResponde = 'franqueadora'
    rotuloQuemResponde = c.responsavelNome ? `Franqueadora · ${c.responsavelNome}` : 'Franqueadora'
  } else if (c.status === 'resolvido') {
    quemResponde = 'unidade'
    rotuloQuemResponde = 'Unidade confirma a solução'
  }

  return { inicioMs, venceEmMs, pausado, pausaMs, atrasado, pendente, quemResponde, rotuloQuemResponde, restanteMs: venceEmMs - agoraMs }
}

export function chamadoAtrasado(
  status: string, criadoEm: number, horas: number, agora = Date.now(), reabertoEm = 0, pausadoEm = 0, pausaAcumuladaMs = 0,
): boolean {
  return calcularPrazoChamado({
    status, criadoEmMs: criadoEm, reabertoEmMs: reabertoEm, slaHoras: horas, pausadoEmMs: pausadoEm, pausaAcumuladaMs,
  }, agora).atrasado
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
