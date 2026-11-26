import { BACKEND } from './backend'
import {
  enviarExecucaoSb,
  lerExecucaoSb,
  lerModeloSb,
  listarExecucoesSb,
  listarModelosSb,
  salvarModeloSb,
  salvarObsProprietarioSb,
} from './checklistSupabase'
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
  type QueryConstraint,
} from 'firebase/firestore'
import { requireDb } from './firebase'
import { paraMillis } from './format'
import {
  FREQUENCIAS,
  RESULTADOS,
  TIPOS_CHECKLIST,
  calcularTotais,
  horarioValido,
  normalizarItem,
  pesoTotalDe,
  pesoValido,
  versaoMuda,
  type ExecucaoChecklist,
  type ItemModelo,
  type ModeloChecklist,
  type ModeloForm,
  type Resposta,
} from './checklist'
import type { Usuario } from '../types'

const texto = (v: unknown, padrao = '') => (typeof v === 'string' ? v : padrao)
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
function umDe<T extends string>(lista: readonly T[], v: unknown, padrao: T): T {
  return lista.includes(v as T) ? (v as T) : padrao
}

function mapItem(v: unknown, i: number): ItemModelo {
  const d = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    id: texto(d.id, `i${i + 1}`),
    texto: texto(d.texto),
    secao: texto(d.secao),
    peso: pesoValido(d.peso),
    exigeEvidencia: d.exigeEvidencia === true,
    exigeObs: d.exigeObs === true,
  }
}

function mapResposta(v: unknown, i: number): Resposta {
  const d = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    itemId: texto(d.itemId, `i${i + 1}`),
    texto: texto(d.texto),
    secao: texto(d.secao),
    peso: pesoValido(d.peso),
    resultado: umDe([...RESULTADOS, ''] as const, d.resultado, ''),
    obs: texto(d.obs),
    evidenciaUrl: texto(d.evidenciaUrl),
  }
}

export function mapModelo(id: string, d: DocumentData): ModeloChecklist {
  const itens = Array.isArray(d.itens) ? d.itens.map(mapItem) : []
  return {
    id,
    titulo: texto(d.titulo, 'Checklist'),
    descricao: texto(d.descricao),
    tipo: umDe(TIPOS_CHECKLIST, d.tipo, 'outro'),
    frequencia: umDe(FREQUENCIAS, d.frequencia, 'avulsa'),
    horarioLiberacao: horarioValido(d.horarioLiberacao) ? d.horarioLiberacao : null,
    itens,
    totalItens: numero(d.totalItens),
    pesoTotal: numero(d.pesoTotal),
    versao: numero(d.versao) || 1,
    publico: d.publico === true,
    unidades: Array.isArray(d.unidades) ? d.unidades.filter((u: unknown): u is string => typeof u === 'string') : [],
    ativo: d.ativo === true,
    geradoPorIA: d.geradoPorIA === true,
    iaModelo: texto(d.iaModelo),
    criadoEmMs: paraMillis(d.criadoEm),
    atualizadoPorNome: texto(d.atualizadoPorNome),
    atualizadoEmMs: paraMillis(d.atualizadoEm),
  }
}

export function mapExecucao(id: string, d: DocumentData): ExecucaoChecklist {
  return {
    id,
    modeloId: texto(d.modeloId),
    modeloTitulo: texto(d.modeloTitulo, 'Checklist'),
    modeloVersao: numero(d.modeloVersao),
    tipo: umDe(TIPOS_CHECKLIST, d.tipo, 'outro'),
    frequencia: umDe(FREQUENCIAS, d.frequencia, 'avulsa'),
    unidadeId: texto(d.unidadeId),
    unidadeNome: texto(d.unidadeNome),
    uid: texto(d.uid),
    nome: texto(d.nome),
    respostas: Array.isArray(d.respostas) ? d.respostas.map(mapResposta) : [],
    totalItens: numero(d.totalItens),
    qtdOk: numero(d.qtdOk),
    qtdNaoOk: numero(d.qtdNaoOk),
    qtdNa: numero(d.qtdNa),
    pontosObtidos: numero(d.pontosObtidos),
    pontosPossiveis: numero(d.pontosPossiveis),
    score: numero(d.score),
    obsGeral: texto(d.obsGeral),
    obsProprietario: texto(d.obsProprietario),
    obsProprietarioNome: texto(d.obsProprietarioNome),
    obsProprietarioEmMs: paraMillis(d.obsProprietarioEm),
    criadoEmMs: paraMillis(d.criadoEm),
  }
}

/** A franqueadora lê todos; a unidade junta os modelos da rede e os direcionados a ela. */
export async function listarModelos(usuario: Pick<Usuario, 'unidadeId'>, gestor: boolean): Promise<ModeloChecklist[]> {
  if (BACKEND === 'supabase') return listarModelosSb(usuario, gestor)
  const base = collection(requireDb(), 'checklistModelos')
  if (gestor) {
    const snap = await getDocs(base)
    return snap.docs.map((d) => mapModelo(d.id, d.data()))
  }
  const unidade = usuario.unidadeId ?? ''
  const [rede, daUnidade] = await Promise.all([
    getDocs(query(base, where('ativo', '==', true), where('publico', '==', true))),
    unidade ? getDocs(query(base, where('ativo', '==', true), where('unidades', 'array-contains', unidade))) : Promise.resolve(null),
  ])
  const mapa = new Map<string, ModeloChecklist>()
  for (const d of [...rede.docs, ...(daUnidade?.docs ?? [])]) mapa.set(d.id, mapModelo(d.id, d.data()))
  return [...mapa.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

export async function lerModelo(id: string): Promise<ModeloChecklist | null> {
  if (BACKEND === 'supabase') return lerModeloSb(id)
  const snap = await getDoc(doc(requireDb(), 'checklistModelos', id))
  return snap.exists() ? mapModelo(snap.id, snap.data()) : null
}

export async function salvarModelo(autor: Usuario, existente: ModeloChecklist | null, f: ModeloForm): Promise<string> {
  if (BACKEND === 'supabase') {
    return salvarModeloSb(existente, { ...f, horarioLiberacao: autor.papel === 'admin' ? f.horarioLiberacao : undefined })
  }
  // A lista de chaves permitidas nas regras do Firestore exclui horarioLiberacao.
  const banco = requireDb()
  const ref = existente ? doc(banco, 'checklistModelos', existente.id) : doc(collection(banco, 'checklistModelos'))
  const itens = f.itens.map(normalizarItem)
  const dados = {
    titulo: f.titulo.trim().slice(0, 120),
    descricao: f.descricao.trim().slice(0, 1000),
    tipo: f.tipo,
    frequencia: f.frequencia,
    itens,
    totalItens: itens.length,
    pesoTotal: pesoTotalDe(itens),
    publico: f.publico,
    unidades: f.publico ? [] : f.unidades.slice(0, 30),
    ativo: f.ativo,
    geradoPorIA: f.geradoPorIA,
    iaModelo: f.geradoPorIA ? f.iaModelo.trim().slice(0, 80) : '',
    atualizadoPor: autor.uid,
    atualizadoPorNome: autor.nome,
    atualizadoEm: serverTimestamp(),
  }
  if (existente) {
    const versao = versaoMuda(existente, { itens, titulo: dados.titulo, tipo: dados.tipo, frequencia: dados.frequencia, pesoTotal: dados.pesoTotal }) ? existente.versao + 1 : existente.versao
    await updateDoc(ref, { ...dados, versao })
  } else {
    await setDoc(ref, { ...dados, versao: 1, criadoEm: serverTimestamp() })
  }
  return ref.id
}

export interface ConsultaExecucoes {
  unidadeId?: string
  deMs?: number | null
  ateMs?: number | null
  maximo?: number
}

/** Franqueadora: toda a rede (filtro opcional por unidade e datas). Unidade: só o próprio histórico. */
export async function listarExecucoes(usuario: Pick<Usuario, 'unidadeId'>, gestor: boolean, c: ConsultaExecucoes = {}): Promise<ExecucaoChecklist[]> {
  if (BACKEND === 'supabase') return listarExecucoesSb(usuario, gestor, c)
  const base = collection(requireDb(), 'checklistExecucoes')
  const filtros: QueryConstraint[] = []
  const unidade = gestor ? c.unidadeId : usuario.unidadeId
  if (!gestor && !unidade) return []
  if (unidade) filtros.push(where('unidadeId', '==', unidade))
  if (c.deMs != null) filtros.push(where('criadoEm', '>=', new Date(c.deMs)))
  if (c.ateMs != null) filtros.push(where('criadoEm', '<', new Date(c.ateMs + 86_400_000)))
  filtros.push(orderBy('criadoEm', 'desc'), limit(c.maximo ?? 300))
  const snap = await getDocs(query(base, ...filtros))
  return snap.docs.map((d) => mapExecucao(d.id, d.data()))
}

export async function lerExecucao(id: string): Promise<ExecucaoChecklist | null> {
  if (BACKEND === 'supabase') return lerExecucaoSb(id)
  const snap = await getDoc(doc(requireDb(), 'checklistExecucoes', id))
  return snap.exists() ? mapExecucao(snap.id, snap.data()) : null
}

export async function enviarExecucao(autor: Usuario, modelo: ModeloChecklist, respostas: Resposta[], obsGeral: string): Promise<string> {
  if (BACKEND === 'supabase') return enviarExecucaoSb(autor, modelo, respostas, obsGeral)
  const ref = doc(collection(requireDb(), 'checklistExecucoes'))
  const limpas = respostas.map((r) => ({
    itemId: r.itemId,
    texto: r.texto.slice(0, 300),
    secao: r.secao.slice(0, 60),
    peso: pesoValido(r.peso),
    resultado: r.resultado,
    obs: r.obs.trim().slice(0, 500),
    evidenciaUrl: r.evidenciaUrl.trim().slice(0, 600),
  }))
  const totais = calcularTotais(limpas)
  await setDoc(ref, {
    modeloId: modelo.id,
    modeloTitulo: modelo.titulo,
    modeloVersao: modelo.versao,
    tipo: modelo.tipo,
    frequencia: modelo.frequencia,
    unidadeId: autor.unidadeId ?? '',
    unidadeNome: autor.unidade ?? '',
    uid: autor.uid,
    nome: autor.nome,
    respostas: limpas,
    ...totais,
    obsGeral: obsGeral.trim().slice(0, 2000),
    obsProprietario: '',
    obsProprietarioPor: '',
    obsProprietarioNome: '',
    obsProprietarioEm: null,
    criadoEm: serverTimestamp(),
  })
  return ref.id
}

export async function salvarObsProprietario(autor: Usuario, id: string, textoObs: string): Promise<void> {
  if (BACKEND === 'supabase') return salvarObsProprietarioSb(id, textoObs)
  await updateDoc(doc(requireDb(), 'checklistExecucoes', id), {
    obsProprietario: textoObs.trim().slice(0, 2000),
    obsProprietarioPor: autor.uid,
    obsProprietarioNome: autor.nome,
    obsProprietarioEm: serverTimestamp(),
  })
}
