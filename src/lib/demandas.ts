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

export type DestinoDemanda = 'interna' | 'unidade'

export interface Demanda extends DadosDemanda {
  destino: DestinoDemanda
  unidadeId: string | null
  unidadeNome: string | null
  grupoId: string | null
  responsaveisNomes: Record<string, string | null>
  temResponsaveisUnidade: boolean
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

function pessoaDaUnidade(user: Usuario | null | undefined): boolean {
  return Boolean(user?.ativo && !user.recusado && user.unidadeId &&
    (user.papel === 'franqueado' || user.papel === 'equipe_franqueado'))
}

export function podeAcessarDemandas(user: Usuario | null, comoFranqueado: boolean, simulado?: Usuario | null): boolean {
  if (BACKEND !== 'supabase' || !user?.ativo || user.recusado) return false
  if (comoFranqueado) return user.papel === 'admin' && pessoaDaUnidade(simulado)
  return user.papel === 'admin' || user.papel === 'equipe_franqueadora' || pessoaDaUnidade(user)
}

export function demandasDaUnidade(lista: Demanda[], unidadeId?: string | null, uid?: string): Demanda[] {
  if (!unidadeId) return []
  return lista.filter((d) => d.destino === 'unidade' && d.unidadeId === unidadeId &&
    (!uid || !d.temResponsaveisUnidade || d.responsaveis.includes(uid)))
}

const formatoDia = new Intl.DateTimeFormat('sv-SE')
export const diaLocal = (data: Date) => formatoDia.format(data)
export const hojeLocal = () => diaLocal(new Date())

export function semanaDe(data: Date): Date[] {
  const deslocamento = (data.getDay() + 6) % 7
  return Array.from({ length: 7 }, (_, i) =>
    new Date(data.getFullYear(), data.getMonth(), data.getDate() - deslocamento + i, 12))
}

// Mês de 1 a 12, como no parâmetro mes da URL.
export function diasDoMes(ano: number, mes: number): Date[] {
  const primeiro = new Date(ano, mes - 1, 1, 12)
  const inicio = semanaDe(primeiro)[0]
  const ultimo = new Date(ano, mes, 0, 12)
  const fim = semanaDe(ultimo)[6]
  const dias: Date[] = []
  for (let dia = inicio; dia <= fim; dia = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1, 12)) {
    dias.push(dia)
  }
  return dias
}

export function agruparPorDia(lista: Demanda[]) {
  const porDia = new Map<string, Demanda[]>()
  const semPrazo: Demanda[] = []
  for (const demanda of lista) {
    if (!demanda.prazo) {
      semPrazo.push(demanda)
      continue
    }
    const grupo = porDia.get(demanda.prazo)
    if (grupo) grupo.push(demanda)
    else porDia.set(demanda.prazo, [demanda])
  }
  return { porDia, semPrazo }
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

export function nomesResponsaveis(demanda: Demanda): string {
  return demanda.responsaveis.map((id) => demanda.responsaveisNomes[id] ?? 'Pessoa indisponível').join(', ')
}

export const COLUNAS_LISTA_DEMANDAS = {
  titulo: 'Demanda', prazo: 'Prazo', status: 'Status', prioridade: 'Prioridade', unidade: 'Unidade', responsaveis: 'Responsáveis',
} as const

export type ColunaListaDemandas = keyof typeof COLUNAS_LISTA_DEMANDAS
const compararTexto = new Intl.Collator('pt-BR', { sensitivity: 'base' }).compare
const posicaoStatus = Object.keys(STATUS_DEMANDA)
const compararColuna: Record<ColunaListaDemandas, (a: Demanda, b: Demanda) => number> = {
  titulo: (a, b) => compararTexto(a.titulo, b.titulo),
  prazo: (a, b) => (a.prazo ?? '').localeCompare(b.prazo ?? ''),
  status: (a, b) => posicaoStatus.indexOf(a.status) - posicaoStatus.indexOf(b.status),
  prioridade: (a, b) => peso[a.prioridade] - peso[b.prioridade],
  unidade: (a, b) => compararTexto(a.unidadeNome ?? 'Interna', b.unidadeNome ?? 'Interna'),
  responsaveis: (a, b) => compararTexto(nomesResponsaveis(a), nomesResponsaveis(b)),
}

export function ordenarListaDemandas(lista: Demanda[], coluna: ColunaListaDemandas, inversa: boolean): Demanda[] {
  return [...lista].sort((a, b) => {
    if (coluna === 'prazo' && (!a.prazo || !b.prazo)) return Number(!a.prazo) - Number(!b.prazo)
    const ordem = compararColuna[coluna](a, b)
    return (inversa ? -ordem : ordem) || compararTexto(a.titulo, b.titulo)
  })
}

const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function filtrarDemandas(lista: Demanda[], filtros: {
  uid: string
  escopo: EscopoDemanda
  minhaArea?: Area | null
  area?: Area | ''
  prioridade?: PrioridadeDemanda | ''
  busca?: string
  destino?: DestinoDemanda | ''
  unidadeId?: string
}): Demanda[] {
  const busca = normalizar(filtros.busca?.trim() ?? '')
  return lista.filter((d) => {
    if (filtros.escopo === 'minhas' && !d.responsaveis.includes(filtros.uid)) return false
    if (filtros.escopo === 'area' && (!filtros.minhaArea || d.area !== filtros.minhaArea)) return false
    if (filtros.escopo === 'criadas' && d.criadoPor !== filtros.uid) return false
    return (!filtros.destino || d.destino === filtros.destino) &&
      (!filtros.unidadeId || d.unidadeId === filtros.unidadeId) &&
      (!filtros.area || d.area === filtros.area) &&
      (!filtros.prioridade || d.prioridade === filtros.prioridade) &&
      (!busca || normalizar(d.titulo).includes(busca))
  })
}

export function resumoDemandas(lista: Demanda[], uid: string | undefined, hoje: string) {
  const abertas = lista.filter((d) => d.status !== 'concluida' && (!uid || d.responsaveis.includes(uid)))
  return {
    abertas: abertas.length,
    atrasadas: abertas.filter((d) => atrasada(d, hoje)).length,
    paraHoje: abertas.filter((d) => d.prazo === hoje).length,
    proximas: ordenarDemandas(abertas, hoje).slice(0, 5),
  }
}
