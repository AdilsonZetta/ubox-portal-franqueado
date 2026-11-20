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
import { idCertificado } from './ids'
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
import { BACKEND } from './backend'
import {
  listarCursosSb,
  obterProvaSb,
  listarProvasSb,
  listarGabaritosSb,
  listarMinhasTentativasSb,
  listarMeusReestudosSb,
  listarResultadosSb,
  listarFolhasSb,
  fecharTentativaPendenteSb,
  salvarCursoSb,
  salvarProvaSb,
  corrigirTentativaSb,
  enviarTentativaSb,
  emitirCertificadoCursoSb,
  iniciarOuReiniciarReestudoSb,
  concluirReestudoSb,
} from './universidadeSupabase'

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
  if (BACKEND === 'supabase') return listarCursosSb(gestor)
  const base = collection(requireDb(), 'cursos')
  const snap = await getDocs(gestor ? base : query(base, where('publicado', '==', true)))
  return snap.docs.map((d) => mapCurso(d.id, d.data()))
}

export async function obterProva(cursoId: string): Promise<Prova | null> {
  if (BACKEND === 'supabase') return obterProvaSb(cursoId)
  try {
    const snap = await getDoc(doc(requireDb(), 'provas', cursoId))
    return snap.exists() ? mapProva(snap.id, snap.data()) : null
  } catch {
    // Prova em rascunho não é legível pelo aluno: para ele, ainda não existe.
    return null
  }
}

export async function listarProvas(): Promise<Prova[]> {
  if (BACKEND === 'supabase') return listarProvasSb()
  const snap = await getDocs(collection(requireDb(), 'provas'))
  return snap.docs.map((d) => mapProva(d.id, d.data()))
}

/** Só a franqueadora consegue (as rules recusam para qualquer outra pessoa). */
export async function listarGabaritos(): Promise<Map<string, number[]>> {
  if (BACKEND === 'supabase') return listarGabaritosSb()
  const snap = await getDocs(collection(requireDb(), 'provasGabarito'))
  return new Map(snap.docs.map((d) => [d.id, listaNumero(d.data().corretas)]))
}

export async function listarMinhasTentativas(uid: string): Promise<TentativaProva[]> {
  if (BACKEND === 'supabase') return listarMinhasTentativasSb(uid)
  const snap = await getDocs(query(collection(requireDb(), 'tentativasProva'), where('uid', '==', uid)))
  return snap.docs.map((d) => mapTentativa(d.id, d.data()))
}

export async function listarMeusReestudos(uid: string): Promise<Reestudo[]> {
  if (BACKEND === 'supabase') return listarMeusReestudosSb(uid)
  const snap = await getDocs(query(collection(requireDb(), 'reestudos'), where('uid', '==', uid)))
  return snap.docs.map((d) => mapReestudo(d.id, d.data()))
}

/**
 * Franqueadora: toda a rede. Franqueado: só a própria unidade.
 * O doc da tentativa não tem respostas; a folha (subdocumento) só a franqueadora e o dono leem.
 */
export async function listarResultados(usuario: Usuario, gestor: boolean): Promise<TentativaProva[]> {
  if (BACKEND === 'supabase') return listarResultadosSb(usuario, gestor)
  const base = collection(requireDb(), 'tentativasProva')
  if (!gestor && (usuario.papel !== 'franqueado' || !usuario.unidadeId)) return []
  const snap = await getDocs(gestor ? base : query(base, where('unidadeId', '==', usuario.unidadeId)))
  return snap.docs.map((d) => mapTentativa(d.id, d.data()))
}

/** Só a franqueadora: folhas de respostas das tentativas, para calcular a nota. */
export async function listarFolhas(tentativas: TentativaProva[]): Promise<Map<string, number[]>> {
  if (BACKEND === 'supabase') return listarFolhasSb(tentativas)
  const banco = requireDb()
  const pares = await Promise.all(
    tentativas.map(async (t) => {
      const snap = await getDoc(doc(banco, 'tentativasProva', t.id, 'folha', 'atual')).catch(() => null)
      return [t.id, snap?.exists() ? listaNumero(snap.data().respostas) : null] as const
    }),
  )
  return new Map(pares.filter((par): par is readonly [string, number[]] => par[1] !== null))
}

/** Só a franqueadora: fecha como reprovada uma tentativa que ficou sem correção. */
export async function fecharTentativaPendente(id: string): Promise<void> {
  if (BACKEND === 'supabase') return fecharTentativaPendenteSb(id)
  await updateDoc(doc(requireDb(), 'tentativasProva', id), { aprovado: false, corrigidoEm: serverTimestamp() })
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
  if (BACKEND === 'supabase') return salvarCursoSb(autor, curso)
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
  if (BACKEND === 'supabase') return salvarProvaSb(autor, prova, versaoAtual)
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
 * Se a prova ganhou versão nova depois do envio, as rules só aceitam "reprovado" (a chance é perdida)
 * e o fluxo acima resolve isso sozinho, sem deixar a tentativa presa.
 */
export async function corrigirTentativa(id: string): Promise<boolean> {
  if (BACKEND === 'supabase') return corrigirTentativaSb(id)
  const ref = doc(requireDb(), 'tentativasProva', id)
  try {
    await updateDoc(ref, { aprovado: true, corrigidoEm: serverTimestamp() })
    return true
  } catch {
    await updateDoc(ref, { aprovado: false, corrigidoEm: serverTimestamp() })
    return false
  }
}

export class ProvaAtualizadaError extends Error {
  constructor() {
    super('A franqueadora acabou de atualizar esta prova. Recarregue a página para responder a versão nova; esta chance não foi usada.')
  }
}

/**
 * Envia as respostas (ocupa a chance) e em seguida pede a correção.
 * A tentativa (sem respostas) e a folha de respostas vão no mesmo lote.
 */
export async function enviarTentativa(
  usuario: Usuario,
  prova: Prova,
  ciclo: number,
  numero: number,
  respostas: number[],
): Promise<{ id: string; aprovado: boolean; provaAtualizada: boolean }> {
  if (BACKEND === 'supabase') return enviarTentativaSb(usuario, prova, ciclo, numero, respostas)
  const banco = requireDb()
  const id = idTentativa(usuario.uid, prova.cursoId, ciclo, numero)
  const lote = writeBatch(banco)
  lote.set(doc(banco, 'tentativasProva', id), {
    uid: usuario.uid,
    cursoId: prova.cursoId,
    ciclo,
    numero,
    nome: usuario.nome,
    unidadeId: usuario.unidadeId ?? '',
    unidadeNome: usuario.unidade ?? '',
    versao: prova.versao,
    aprovado: null,
    criadoEm: serverTimestamp(),
    corrigidoEm: null,
  })
  lote.set(doc(banco, 'tentativasProva', id, 'folha', 'atual'), { uid: usuario.uid, versao: prova.versao, respostas })
  try {
    await lote.commit()
  } catch (falha) {
    const atual = await obterProva(prova.cursoId)
    if (atual && atual.versao !== prova.versao) throw new ProvaAtualizadaError()
    throw falha
  }
  const aprovado = await corrigirTentativa(id)
  let provaAtualizada = false
  if (!aprovado) {
    const atual = await obterProva(prova.cursoId)
    provaAtualizada = Boolean(atual && atual.versao !== prova.versao)
  }
  return { id, aprovado, provaAtualizada }
}

/**
 * Emite o certificado do curso direto (sem ler antes: o documento ainda não existe e as rules
 * não deixam ler o que não é seu). Se já existir, a criação é recusada e nada muda.
 */
export async function emitirCertificadoCurso(usuario: Usuario, curso: Curso, tentativaId: string): Promise<string> {
  if (BACKEND === 'supabase') return emitirCertificadoCursoSb(usuario, curso, tentativaId)
  const id = idCertificado(usuario.uid, curso.id)
  await setDoc(doc(requireDb(), 'certificados', id), {
    uid: usuario.uid,
    trilhaId: curso.id,
    nome: usuario.nome,
    trilhaTitulo: curso.titulo.slice(0, 120),
    codigo: codigoCertificado(curso.id),
    tentativaId,
    emitidoEm: serverTimestamp(),
  })
  return id
}

/** Entrar (ou voltar) no reestudo: cria o registro ou reinicia o cronômetro do servidor. */
export async function iniciarOuReiniciarReestudo(usuario: Usuario, prova: Prova, ciclo: number): Promise<Reestudo | null> {
  if (BACKEND === 'supabase') return iniciarOuReiniciarReestudoSb(usuario, prova, ciclo)
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
  if (BACKEND === 'supabase') return concluirReestudoSb(usuario, cursoId, ciclo)
  await updateDoc(doc(requireDb(), 'reestudos', idReestudo(usuario.uid, cursoId, ciclo)), {
    status: 'concluido',
    concluidoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  })
}
