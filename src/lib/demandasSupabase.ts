import type { Area } from '../data/areas'
import type { DadosDemanda, Demanda, EventoDemanda, StatusDemanda } from './demandas'
import { requireSupabase } from './supabase'

export interface PessoaRede {
  id: string
  nome: string
  papel: 'admin' | 'equipe_franqueadora'
  area: Area | null
}

type LinhaDemanda = Omit<Demanda, 'responsaveis' | 'criadoPor' | 'criadoPorNome' | 'criadoEm' | 'atualizadoEm' | 'concluidaEm'> & {
  demanda_responsaveis: { usuario_id: string }[]
  criado_por: string
  criado_por_nome: string | null
  criado_em: string
  atualizado_em: string
  concluida_em: string | null
}

type LinhaEvento = Omit<EventoDemanda, 'autorId' | 'autorNome' | 'criadoEm'> & {
  autor_id: string
  autor_nome: string | null
  criado_em: string
}

export function mapDemandaSb({
  demanda_responsaveis, criado_por, criado_por_nome, criado_em, atualizado_em, concluida_em, ...campos
}: LinhaDemanda): Demanda {
  return {
    ...campos, responsaveis: demanda_responsaveis.map((r) => r.usuario_id),
    criadoPor: criado_por, criadoPorNome: criado_por_nome, criadoEm: criado_em,
    atualizadoEm: atualizado_em, concluidaEm: concluida_em,
  }
}

export function mapEventoDemandaSb({ autor_id, autor_nome, criado_em, ...campos }: LinhaEvento): EventoDemanda {
  return { ...campos, autorId: autor_id, autorNome: autor_nome, criadoEm: criado_em }
}

async function paginar<T>(buscar: (inicio: number, fim: number) => PromiseLike<{
  data: T[] | null
  error: { message: string } | null
}>): Promise<T[]> {
  const lista: T[] = []
  const tamanho = 500
  for (let inicio = 0; ; inicio += tamanho) {
    const { data, error } = await buscar(inicio, inicio + tamanho - 1)
    if (error) throw new Error(error.message)
    lista.push(...(data ?? []))
    if (!data || data.length < tamanho) return lista
  }
}

export async function listarDemandas(uid?: string): Promise<Demanda[]> {
  const banco = requireSupabase()
  const lista = await paginar<LinhaDemanda>((inicio, fim) => {
    const consulta = uid
      ? banco.from('demandas').select('*, demanda_responsaveis!inner(usuario_id)')
        .eq('demanda_responsaveis.usuario_id', uid).neq('status', 'concluida')
      : banco.from('demandas').select('*, demanda_responsaveis(usuario_id)')
    return consulta.order('id').range(inicio, fim)
  })
  return lista.map(mapDemandaSb)
}

export async function listarEventosDemanda(id: string): Promise<EventoDemanda[]> {
  const banco = requireSupabase()
  const lista = await paginar<LinhaEvento>((inicio, fim) => banco.from('demanda_eventos').select('id,tipo,texto,autor_id,autor_nome,criado_em')
    .eq('demanda_id', id).order('criado_em', { ascending: false }).order('id').range(inicio, fim))
  return lista.map(mapEventoDemandaSb)
}

export async function listarPessoasRede(): Promise<PessoaRede[]> {
  const banco = requireSupabase()
  return paginar<PessoaRede>((inicio, fim) => banco.rpc('listar_pessoas_rede').order('nome').order('id').range(inicio, fim))
}

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(nome, args)
  if (error) throw new Error(error.message)
  return data as T
}

export function salvarDemanda(dados: DadosDemanda, id?: string): Promise<string | void> {
  const args = {
    p_titulo: dados.titulo, p_descricao: dados.descricao, p_area: dados.area,
    p_prioridade: dados.prioridade, p_prazo: dados.prazo, p_responsaveis: dados.responsaveis, p_anexos: dados.anexos,
  }
  return id ? rpc<void>('atualizar_demanda', { p_id: id, ...args }) : rpc<string>('criar_demanda', args)
}

export const mudarStatusDemanda = (id: string, status: StatusDemanda) =>
  rpc<void>('mudar_status_demanda', { p_id: id, p_status: status })
export const comentarDemanda = (id: string, texto: string) =>
  rpc<void>('comentar_demanda', { p_id: id, p_texto: texto })
export const excluirDemanda = (id: string) => rpc<void>('excluir_demanda', { p_id: id })
export const minhasDemandasAbertas = () => rpc<number>('minhas_demandas_abertas')
