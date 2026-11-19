import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore'
import { requireDb } from './firebase'
import { paraMillis } from './format'
import { RESULTADOS, calcularTotais, pesoValido, type Resposta } from './checklist'
import {
  MODALIDADES,
  STATUS_ACAO,
  STATUS_AUDITORIA,
  normalizarItemAud,
  respostasParaGravar,
  resultadoAuditoria,
  versaoMudaAud,
  type AcaoAuditoria,
  type Auditoria,
  type ItemAuditoria,
  type Modalidade,
  type ModeloAuditoria,
  type ModeloAuditoriaForm,
  type StatusAcao,
} from './auditoria'
import type { Usuario } from '../types'

const texto = (v: unknown, padrao = '') => (typeof v === 'string' ? v : padrao)
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
function umDe<T extends string>(lista: readonly T[], v: unknown, padrao: T): T {
  return lista.includes(v as T) ? (v as T) : padrao
}

function mapItem(v: unknown, i: number): ItemAuditoria {
  const d = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return { id: texto(d.id, `a${i + 1}`), texto: texto(d.texto), secao: texto(d.secao), peso: pesoValido(d.peso) }
}

function mapResposta(v: unknown, i: number): Resposta {
  const d = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    itemId: texto(d.itemId, `a${i + 1}`),
    texto: texto(d.texto),
    secao: texto(d.secao),
    peso: pesoValido(d.peso),
    resultado: umDe([...RESULTADOS, ''] as const, d.resultado, ''),
    obs: texto(d.obs),
    evidenciaUrl: texto(d.evidenciaUrl),
  }
}

export function mapModeloAud(id: string, d: DocumentData): ModeloAuditoria {
  return {
    id,
    titulo: texto(d.titulo, 'Auditoria'),
    descricao: texto(d.descricao),
    itens: Array.isArray(d.itens) ? d.itens.map(mapItem) : [],
    totalItens: numero(d.totalItens),
    pesoTotal: numero(d.pesoTotal),
    notaMinima: numero(d.notaMinima),
    versao: numero(d.versao) || 1,
    ativo: d.ativo === true,
    geradoPorIA: d.geradoPorIA === true,
    iaModelo: texto(d.iaModelo),
    criadoEmMs: paraMillis(d.criadoEm),
    atualizadoPorNome: texto(d.atualizadoPorNome),
    atualizadoEmMs: paraMillis(d.atualizadoEm),
  }
}

export function mapAuditoria(id: string, d: DocumentData): Auditoria {
  return {
    id,
    unidadeId: texto(d.unidadeId),
    unidadeNome: texto(d.unidadeNome),
    modeloId: texto(d.modeloId),
    modeloTitulo: texto(d.modeloTitulo, 'Auditoria'),
    modeloVersao: numero(d.modeloVersao),
    modalidade: umDe(MODALIDADES, d.modalidade, 'visita'),
    dataVisitaMs: paraMillis(d.dataVisita),
    auditorUid: texto(d.auditorUid),
    auditorNome: texto(d.auditorNome),
    respostas: Array.isArray(d.respostas) ? d.respostas.map(mapResposta) : [],
    totalItens: numero(d.totalItens),
    pesoTotal: numero(d.pesoTotal),
    qtdOk: numero(d.qtdOk),
    qtdNaoOk: numero(d.qtdNaoOk),
    qtdNa: numero(d.qtdNa),
    pontosObtidos: numero(d.pontosObtidos),
    pontosPossiveis: numero(d.pontosPossiveis),
    score: numero(d.score),
    notaMinima: numero(d.notaMinima),
    checklistExecucaoId: texto(d.checklistExecucaoId),
    checklistScore: typeof d.checklistScore === 'number' ? d.checklistScore : null,
    resultado: d.resultado === 'aprovada' ? 'aprovada' : 'reprovada',
    obsGeral: texto(d.obsGeral),
    geradoPorIA: d.geradoPorIA === true,
    iaModelo: texto(d.iaModelo),
    status: umDe(STATUS_AUDITORIA, d.status, 'rascunho'),
    assinaturaAuditorUid: texto(d.assinaturaAuditorUid),
    assinaturaAuditorNome: texto(d.assinaturaAuditorNome),
    assinaturaAuditorEmMs: paraMillis(d.assinaturaAuditorEm),
    cienciaUid: texto(d.cienciaUid),
    cienciaNome: texto(d.cienciaNome),
    cienciaEmMs: paraMillis(d.cienciaEm),
    contestacao: texto(d.contestacao),
    criadoEmMs: paraMillis(d.criadoEm),
    atualizadoEmMs: paraMillis(d.atualizadoEm),
  }
}

export function mapAcao(id: string, d: DocumentData): AcaoAuditoria {
  return {
    id,
    auditoriaId: texto(d.auditoriaId),
    unidadeId: texto(d.unidadeId),
    itemId: texto(d.itemId),
    itemTexto: texto(d.itemTexto),
    descricao: texto(d.descricao),
    responsavel: texto(d.responsavel),
    prazoMs: paraMillis(d.prazo),
    status: umDe(STATUS_ACAO, d.status, 'aberta'),
    evidenciaUrl: texto(d.evidenciaUrl),
    comentarioUnidade: texto(d.comentarioUnidade),
    comentarioFranqueadora: texto(d.comentarioFranqueadora),
    criadoEmMs: paraMillis(d.criadoEm),
    atualizadoPorNome: texto(d.atualizadoPorNome),
    atualizadoEmMs: paraMillis(d.atualizadoEm),
  }
}

// ---------- Modelos ----------

export async function listarModelosAud(): Promise<ModeloAuditoria[]> {
  const snap = await getDocs(collection(requireDb(), 'auditoriaModelos'))
  return snap.docs.map((d) => mapModeloAud(d.id, d.data())).sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

export async function salvarModeloAud(autor: Usuario, existente: ModeloAuditoria | null, f: ModeloAuditoriaForm): Promise<string> {
  const banco = requireDb()
  const ref = existente ? doc(banco, 'auditoriaModelos', existente.id) : doc(collection(banco, 'auditoriaModelos'))
  const itens = f.itens.map(normalizarItemAud)
  const dados = {
    titulo: f.titulo.trim().slice(0, 120),
    descricao: f.descricao.trim().slice(0, 1000),
    itens,
    totalItens: itens.length,
    pesoTotal: itens.reduce((s, i) => s + i.peso, 0),
    notaMinima: Math.round(f.notaMinima),
    ativo: f.ativo,
    geradoPorIA: f.geradoPorIA,
    iaModelo: f.geradoPorIA ? f.iaModelo.trim().slice(0, 80) : '',
    atualizadoPor: autor.uid,
    atualizadoPorNome: autor.nome,
    atualizadoEm: serverTimestamp(),
  }
  if (existente) {
    const versao = versaoMudaAud(existente, dados) ? existente.versao + 1 : existente.versao
    await updateDoc(ref, { ...dados, versao })
  } else {
    await setDoc(ref, { ...dados, versao: 1, criadoEm: serverTimestamp() })
  }
  return ref.id
}

// ---------- Auditorias ----------

/** Franqueadora: todas (mais recentes). Unidade: só as assinadas pelo auditor, da própria unidade. */
export async function listarAuditorias(gestor: boolean, unidadeId: string | null | undefined): Promise<Auditoria[]> {
  const base = collection(requireDb(), 'auditorias')
  if (gestor) {
    const snap = await getDocs(query(base, orderBy('criadoEm', 'desc'), limit(500)))
    return snap.docs.map((d) => mapAuditoria(d.id, d.data()))
  }
  if (!unidadeId) return []
  const snap = await getDocs(query(base, where('unidadeId', '==', unidadeId), where('status', 'in', ['aguardando_ciencia', 'concluida'])))
  return snap.docs.map((d) => mapAuditoria(d.id, d.data())).sort((a, b) => b.dataVisitaMs - a.dataVisitaMs)
}

export async function lerAuditoria(id: string): Promise<Auditoria | null> {
  const snap = await getDoc(doc(requireDb(), 'auditorias', id))
  return snap.exists() ? mapAuditoria(snap.id, snap.data()) : null
}

export interface DadosAuditoria {
  modalidade: Modalidade
  dataVisita: Date
  respostas: Resposta[]
  notaMinima: number
  checklistExecucaoId: string
  checklistScore: number | null
  obsGeral: string
  geradoPorIA: boolean
  iaModelo: string
}

function camposEditaveis(f: DadosAuditoria) {
  const respostas = respostasParaGravar(f.respostas)
  const totais = calcularTotais(respostas)
  const checklistScore = f.checklistExecucaoId ? f.checklistScore : null
  return {
    modalidade: f.modalidade,
    dataVisita: f.dataVisita,
    respostas,
    qtdOk: totais.qtdOk,
    qtdNaoOk: totais.qtdNaoOk,
    qtdNa: totais.qtdNa,
    pontosObtidos: totais.pontosObtidos,
    pontosPossiveis: totais.pontosPossiveis,
    score: totais.score,
    notaMinima: Math.round(f.notaMinima),
    checklistExecucaoId: f.checklistExecucaoId,
    checklistScore,
    resultado: resultadoAuditoria(totais.score, Math.round(f.notaMinima), checklistScore),
    obsGeral: f.obsGeral.trim().slice(0, 4000),
    geradoPorIA: f.geradoPorIA,
    iaModelo: f.geradoPorIA ? f.iaModelo.trim().slice(0, 80) : '',
    atualizadoEm: serverTimestamp(),
  }
}

export async function criarAuditoria(autor: Usuario, modelo: ModeloAuditoria, unidade: { id: string; nome: string }, f: DadosAuditoria): Promise<string> {
  const ref = doc(collection(requireDb(), 'auditorias'))
  await setDoc(ref, {
    unidadeId: unidade.id,
    unidadeNome: unidade.nome.trim().slice(0, 120),
    modeloId: modelo.id,
    modeloTitulo: modelo.titulo,
    modeloVersao: modelo.versao,
    auditorUid: autor.uid,
    auditorNome: autor.nome,
    totalItens: modelo.totalItens,
    pesoTotal: modelo.pesoTotal,
    ...camposEditaveis(f),
    status: 'rascunho',
    assinaturaAuditorUid: '',
    assinaturaAuditorNome: '',
    assinaturaAuditorEm: null,
    cienciaUid: '',
    cienciaNome: '',
    cienciaEm: null,
    contestacao: '',
    criadoEm: serverTimestamp(),
  })
  return ref.id
}

export async function salvarRascunho(id: string, f: DadosAuditoria): Promise<void> {
  await updateDoc(doc(requireDb(), 'auditorias', id), { ...camposEditaveis(f) })
}

/** Grava o conteúdo final e assina em uma única escrita; depois disso o auditor não muda mais nada. */
export async function assinarAuditoria(autor: Usuario, id: string, f: DadosAuditoria): Promise<void> {
  await updateDoc(doc(requireDb(), 'auditorias', id), {
    ...camposEditaveis(f),
    status: 'aguardando_ciencia',
    assinaturaAuditorUid: autor.uid,
    assinaturaAuditorNome: autor.nome,
    assinaturaAuditorEm: serverTimestamp(),
  })
}

export async function assinarCiencia(autor: Usuario, id: string, contestacao: string): Promise<void> {
  await updateDoc(doc(requireDb(), 'auditorias', id), {
    status: 'concluida',
    cienciaUid: autor.uid,
    cienciaNome: autor.nome,
    cienciaEm: serverTimestamp(),
    contestacao: contestacao.trim().slice(0, 2000),
    atualizadoEm: serverTimestamp(),
  })
}

// ---------- Plano de ação ----------

export async function listarAcoes(gestor: boolean, unidadeId: string | null | undefined): Promise<AcaoAuditoria[]> {
  const base = collection(requireDb(), 'auditoriaAcoes')
  if (!gestor && !unidadeId) return []
  const snap = await getDocs(gestor ? query(base, orderBy('criadoEm', 'desc'), limit(1000)) : query(base, where('unidadeId', '==', unidadeId)))
  return snap.docs.map((d) => mapAcao(d.id, d.data())).sort((a, b) => a.prazoMs - b.prazoMs)
}

export async function listarAcoesDaAuditoria(gestor: boolean, auditoria: Pick<Auditoria, 'id' | 'unidadeId'>): Promise<AcaoAuditoria[]> {
  const base = collection(requireDb(), 'auditoriaAcoes')
  // A unidade só pode consultar filtrando pela própria unidade (as rules conferem pelo filtro).
  const snap = await getDocs(
    gestor ? query(base, where('auditoriaId', '==', auditoria.id)) : query(base, where('unidadeId', '==', auditoria.unidadeId), where('auditoriaId', '==', auditoria.id)),
  )
  return snap.docs.map((d) => mapAcao(d.id, d.data())).sort((a, b) => a.prazoMs - b.prazoMs)
}

export async function criarAcao(
  autor: Usuario,
  auditoria: Pick<Auditoria, 'id' | 'unidadeId'>,
  item: { itemId: string; itemTexto: string },
  f: { descricao: string; responsavel: string; prazo: Date },
): Promise<void> {
  await setDoc(doc(collection(requireDb(), 'auditoriaAcoes')), {
    auditoriaId: auditoria.id,
    unidadeId: auditoria.unidadeId,
    itemId: item.itemId.slice(0, 64),
    itemTexto: item.itemTexto.slice(0, 300),
    descricao: f.descricao.trim().slice(0, 1000),
    responsavel: f.responsavel.trim().slice(0, 120),
    prazo: f.prazo,
    status: 'aberta',
    evidenciaUrl: '',
    comentarioUnidade: '',
    comentarioFranqueadora: '',
    criadoEm: serverTimestamp(),
    atualizadoPor: autor.uid,
    atualizadoPorNome: autor.nome,
    atualizadoEm: serverTimestamp(),
  })
}

export async function andamentoAcaoUnidade(autor: Usuario, id: string, status: StatusAcao, evidenciaUrl: string, comentario: string): Promise<void> {
  await updateDoc(doc(requireDb(), 'auditoriaAcoes', id), {
    status,
    evidenciaUrl: evidenciaUrl.trim().slice(0, 600),
    comentarioUnidade: comentario.trim().slice(0, 1000),
    atualizadoPor: autor.uid,
    atualizadoPorNome: autor.nome,
    atualizadoEm: serverTimestamp(),
  })
}

export async function decidirAcao(autor: Usuario, id: string, status: 'validada' | 'reaberta', comentario: string): Promise<void> {
  await updateDoc(doc(requireDb(), 'auditoriaAcoes', id), {
    status,
    comentarioFranqueadora: comentario.trim().slice(0, 1000),
    atualizadoPor: autor.uid,
    atualizadoPorNome: autor.nome,
    atualizadoEm: serverTimestamp(),
  })
}
