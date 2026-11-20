import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore'
import { BACKEND } from './backend'
import { requireDb } from './firebase'
import { encadearTrilha, idProgresso, limitarTempo, type ItemTrilhaManual, type ProgressoManual } from './manuaisTrilha'
import type { Usuario } from '../types'
import {
  listarTrilhaManuaisSb,
  listarMeuProgressoSb,
  listarProgressoVisivelSb,
  salvarTrilhaManuaisSb,
  iniciarOuReiniciarSb,
  concluirManualSb,
} from './manuaisSupabase'

function texto(valor: unknown, padrao = ''): string {
  return typeof valor === 'string' ? valor : padrao
}

function inteiro(valor: unknown, padrao = 0): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? Math.round(valor) : padrao
}

export function mapItemTrilha(id: string, data: DocumentData): ItemTrilhaManual {
  return {
    documentoId: id,
    titulo: texto(data.titulo, 'Manual'),
    etapa: texto(data.etapa),
    ordem: inteiro(data.ordem, 999),
    tempoMinimoSeg: inteiro(data.tempoMinimoSeg, 60),
    videoMinutos: inteiro(data.videoMinutos),
    anteriorId: texto(data.anteriorId),
    ativo: data.ativo === true,
    atualizadoPor: texto(data.atualizadoPor),
    atualizadoPorNome: texto(data.atualizadoPorNome),
    atualizadoEm: data.atualizadoEm,
  }
}

export function mapProgresso(id: string, data: DocumentData): ProgressoManual {
  return {
    id,
    uid: texto(data.uid),
    documentoId: texto(data.documentoId),
    nome: texto(data.nome, 'Pessoa'),
    unidadeId: texto(data.unidadeId),
    unidadeNome: texto(data.unidadeNome),
    status: data.status === 'concluido' ? 'concluido' : 'em_andamento',
    iniciadoEm: data.iniciadoEm,
    reinicios: inteiro(data.reinicios),
    tempoMinimoSeg: inteiro(data.tempoMinimoSeg, 60),
    concluidoEm: data.concluidoEm ?? null,
    atualizadoEm: data.atualizadoEm,
  }
}

export async function listarTrilhaManuais(): Promise<ItemTrilhaManual[]> {
  if (BACKEND === 'supabase') return listarTrilhaManuaisSb()
  const snap = await getDocs(collection(requireDb(), 'manuaisTrilha'))
  return snap.docs.map((d) => mapItemTrilha(d.id, d.data()))
}

export async function listarMeuProgresso(uid: string): Promise<ProgressoManual[]> {
  if (BACKEND === 'supabase') return listarMeuProgressoSb(uid)
  const snap = await getDocs(query(collection(requireDb(), 'progressoManuais'), where('uid', '==', uid)))
  return snap.docs.map((d) => mapProgresso(d.id, d.data()))
}

/** Franqueadora: todo o progresso da rede. Franqueado: só o da própria unidade. */
export async function listarProgressoVisivel(usuario: Usuario): Promise<ProgressoManual[]> {
  if (BACKEND === 'supabase') return listarProgressoVisivelSb(usuario)
  const base = collection(requireDb(), 'progressoManuais')
  const rede = usuario.papel === 'admin' || usuario.papel === 'equipe_franqueadora'
  if (!rede && !usuario.unidadeId) return []
  const snap = await getDocs(rede ? base : query(base, where('unidadeId', '==', usuario.unidadeId)))
  return snap.docs.map((d) => mapProgresso(d.id, d.data()))
}

export interface ItemTrilhaEdicao {
  documentoId: string
  titulo: string
  etapa: string
  tempoMinimoSeg: number
  videoMinutos: number
  ativo: boolean
}

/** Grava a trilha inteira na ordem recebida, recalculando ordem e anterior num só lote. */
export async function salvarTrilhaManuais(autor: Usuario, itens: ItemTrilhaEdicao[]): Promise<void> {
  if (BACKEND === 'supabase') return salvarTrilhaManuaisSb(autor, itens)
  if (itens.length > 450) throw new Error('A trilha aceita até 450 manuais por vez.')
  const banco = requireDb()
  const lote = writeBatch(banco)
  const agora = serverTimestamp()
  for (const item of encadearTrilha(itens)) {
    lote.set(doc(banco, 'manuaisTrilha', item.documentoId), {
      documentoId: item.documentoId,
      titulo: item.titulo.trim().slice(0, 200) || 'Manual',
      etapa: item.etapa.trim().slice(0, 80),
      ordem: item.ordem,
      tempoMinimoSeg: limitarTempo(item.tempoMinimoSeg),
      videoMinutos: Math.min(600, Math.max(0, Math.round(item.videoMinutos || 0))),
      anteriorId: item.anteriorId,
      ativo: item.ativo,
      atualizadoPor: autor.uid,
      atualizadoPorNome: autor.nome,
      atualizadoEm: agora,
    })
  }
  await lote.commit()
}

/**
 * Entrar (ou voltar) no manual: cria o progresso ou reinicia o cronômetro do servidor.
 * Concluídos não mudam.
 */
export async function iniciarOuReiniciar(usuario: Usuario, item: ItemTrilhaManual): Promise<ProgressoManual | null> {
  if (BACKEND === 'supabase') return iniciarOuReiniciarSb(usuario, item)
  const banco = requireDb()
  const ref = doc(banco, 'progressoManuais', idProgresso(usuario.uid, item.documentoId))
  const atual = await getDoc(ref)
  if (atual.exists()) {
    const progresso = mapProgresso(atual.id, atual.data())
    if (progresso.status === 'concluido') return progresso
    await updateDoc(ref, {
      iniciadoEm: serverTimestamp(),
      reinicios: progresso.reinicios + 1,
      tempoMinimoSeg: item.tempoMinimoSeg,
      atualizadoEm: serverTimestamp(),
    })
  } else {
    await setDoc(ref, {
      uid: usuario.uid,
      documentoId: item.documentoId,
      nome: usuario.nome,
      unidadeId: usuario.unidadeId ?? '',
      unidadeNome: usuario.unidade ?? '',
      status: 'em_andamento',
      iniciadoEm: serverTimestamp(),
      reinicios: 0,
      tempoMinimoSeg: item.tempoMinimoSeg,
      concluidoEm: null,
      atualizadoEm: serverTimestamp(),
    })
  }
  const depois = await getDoc(ref)
  return depois.exists() ? mapProgresso(depois.id, depois.data()) : null
}

export async function concluirManual(usuario: Usuario, documentoId: string): Promise<void> {
  if (BACKEND === 'supabase') return concluirManualSb(usuario, documentoId)
  const ref = doc(requireDb(), 'progressoManuais', idProgresso(usuario.uid, documentoId))
  await updateDoc(ref, {
    status: 'concluido',
    concluidoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  })
}
