import type { Area } from '../data/areas'
import type { Usuario } from '../types'
import { BACKEND } from './backend'

export const STATUS_DEMANDA = {
  a_fazer: 'A fazer',
  em_andamento: 'Em andamento',
  aguardando: 'Aguardando',
  concluida: 'Concluída',
} as const
export const PRIORIDADES_DEMANDA = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
} as const

export type StatusDemanda = keyof typeof STATUS_DEMANDA
export type PrioridadeDemanda = keyof typeof PRIORIDADES_DEMANDA
export type EscopoDemanda = 'minhas' | 'area' | 'criadas' | 'todas'

export interface DadosDemanda {
  titulo: string
  descricao: string
  area: Area | null
  prioridade: PrioridadeDemanda
  prazo: string | null
  responsaveis: string[]
  anexos: { nome: string; url: string }[]
}

export interface Demanda extends DadosDemanda {
  id: string
  status: StatusDemanda
  criadoPor: string
  criadoPorNome: string | null
  criadoEm: string
  atualizadoEm: string
  concluidaEm: string | null
}

export interface EventoDemanda {
  id: string
  tipo: 'criacao' | 'comentario' | 'status' | 'responsaveis' | 'edicao'
  texto: string
  autorId: string
  autorNome: string | null
  criadoEm: string
}

export function podeAcessarDemandas(user: Usuario | null, comoFranqueado: boolean): boolean {
  return BACKEND === 'supabase' && !comoFranqueado && Boolean(user?.ativo && !user.recusado &&
    (user.papel === 'admin' || user.papel === 'equipe_franqueadora'))
}

export function hojeLocal() {
  return new Intl.DateTimeFormat('sv-SE').format(new Date())
}

export function atrasada(demanda: Demanda, hoje: string): boolean {
  return demanda.status !== 'concluida' && demanda.prazo !== null && demanda.prazo < hoje
}

const peso = { baixa: 0, media: 1, alta: 2, urgente: 3 }

export function ordenarDemandas(lista: Demanda[], hoje: string): Demanda[] {
  return [...lista].sort((a, b) =>
    Number(atrasada(b, hoje)) - Number(atrasada(a, hoje)) ||
    peso[b.prioridade] - peso[a.prioridade] ||
    (a.prazo ?? '9999-99-99').localeCompare(b.prazo ?? '9999-99-99'))
}

const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function filtrarDemandas(lista: Demanda[], filtros: {
  uid: string
  escopo: EscopoDemanda
  minhaArea?: Area | null
  area?: Area | ''
  prioridade?: PrioridadeDemanda | ''
  busca?: string
}): Demanda[] {
  const busca = normalizar(filtros.busca?.trim() ?? '')
  return lista.filter((d) => {
    if (filtros.escopo === 'minhas' && !d.responsaveis.includes(filtros.uid)) return false
    if (filtros.escopo === 'area' && (!filtros.minhaArea || d.area !== filtros.minhaArea)) return false
    if (filtros.escopo === 'criadas' && d.criadoPor !== filtros.uid) return false
    return (!filtros.area || d.area === filtros.area) &&
      (!filtros.prioridade || d.prioridade === filtros.prioridade) &&
      (!busca || normalizar(d.titulo).includes(busca))
  })
}

export function resumoDemandas(lista: Demanda[], uid: string, hoje: string) {
  const abertas = lista.filter((d) => d.status !== 'concluida' && d.responsaveis.includes(uid))
  return {
    abertas: abertas.length,
    atrasadas: abertas.filter((d) => atrasada(d, hoje)).length,
    paraHoje: abertas.filter((d) => d.prazo === hoje).length,
    proximas: ordenarDemandas(abertas, hoje).slice(0, 5),
  }
}
