import type { Area } from '../data/areas'
import type { DadosDemanda, Demanda, EventoDemanda, StatusDemanda } from './demandas'
import { requireSupabase } from './supabase'

export interface PessoaRede {
  id: string
  nome: string
  papel: 'admin' | 'equipe_franqueadora'
  area: Area | null
}

export interface PessoaUnidade {
  id: string
  nome: string
  papel: 'franqueado' | 'equipe_franqueado'
  unidade_id: string
}

export interface UnidadeDemanda {
  id: string
  nome: string
}

type LinhaDemanda = Omit<Demanda, 'unidadeId' | 'unidadeNome' | 'grupoId' | 'temResponsaveisUnidade' | 'responsaveisNomes' | 'responsaveis' | 'criadoPor' | 'criadoPorNome' | 'criadoEm' | 'atualizadoEm' | 'concluidaEm'> & {
  unidade_id: string | null
  demanda_unidade_nome: string | null
  grupo_id: string | null
  tem_responsaveis_unidade: boolean
  demanda_responsaveis: { usuario_id: string; usuario_nome: string | null }[]
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
  demanda_responsaveis, unidade_id, demanda_unidade_nome, grupo_id, tem_responsaveis_unidade, criado_por, criado_por_nome, criado_em, atualizado_em, concluida_em, ...campos
}: LinhaDemanda): Demanda {
  return {
    ...campos, responsaveis: demanda_responsaveis.map((r) => r.usuario_id),
    unidadeId: unidade_id, unidadeNome: demanda_unidade_nome, grupoId: grupo_id,
    temResponsaveisUnidade: tem_responsaveis_unidade,
    responsaveisNomes: Object.fromEntries(demanda_responsaveis.map((r) => [r.usuario_id, r.usuario_nome])),
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

export async function listarDemandas(uid?: string, unidadeId?: string): Promise<Demanda[]> {
  const banco = requireSupabase()
  const campos = '*, demanda_unidade_nome, tem_responsaveis_unidade, demanda_responsaveis(usuario_id, usuario_nome)'
  const lista = await paginar<LinhaDemanda>((inicio, fim) => {
    // O filtro usa um segundo embed para preservar a lista completa de responsáveis.
    const consulta = uid
      ? banco.from('demandas').select(`${campos}, atribuicao:demanda_responsaveis!inner()`)
        .eq('atribuicao.usuario_id', uid).neq('status', 'concluida')
      : banco.from('demandas').select(campos)
    if (unidadeId) consulta.eq('destino', 'unidade').eq('unidade_id', unidadeId)
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

export function listarPessoasUnidades(unidades: string[]): Promise<PessoaUnidade[]> {
  if (!unidades.length) return Promise.resolve([])
  return paginar<PessoaUnidade>((inicio, fim) => requireSupabase()
    .rpc('listar_pessoas_unidades', { p_unidades: unidades }).order('nome').order('id').range(inicio, fim))
}

export function listarUnidadesDemanda(): Promise<UnidadeDemanda[]> {
  return paginar<UnidadeDemanda>((inicio, fim) => requireSupabase()
    .rpc('listar_unidades_demanda').order('nome').order('id').range(inicio, fim))
}

function argumentosDemanda(dados: DadosDemanda) {
  return {
    p_titulo: dados.titulo, p_descricao: dados.descricao, p_area: dados.area,
    p_prioridade: dados.prioridade, p_prazo: dados.prazo, p_anexos: dados.anexos,
  }
}

export function salvarDemanda(dados: DadosDemanda, id?: string): Promise<string | void> {
  const args = { ...argumentosDemanda(dados), p_responsaveis: dados.responsaveis }
  return id ? rpc<void>('atualizar_demanda', { p_id: id, ...args }) : rpc<string>('criar_demanda', args)
}

export function criarDemandaUnidades(dados: DadosDemanda, unidades: string[], pessoasUnidade: string[]) {
  return rpc<string>('criar_demanda_unidades', {
    ...argumentosDemanda(dados), p_unidades: unidades, p_responsaveis_rede: dados.responsaveis,
    p_responsaveis_unidade: pessoasUnidade,
  })
}

export const adicionarLinkDemanda = (id: string, nome: string, url: string) =>
  rpc<void>('adicionar_link_demanda', { p_id: id, p_nome: nome, p_url: url })

export const mudarStatusDemanda = (id: string, status: StatusDemanda) =>
  rpc<void>('mudar_status_demanda', { p_id: id, p_status: status })
export const comentarDemanda = (id: string, texto: string) =>
  rpc<void>('comentar_demanda', { p_id: id, p_texto: texto })
export const excluirDemanda = (id: string) => rpc<void>('excluir_demanda', { p_id: id })
export const minhasDemandasAbertas = () => rpc<number>('minhas_demandas_abertas')
