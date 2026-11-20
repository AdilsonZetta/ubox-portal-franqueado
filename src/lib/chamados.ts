import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore'
import {
  CATEGORIAS_CHAMADO,
  PRIORIDADES_CHAMADO,
  SLA_HORAS,
  STATUS_CHAMADO,
  STATUS_PENDENTES,
  slaHoras,
  type CategoriaChamado,
  type PrioridadeChamado,
  type StatusChamado,
} from '../data/chamados'
import type { Usuario } from '../types'
import { paraMillis } from './format'
import { requireDb } from './firebase'
import { BACKEND } from './backend'
import {
  observarChamadosSb,
  observarPendentesSb,
  observarEventosSb,
  abrirChamadoSb,
  comentarChamadoSb,
  mudarStatusSb,
  assumirChamadoSb,
} from './chamadosSupabase'

export interface AnexoChamado {
  nome: string
  url: string
}

export interface Chamado {
  id: string
  titulo: string
  categoria: CategoriaChamado
  prioridade: PrioridadeChamado
  descricao: string
  anexos: AnexoChamado[]
  status: StatusChamado
  unidadeId: string
  unidadeNome: string
  abertoPor: string
  abertoPorNome: string
  responsavelId: string | null
  responsavelNome: string | null
  avaliacao: number | null
  slaHoras: number
  criadoEm?: Timestamp
  atualizadoEm?: Timestamp
  resolvidoEm?: Timestamp | null
  fechadoEm?: Timestamp | null
  reabertoEm?: Timestamp | null
}

export interface EventoChamado {
  id: string
  tipo: 'abertura' | 'comentario' | 'status' | 'responsavel'
  texto: string
  de: string
  para: string
  autorId: string
  autorNome: string
  criadoEm?: Timestamp
}

const categorias = new Set<string>(CATEGORIAS_CHAMADO.map((item) => item.id))
const prioridades = new Set<string>(PRIORIDADES_CHAMADO.map((item) => item.id))
const statuses = new Set<string>(STATUS_CHAMADO.map((item) => item.id))

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

export function mapChamado(id: string, data: Record<string, unknown>): Chamado | null {
  if (!categorias.has(texto(data.categoria)) || !prioridades.has(texto(data.prioridade)) || !statuses.has(texto(data.status))) return null
  const anexos = Array.isArray(data.anexos)
    ? data.anexos.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const anexo = item as Record<string, unknown>
        if (typeof anexo.url !== 'string') return []
        return [{ nome: texto(anexo.nome) || anexo.url, url: anexo.url }]
      })
    : []
  return {
    id,
    titulo: texto(data.titulo),
    categoria: data.categoria as CategoriaChamado,
    prioridade: data.prioridade as PrioridadeChamado,
    descricao: texto(data.descricao),
    anexos,
    status: data.status as StatusChamado,
    unidadeId: texto(data.unidadeId),
    unidadeNome: texto(data.unidadeNome),
    abertoPor: texto(data.abertoPor),
    abertoPorNome: texto(data.abertoPorNome),
    responsavelId: typeof data.responsavelId === 'string' ? data.responsavelId : null,
    responsavelNome: typeof data.responsavelNome === 'string' ? data.responsavelNome : null,
    avaliacao: typeof data.avaliacao === 'number' ? data.avaliacao : null,
    slaHoras: typeof data.slaHoras === 'number' ? data.slaHoras : SLA_HORAS[data.prioridade as PrioridadeChamado],
    criadoEm: data.criadoEm as Timestamp | undefined,
    atualizadoEm: data.atualizadoEm as Timestamp | undefined,
    resolvidoEm: (data.resolvidoEm ?? null) as Timestamp | null,
    fechadoEm: (data.fechadoEm ?? null) as Timestamp | null,
    reabertoEm: (data.reabertoEm ?? null) as Timestamp | null,
  }
}

export function observarChamados(
  filtro: { rede: boolean; unidadeId?: string | null },
  aoMudar: (chamados: Chamado[]) => void,
  aoErro: (erro: unknown) => void,
): () => void {
  if (BACKEND === 'supabase') return observarChamadosSb(filtro, aoMudar, aoErro)
  if (!filtro.rede && !filtro.unidadeId) {
    aoMudar([])
    return () => undefined
  }
  const base = collection(requireDb(), 'chamados')
  const consulta = filtro.rede ? base : query(base, where('unidadeId', '==', filtro.unidadeId))
  return onSnapshot(
    consulta,
    (snap) => {
      const lista = snap.docs.map((item) => mapChamado(item.id, item.data())).filter((item): item is Chamado => item !== null)
      lista.sort((a, b) => paraMillis(b.criadoEm) - paraMillis(a.criadoEm))
      aoMudar(lista)
    },
    aoErro,
  )
}

export function observarPendentes(
  filtro: { rede: boolean; unidadeId?: string | null },
  aoMudar: (total: number) => void,
): () => void {
  if (BACKEND === 'supabase') return observarPendentesSb(filtro, aoMudar)
  return observarChamados(
    filtro,
    (chamados) => aoMudar(chamados.filter((chamado) => (STATUS_PENDENTES as string[]).includes(chamado.status)).length),
    () => aoMudar(0),
  )
}

export function observarEventos(chamadoId: string, aoMudar: (eventos: EventoChamado[]) => void, aoErro: (erro: unknown) => void): () => void {
  if (BACKEND === 'supabase') return observarEventosSb(chamadoId, aoMudar, aoErro)
  const consulta = query(collection(requireDb(), 'chamados', chamadoId, 'eventos'), orderBy('criadoEm', 'asc'))
  return onSnapshot(
    consulta,
    (snap) => {
      aoMudar(
        snap.docs.map((item) => {
          const data = item.data()
          return {
            id: item.id,
            tipo: data.tipo,
            texto: texto(data.texto),
            de: texto(data.de),
            para: texto(data.para),
            autorId: texto(data.autorId),
            autorNome: texto(data.autorNome),
            criadoEm: data.criadoEm,
          } satisfies EventoChamado
        }),
      )
    },
    aoErro,
  )
}

function evento(autor: Usuario, tipo: EventoChamado['tipo'], textoEvento: string, de = '', para = '') {
  return {
    tipo,
    texto: textoEvento.slice(0, 2000),
    de,
    para,
    autorId: autor.uid,
    autorNome: autor.nome,
    criadoEm: serverTimestamp(),
  }
}

export async function abrirChamado(
  autor: Usuario,
  dados: { titulo: string; categoria: CategoriaChamado; prioridade: PrioridadeChamado; descricao: string; anexos: AnexoChamado[] },
): Promise<string> {
  if (BACKEND === 'supabase') return abrirChamadoSb(autor, dados)
  if (!autor.unidadeId) throw new Error('Sua conta ainda não está ligada a uma unidade.')
  const banco = requireDb()
  const unidade = await getDoc(doc(banco, 'unidades', autor.unidadeId))
  if (!unidade.exists()) throw new Error('Unidade não encontrada.')
  const ref = doc(collection(banco, 'chamados'))
  const horas = slaHoras(dados.prioridade)
  await setDoc(ref, {
      titulo: dados.titulo.trim(),
      categoria: dados.categoria,
      prioridade: dados.prioridade,
      descricao: dados.descricao.trim(),
      anexos: dados.anexos.map((anexo) => ({ nome: (anexo.nome || anexo.url).trim().slice(0, 80), url: anexo.url.trim() })),
      status: 'aberto',
      unidadeId: autor.unidadeId,
      unidadeNome: String(unidade.data().nome || ''),
      abertoPor: autor.uid,
      abertoPorNome: autor.nome,
      responsavelId: null,
      responsavelNome: null,
      avaliacao: null,
      slaHoras: horas,
      resolvidoEm: null,
      fechadoEm: null,
      reabertoEm: null,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    })
  await setDoc(doc(collection(ref, 'eventos')), evento(autor, 'comentario', 'Chamado aberto.', '', 'aberto'))
  return ref.id
}

export async function comentarChamado(autor: Usuario, chamadoId: string, textoComentario: string): Promise<void> {
  if (BACKEND === 'supabase') return comentarChamadoSb(autor, chamadoId, textoComentario)
  await setDoc(doc(collection(requireDb(), 'chamados', chamadoId, 'eventos')), evento(autor, 'comentario', textoComentario.trim()))
}

export async function mudarStatus(autor: Usuario, chamado: Chamado, status: StatusChamado, extra: { avaliacao?: number } = {}): Promise<void> {
  if (BACKEND === 'supabase') return mudarStatusSb(autor, chamado, status, extra)
  const banco = requireDb()
  const batch = writeBatch(banco)
  const patch: Record<string, unknown> = { status, atualizadoEm: serverTimestamp() }
  const reabre = status === 'aberto' && (chamado.status === 'fechado' || chamado.status === 'resolvido')
  const saiDeFechado = chamado.status === 'fechado' && status !== 'fechado'
  if (reabre || saiDeFechado) {
    patch.avaliacao = null
    patch.fechadoEm = null
    patch.resolvidoEm = null
    patch.reabertoEm = serverTimestamp()
  } else if (status === 'resolvido' && chamado.status !== 'resolvido') {
    patch.resolvidoEm = serverTimestamp()
  }
  if (status === 'fechado') {
    patch.avaliacao = extra.avaliacao
    patch.fechadoEm = serverTimestamp()
  }
  batch.update(doc(banco, 'chamados', chamado.id), patch)
  batch.set(
    doc(collection(banco, 'chamados', chamado.id, 'eventos')),
    evento(autor, 'status', `Status: ${status}`, chamado.status, status),
  )
  await batch.commit()
}

export async function assumirChamado(autor: Usuario, chamado: Chamado, responsavel: { uid: string; nome: string }): Promise<void> {
  if (BACKEND === 'supabase') return assumirChamadoSb(autor, chamado, responsavel)
  const banco = requireDb()
  const batch = writeBatch(banco)
  const status = chamado.status === 'aberto' ? 'em_andamento' : chamado.status
  batch.update(doc(banco, 'chamados', chamado.id), {
    responsavelId: responsavel.uid,
    responsavelNome: responsavel.nome,
    status,
    atualizadoEm: serverTimestamp(),
  })
  batch.set(
    doc(collection(banco, 'chamados', chamado.id, 'eventos')),
    evento(autor, 'responsavel', `${responsavel.nome} assumiu o chamado.`, chamado.responsavelNome ?? '', responsavel.nome),
  )
  await batch.commit()
}
