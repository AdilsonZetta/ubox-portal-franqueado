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
import { requireDb } from './firebase'
import { emitirCertificado } from './api'
import { codigoCertificado } from './format'
import {
  idReestudo,
  idTentativa,
  limitarReestudo,
  separarGabarito,
  type Curso,
  type PerguntaEdicao,
  type Prova,
  type Reestudo,
  type TentativaProva,
} from './universidade'
import type { Usuario } from '../types'

function texto(valor: unknown, padrao = ''): string {
  return typeof valor === 'string' ? valor : padrao
}

function inteiro(valor: unknown, padrao = 0): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? Math.round(valor) : padrao
}

function listaTexto(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : []
}

function listaNumero(valor: unknown): number[] {
  return Array.isArray(valor) ? valor.map((item) => inteiro(item, -1)) : []
}

export function mapCurso(id: string, data: DocumentData): Curso {
  return {
    id,
    titulo: texto(data.titulo, 'Curso'),
    descricao: texto(data.descricao),
    ordem: inteiro(data.ordem, 999),
    aulas: listaTexto(data.aulas),
    publicado: data.publicado === true,
    atualizadoPor: texto(data.atualizadoPor),
    atualizadoPorNome: texto(data.atualizadoPorNome),
    atualizadoEm: data.atualizadoEm,
  }
}

export function mapProva(id: string, data: DocumentData): Prova {
  const perguntas = Array.isArray(data.perguntas) ? data.perguntas : []
  return {
    cursoId: id,
    titulo: texto(data.titulo, 'Prova'),
    notaMinima: inteiro(data.notaMinima, 70),
    perguntas: perguntas.map((p: DocumentData, i: number) => ({
      id: texto(p?.id, `p${i + 1}`),
      enunciado: texto(p?.enunciado),
      opcoes: listaTexto(p?.opcoes),
    })),
    totalPerguntas: inteiro(data.totalPerguntas, perguntas.length),
    manualRetornoId: texto(data.manualRetornoId),
    tempoReestudoSeg: inteiro(data.tempoReestudoSeg, 300),
    versao: inteiro(data.versao, 1),
    publicado: data.publicado === true,
    atualizadoPorNome: texto(data.atualizadoPorNome),
    atualizadoEm: data.atualizadoEm,
  }
}

export function mapTentativa(id: string, data: DocumentData): TentativaProva {
  return {
    id,
    uid: texto(data.uid),
    cursoId: texto(data.cursoId),
    ciclo: inteiro(data.ciclo, 1),
    numero: inteiro(data.numero, 1),
    nome: texto(data.nome, 'Pessoa'),
    unidadeId: texto(data.unidadeId),
    unidadeNome: texto(data.unidadeNome),
    versao: inteiro(data.versao, 1),
    respostas: listaNumero(data.respostas),
    aprovado: typeof data.aprovado === 'boolean' ? data.aprovado : null,
    criadoEm: data.criadoEm,
    corrigidoEm: data.corrigidoEm,
  }
}

export function mapReestudo(id: string, data: DocumentData): Reestudo {
  return {
    id,
    uid: texto(data.uid),
    cursoId: texto(data.cursoId),
    ciclo: inteiro(data.ciclo, 1),
    documentoId: texto(data.documentoId),
    status: data.status === 'concluido' ? 'concluido' : 'em_andamento',
    iniciadoEm: data.iniciadoEm,
    reinicios: inteiro(data.reinicios),
    concluidoEm: data.concluidoEm ?? null,
  }
}

/** Aluno lê só os publicados; a franqueadora lê todos (inclusive rascunhos). */
export async function listarCursos(gestor: boolean): Promise<Curso[]> {
  const base = collection(requireDb(), 'cursos')
  const snap = await getDocs(gestor ? base : query(base, where('publicado', '==', true)))
  return snap.docs.map((d) => mapCurso(d.id, d.data()))
}

export async function obterProva(cursoId: string): Promise<Prova | null> {
  try {
    const snap = await getDoc(doc(requireDb(), 'provas', cursoId))
    return snap.exists() ? mapProva(snap.id, snap.data()) : null
  } catch {
    // Prova em rascunho não é legível pelo aluno: para ele, ainda não existe.
    return null
  }
}

export async function listarProvas(): Promise<Prova[]> {
  const snap = await getDocs(collection(requireDb(), 'provas'))
  return snap.docs.map((d) => mapProva(d.id, d.data()))
}

/** Só a franqueadora consegue (as rules recusam para qualquer outra pessoa). */
export async function listarGabaritos(): Promise<Map<string, number[]>> {
  const snap = await getDocs(collection(requireDb(), 'provasGabarito'))
  return new Map(snap.docs.map((d) => [d.id, listaNumero(d.data().corretas)]))
}

export async function listarMinhasTentativas(uid: string): Promise<TentativaProva[]> {
  const snap = await getDocs(query(collection(requireDb(), 'tentativasProva'), where('uid', '==', uid)))
  return snap.docs.map((d) => mapTentativa(d.id, d.data()))
}

export async function listarMeusReestudos(uid: string): Promise<Reestudo[]> {
  const snap = await getDocs(query(collection(requireDb(), 'reestudos'), where('uid', '==', uid)))
  return snap.docs.map((d) => mapReestudo(d.id, d.data()))
}

/** Franqueadora: toda a rede. Franqueado: só a própria unidade. */
export async function listarResultados(usuario: Usuario, gestor: boolean): Promise<TentativaProva[]> {
  const base = collection(requireDb(), 'tentativasProva')
  if (!gestor && (usuario.papel !== 'franqueado' || !usuario.unidadeId)) return []
  const snap = await getDocs(gestor ? base : query(base, where('unidadeId', '==', usuario.unidadeId)))
  return snap.docs.map((d) => mapTentativa(d.id, d.data()))
}

export interface CursoEdicao {
  id: string
  titulo: string
  descricao: string
  ordem: number
  aulas: string[]
  publicado: boolean
}

export async function salvarCurso(autor: Usuario, curso: CursoEdicao): Promise<void> {
  await setDoc(doc(requireDb(), 'cursos', curso.id), {
    titulo: curso.titulo.trim().slice(0, 120),
    descricao: curso.descricao.trim().slice(0, 1000),
    ordem: Math.min(999, Math.max(1, Math.round(curso.ordem || 1))),
    aulas: curso.aulas.slice(0, 20),
    publicado: curso.publicado,
    atualizadoPor: autor.uid,
    atualizadoPorNome: autor.nome,
    atualizadoEm: serverTimestamp(),
  })
}

export interface ProvaEdicao {
  cursoId: string
  titulo: string
  notaMinima: number
  manualRetornoId: string
  tempoReestudoSeg: number
  publicado: boolean
  perguntas: PerguntaEdicao[]
}

/** Grava a prova pública e o gabarito no mesmo lote, sempre numa versão nova. */
export async function salvarProva(autor: Usuario, prova: ProvaEdicao, versaoAtual: number): Promise<number> {
  const banco = requireDb()
  const versao = versaoAtual + 1
  const { publicas, corretas } = separarGabarito(prova.perguntas)
  const lote = writeBatch(banco)
  lote.set(doc(banco, 'provas', prova.cursoId), {
    cursoId: prova.cursoId,
    titulo: prova.titulo.trim().slice(0, 120),
    notaMinima: Math.min(100, Math.max(1, Math.round(prova.notaMinima))),
    perguntas: publicas,
    totalPerguntas: publicas.length,
    manualRetornoId: prova.manualRetornoId,
    tempoReestudoSeg: limitarReestudo(prova.tempoReestudoSeg),
    versao,
    publicado: prova.publicado,
    atualizadoPor: autor.uid,
    atualizadoPorNome: autor.nome,
    atualizadoEm: serverTimestamp(),
  })
  lote.set(doc(banco, 'provasGabarito', prova.cursoId), {
    cursoId: prova.cursoId,
    corretas,
    versao,
    atualizadoPor: autor.uid,
    atualizadoEm: serverTimestamp(),
  })
  await lote.commit()
  return versao
}

/**
 * Corrige pelas rules: tenta gravar "aprovado"; se as rules recusarem, grava "reprovado".
 * As rules só aceitam o resultado que bate com o gabarito, que o aparelho nunca lê.
 */
export async function corrigirTentativa(id: string): Promise<boolean> {
  const ref = doc(requireDb(), 'tentativasProva', id)
  try {
    await updateDoc(ref, { aprovado: true, corrigidoEm: serverTimestamp() })
    return true
  } catch {
    await updateDoc(ref, { aprovado: false, corrigidoEm: serverTimestamp() })
    return false
  }
}

/** Envia as respostas (ocupa a chance) e em seguida pede a correção. */
export async function enviarTentativa(
  usuario: Usuario,
  prova: Prova,
  ciclo: number,
  numero: number,
  respostas: number[],
): Promise<{ id: string; aprovado: boolean }> {
  const id = idTentativa(usuario.uid, prova.cursoId, ciclo, numero)
  await setDoc(doc(requireDb(), 'tentativasProva', id), {
    uid: usuario.uid,
    cursoId: prova.cursoId,
    ciclo,
    numero,
    nome: usuario.nome,
    unidadeId: usuario.unidadeId ?? '',
    unidadeNome: usuario.unidade ?? '',
    versao: prova.versao,
    respostas,
    aprovado: null,
    criadoEm: serverTimestamp(),
    corrigidoEm: null,
  })
  const aprovado = await corrigirTentativa(id)
  return { id, aprovado }
}

export async function emitirCertificadoCurso(usuario: Usuario, curso: Curso, tentativaId: string): Promise<string> {
  return emitirCertificado({
    uid: usuario.uid,
    trilhaId: curso.id,
    nome: usuario.nome,
    trilhaTitulo: curso.titulo.slice(0, 120),
    codigo: codigoCertificado(curso.id),
    tentativaId,
  })
}

/** Entrar (ou voltar) no reestudo: cria o registro ou reinicia o cronômetro do servidor. */
export async function iniciarOuReiniciarReestudo(usuario: Usuario, prova: Prova, ciclo: number): Promise<Reestudo | null> {
  const ref = doc(requireDb(), 'reestudos', idReestudo(usuario.uid, prova.cursoId, ciclo))
  const atual = await getDoc(ref)
  if (atual.exists()) {
    const reestudo = mapReestudo(atual.id, atual.data())
    if (reestudo.status === 'concluido') return reestudo
    await updateDoc(ref, { iniciadoEm: serverTimestamp(), reinicios: reestudo.reinicios + 1, atualizadoEm: serverTimestamp() })
  } else {
    await setDoc(ref, {
      uid: usuario.uid,
      cursoId: prova.cursoId,
      ciclo,
      documentoId: prova.manualRetornoId,
      status: 'em_andamento',
      iniciadoEm: serverTimestamp(),
      reinicios: 0,
      concluidoEm: null,
      atualizadoEm: serverTimestamp(),
    })
  }
  const depois = await getDoc(ref)
  return depois.exists() ? mapReestudo(depois.id, depois.data()) : null
}

export async function concluirReestudo(usuario: Usuario, cursoId: string, ciclo: number): Promise<void> {
  await updateDoc(doc(requireDb(), 'reestudos', idReestudo(usuario.uid, cursoId, ciclo)), {
    status: 'concluido',
    concluidoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  })
}
