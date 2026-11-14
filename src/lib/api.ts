import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore'
import { IDS_CATEGORIAS } from '../data/categorias'
import type {
  Aceite,
  Anexo,
  Audiencia,
  Aviso,
  AvisoLeitura,
  Categoria,
  Certificado,
  Documento,
  FormatoDocumento,
  Leitura,
  Papel,
  Pergunta,
  Quiz,
  StatusDocumento,
  Tentativa,
  TipoAviso,
  TipoDocumento,
  Trilha,
  TrilhaItem,
  Usuario,
  VersaoDocumento,
} from '../types'
import { calcularUids } from './access'
import { requireDb } from './firebase'
import { idAvisoLeitura, idCertificado, idLeitura } from './ids'
import { htmlParaTexto, limitar, textoParaIndice } from './text'

function texto(valor: unknown, fallback = ''): string {
  return typeof valor === 'string' ? valor : fallback
}

function listaTexto(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : []
}

function papeis(valor: unknown): Papel[] {
  return listaTexto(valor).filter((item): item is Papel => item === 'admin' || item === 'franqueado')
}

function audiencia(data: DocumentData, publicoPadrao: boolean): Audiencia {
  const publico = typeof data.publico === 'boolean' ? data.publico : publicoPadrao
  return {
    publico,
    unidades: listaTexto(data.unidades),
    papeis: papeis(data.papeis),
    uidsExtra: listaTexto(data.uidsExtra),
    uids: listaTexto(data.uids),
  }
}

export function mapUsuario(id: string, data: DocumentData): Usuario | null {
  if (data.papel !== 'admin' && data.papel !== 'franqueado') return null
  if (typeof data.email !== 'string' || typeof data.nome !== 'string') return null
  return {
    uid: typeof data.uid === 'string' ? data.uid : id,
    email: data.email,
    nome: data.nome,
    papel: data.papel,
    ativo: data.ativo === true,
    recusado: data.recusado === true,
    unidade: texto(data.unidade),
    cidade: texto(data.cidade),
    criadoEm: data.criadoEm,
    atualizadoEm: data.atualizadoEm,
  }
}

export function mapCategoria(id: string, data: DocumentData): Categoria {
  const nome = texto(data.nome) || texto(data.titulo) || texto(data.title) || id
  return {
    id,
    nome,
    descricao: texto(data.descricao),
    ordem: typeof data.ordem === 'number' ? data.ordem : 0,
    parentId: typeof data.parentId === 'string' && data.parentId ? data.parentId : null,
    ...audiencia(data, true),
    criadoEm: data.criadoEm,
    atualizadoEm: data.atualizadoEm,
  }
}

function mapAnexos(valor: unknown): Anexo[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const registro = item as Record<string, unknown>
    const url = texto(registro.url)
    const nome = texto(registro.nome, 'Anexo')
    if (!url) return []
    const tipo = registro.tipo === 'drive' || registro.tipo === 'video' || registro.tipo === 'link' ? registro.tipo : 'link'
    return [{ nome, url, tipo }]
  })
}

export function mapDocumento(id: string, data: DocumentData): Documento {
  const tipo = ['pop', 'manual', 'processo', 'politica', 'checklist', 'html'].includes(texto(data.tipo))
    ? (data.tipo as TipoDocumento)
    : 'manual'
  const htmlConteudo = texto(data.htmlConteudo)
  const conteudoHtml = texto(data.conteudoHtml) || texto(data.conteudo) || texto(data.html)
  const interativo =
    data.formato === 'html' ||
    id.endsWith('-interativo') ||
    /interativ/i.test(texto(data.tipo)) ||
    (htmlConteudo.includes('<') && htmlConteudo.length > 80 && !conteudoHtml)
  const formato: FormatoDocumento = interativo ? 'html' : 'richtext'
  const status: StatusDocumento = data.status === 'rascunho' ? 'rascunho' : 'publicado'
  const textoSalvo = texto(data.conteudoTexto)
  const conteudoTexto =
    textoSalvo && !textoSalvo.includes('data:image') && !textoSalvo.includes('base64') && textoSalvo.length < 20000
      ? textoSalvo
      : textoParaIndice(conteudoHtml || htmlConteudo || textoSalvo)
  return {
    id,
    titulo: texto(data.titulo) || texto(data.nome, 'Sem título'),
    categoriaId: texto(data.categoriaId) || texto(data.categoria),
    tipo,
    formato,
    status,
    versao: typeof data.versao === 'number' ? data.versao : 1,
    leituraObrigatoria: data.leituraObrigatoria === true,
    conteudoHtml,
    conteudoTexto,
    htmlConteudo,
    htmlUrl: texto(data.htmlUrl),
    anexos: mapAnexos(data.anexos),
    ...audiencia(data, false),
    criadoEm: data.criadoEm,
    atualizadoEm: data.atualizadoEm,
    atualizadoPor: texto(data.atualizadoPor),
    atualizadoPorNome: texto(data.atualizadoPorNome),
    publicadoEm: data.publicadoEm,
  }
}

function mapItens(valor: unknown): TrilhaItem[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const registro = item as Record<string, unknown>
    const tipo = registro.tipo === 'quiz' ? 'quiz' : registro.tipo === 'documento' ? 'documento' : null
    const refId = texto(registro.refId)
    if (!tipo || !refId) return []
    return [{ id: texto(registro.id, refId), tipo, refId, titulo: texto(registro.titulo, 'Item') }]
  })
}

export function mapTrilha(id: string, data: DocumentData): Trilha {
  return {
    id,
    titulo: texto(data.titulo, 'Trilha'),
    descricao: texto(data.descricao),
    notaMinima: typeof data.notaMinima === 'number' ? data.notaMinima : 70,
    publicado: data.publicado === true,
    itens: mapItens(data.itens),
    ...audiencia(data, true),
    criadoEm: data.criadoEm,
    atualizadoEm: data.atualizadoEm,
  }
}

function mapPerguntas(valor: unknown): Pergunta[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item, indice) => {
    if (!item || typeof item !== 'object') return []
    const registro = item as Record<string, unknown>
    const opcoes = listaTexto(registro.opcoes)
    if (!texto(registro.enunciado) || opcoes.length < 2) return []
    const correta = typeof registro.correta === 'number' ? registro.correta : 0
    return [{ id: texto(registro.id, `p${indice + 1}`), enunciado: texto(registro.enunciado), opcoes, correta }]
  })
}

export function mapQuiz(id: string, data: DocumentData): Quiz {
  return {
    id,
    trilhaId: texto(data.trilhaId),
    titulo: texto(data.titulo, 'Quiz'),
    notaMinima: typeof data.notaMinima === 'number' ? data.notaMinima : 70,
    perguntas: mapPerguntas(data.perguntas),
    publicado: data.publicado === true,
    ...audiencia(data, true),
    criadoEm: data.criadoEm,
    atualizadoEm: data.atualizadoEm,
  }
}

function mesclar<T extends { id: string }>(grupos: T[][]): T[] {
  const mapa = new Map<string, T>()
  for (const grupo of grupos) for (const item of grupo) mapa.set(item.id, item)
  return [...mapa.values()]
}

async function lerColecao<T>(caminho: string, mapear: (id: string, data: DocumentData) => T): Promise<T[]> {
  const snap = await getDocs(collection(requireDb(), caminho))
  return snap.docs.map((item) => mapear(item.id, item.data()))
}

export async function carregarPortal(usuario: Usuario): Promise<{
  categorias: Categoria[]
  documentos: Documento[]
  trilhas: Trilha[]
}> {
  const banco = requireDb()
  if (usuario.papel === 'admin') {
    const [categorias, documentos, trilhas] = await Promise.all([
      lerColecao('categorias', mapCategoria),
      lerColecao('documentos', mapDocumento),
      lerColecao('trilhas', mapTrilha),
    ])
    return { categorias, documentos, trilhas }
  }

  const conhecidas = await Promise.all(
    IDS_CATEGORIAS.map(async (id) => {
      try {
        const snap = await getDoc(doc(banco, 'categorias', id))
        return snap.exists() ? mapCategoria(snap.id, snap.data()) : null
      } catch {
        return null
      }
    }),
  )

  const [catPublicas, catMinhas, docsPublicos, docsMeus, trilhasPublicas, trilhasMinhas] = await Promise.all([
    getDocs(query(collection(banco, 'categorias'), where('publico', '==', true))),
    getDocs(query(collection(banco, 'categorias'), where('uids', 'array-contains', usuario.uid))),
    getDocs(query(collection(banco, 'documentos'), where('status', '==', 'publicado'), where('publico', '==', true))),
    getDocs(query(collection(banco, 'documentos'), where('status', '==', 'publicado'), where('uids', 'array-contains', usuario.uid))),
    getDocs(query(collection(banco, 'trilhas'), where('publicado', '==', true), where('publico', '==', true))),
    getDocs(query(collection(banco, 'trilhas'), where('publicado', '==', true), where('uids', 'array-contains', usuario.uid))),
  ])

  return {
    categorias: mesclar([
      conhecidas.filter((item): item is Categoria => item !== null),
      catPublicas.docs.map((item) => mapCategoria(item.id, item.data())),
      catMinhas.docs.map((item) => mapCategoria(item.id, item.data())),
    ]),
    documentos: mesclar([
      docsPublicos.docs.map((item) => mapDocumento(item.id, item.data())),
      docsMeus.docs.map((item) => mapDocumento(item.id, item.data())),
    ]),
    trilhas: mesclar([
      trilhasPublicas.docs.map((item) => mapTrilha(item.id, item.data())),
      trilhasMinhas.docs.map((item) => mapTrilha(item.id, item.data())),
    ]),
  }
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const lista = await lerColecao('usuarios', (id, data) => mapUsuario(id, data))
  return lista.filter((item): item is Usuario => item !== null)
}

function criadoEmDe(valor: unknown): Timestamp | ReturnType<typeof serverTimestamp> {
  if (valor && typeof valor === 'object' && 'toMillis' in valor) return valor as Timestamp
  return serverTimestamp()
}

export interface RascunhoCategoria {
  nome: string
  descricao: string
  ordem: number
  parentId: string | null
  publico: boolean
  unidades: string[]
  papeis: Papel[]
  uidsExtra: string[]
}

export async function salvarCategoria(rascunho: RascunhoCategoria, usuarios: Usuario[], id?: string): Promise<string> {
  const banco = requireDb()
  const ref = id ? doc(banco, 'categorias', id) : doc(collection(banco, 'categorias'))
  const anterior = id ? await getDoc(ref) : null
  const uids = calcularUids(rascunho, usuarios)
  await setDoc(ref, {
    nome: rascunho.nome.trim(),
    descricao: rascunho.descricao.trim(),
    ordem: rascunho.ordem,
    parentId: rascunho.parentId,
    publico: rascunho.publico,
    unidades: rascunho.unidades,
    papeis: rascunho.papeis,
    uidsExtra: rascunho.uidsExtra,
    uids,
    criadoEm: criadoEmDe(anterior?.exists() ? anterior.data().criadoEm : undefined),
    atualizadoEm: serverTimestamp(),
  })
  return ref.id
}

export async function excluirCategoria(id: string): Promise<void> {
  await deleteDoc(doc(requireDb(), 'categorias', id))
}

export interface RascunhoDocumento {
  titulo: string
  categoriaId: string
  tipo: TipoDocumento
  formato: FormatoDocumento
  status: StatusDocumento
  leituraObrigatoria: boolean
  conteudoHtml: string
  htmlConteudo: string
  htmlUrl: string
  anexos: Anexo[]
  publico: boolean
  unidades: string[]
  papeis: Papel[]
  uidsExtra: string[]
}

export async function salvarDocumento(rascunho: RascunhoDocumento, autor: Usuario, usuarios: Usuario[], id?: string): Promise<string> {
  const banco = requireDb()
  const ref = id ? doc(banco, 'documentos', id) : doc(collection(banco, 'documentos'))
  const anteriorSnap = id ? await getDoc(ref) : null
  const anterior = anteriorSnap?.exists() ? mapDocumento(anteriorSnap.id, anteriorSnap.data()) : null
  const conteudoTexto = limitar(
    htmlParaTexto(rascunho.formato === 'html' ? rascunho.htmlConteudo || rascunho.conteudoHtml : rascunho.conteudoHtml),
    800000,
  )
  const mudou =
    !anterior ||
    anterior.conteudoHtml !== rascunho.conteudoHtml ||
    anterior.htmlConteudo !== rascunho.htmlConteudo ||
    anterior.htmlUrl !== rascunho.htmlUrl ||
    anterior.titulo !== rascunho.titulo.trim()
  let versao = anterior?.versao ?? 1
  if (anterior && anterior.status === 'publicado' && rascunho.status === 'publicado' && mudou) versao = anterior.versao + 1
  const uids = calcularUids(rascunho, usuarios)
  const publicarAgora = rascunho.status === 'publicado' && (!anterior || anterior.status !== 'publicado' || versao !== anterior.versao)
  await setDoc(ref, {
    titulo: rascunho.titulo.trim(),
    categoriaId: rascunho.categoriaId,
    tipo: rascunho.tipo,
    formato: rascunho.formato,
    status: rascunho.status,
    versao,
    leituraObrigatoria: rascunho.leituraObrigatoria,
    conteudoHtml: limitar(rascunho.conteudoHtml, 800000),
    conteudoTexto,
    htmlConteudo: limitar(rascunho.htmlConteudo, 800000),
    htmlUrl: rascunho.htmlUrl.trim(),
    anexos: rascunho.anexos,
    publico: rascunho.publico,
    unidades: rascunho.unidades,
    papeis: rascunho.papeis,
    uidsExtra: rascunho.uidsExtra,
    uids,
    criadoEm: criadoEmDe(anterior?.criadoEm),
    atualizadoEm: serverTimestamp(),
    atualizadoPor: autor.uid,
    atualizadoPorNome: autor.nome.slice(0, 120),
    publicadoEm: rascunho.status === 'publicado' ? (publicarAgora ? serverTimestamp() : criadoEmDe(anterior?.publicadoEm)) : anterior?.publicadoEm ?? null,
  })

  if (rascunho.status === 'publicado') {
    const versaoRef = doc(banco, 'documentos', ref.id, 'versoes', String(versao))
    const versaoSnap = await getDoc(versaoRef)
    if (!versaoSnap.exists()) {
      await setDoc(versaoRef, {
        versao,
        titulo: rascunho.titulo.trim(),
        formato: rascunho.formato,
        conteudoHtml: limitar(rascunho.conteudoHtml, 800000),
        conteudoTexto,
        htmlConteudo: limitar(rascunho.htmlConteudo, 800000),
        htmlUrl: rascunho.htmlUrl.trim(),
        criadoEm: serverTimestamp(),
        autorId: autor.uid,
        autorNome: autor.nome,
      })
      await addDoc(collection(banco, 'avisos'), {
        titulo: limitar(anterior?.status === 'publicado' ? `Atualizado: ${rascunho.titulo.trim()}` : `Novo: ${rascunho.titulo.trim()}`, 120),
        mensagem: anterior?.status === 'publicado' ? 'Uma nova versão foi publicada na biblioteca.' : 'Um documento novo foi publicado na biblioteca.',
        documentoId: ref.id,
        tipo: (anterior?.status === 'publicado' ? 'atualizado' : 'novo') satisfies TipoAviso,
        publico: rascunho.publico,
        unidades: rascunho.unidades,
        papeis: rascunho.papeis,
        uidsExtra: rascunho.uidsExtra,
        uids,
        criadoEm: serverTimestamp(),
      })
    }
  }
  return ref.id
}

export async function excluirDocumento(id: string): Promise<void> {
  const banco = requireDb()
  const versoes = await getDocs(collection(banco, 'documentos', id, 'versoes'))
  await Promise.all(versoes.docs.map((item) => deleteDoc(item.ref)))
  await deleteDoc(doc(banco, 'documentos', id))
}

export async function listarVersoes(documentoId: string): Promise<VersaoDocumento[]> {
  const snap = await getDocs(collection(requireDb(), 'documentos', documentoId, 'versoes'))
  return snap.docs
    .map((item) => {
      const data = item.data()
      return {
        id: item.id,
        versao: typeof data.versao === 'number' ? data.versao : Number(item.id) || 1,
        titulo: texto(data.titulo),
        formato: data.formato === 'html' ? 'html' : 'richtext',
        conteudoHtml: texto(data.conteudoHtml),
        conteudoTexto: texto(data.conteudoTexto),
        htmlConteudo: texto(data.htmlConteudo),
        htmlUrl: texto(data.htmlUrl),
        criadoEm: data.criadoEm,
        autorId: texto(data.autorId),
        autorNome: texto(data.autorNome),
      } satisfies VersaoDocumento
    })
    .sort((a, b) => b.versao - a.versao)
}

export interface RascunhoQuiz {
  id: string
  titulo: string
  perguntas: Pergunta[]
}

export interface RascunhoTrilha {
  titulo: string
  descricao: string
  notaMinima: number
  publicado: boolean
  itens: TrilhaItem[]
  quizzes: RascunhoQuiz[]
  publico: boolean
  unidades: string[]
  papeis: Papel[]
  uidsExtra: string[]
}

export async function salvarTrilha(rascunho: RascunhoTrilha, usuarios: Usuario[], id?: string): Promise<string> {
  const banco = requireDb()
  const ref = id ? doc(banco, 'trilhas', id) : doc(collection(banco, 'trilhas'))
  const anterior = id ? await getDoc(ref) : null
  const uids = calcularUids(rascunho, usuarios)
  const audienciaBase = {
    publico: rascunho.publico,
    unidades: rascunho.unidades,
    papeis: rascunho.papeis,
    uidsExtra: rascunho.uidsExtra,
    uids,
  }
  await setDoc(ref, {
    titulo: rascunho.titulo.trim(),
    descricao: rascunho.descricao.trim(),
    notaMinima: rascunho.notaMinima,
    publicado: rascunho.publicado,
    itens: rascunho.itens,
    ...audienciaBase,
    criadoEm: criadoEmDe(anterior?.exists() ? anterior.data().criadoEm : undefined),
    atualizadoEm: serverTimestamp(),
  })
  const existentes = await getDocs(query(collection(banco, 'quizzes'), where('trilhaId', '==', ref.id)))
  const manter = new Set(rascunho.quizzes.map((quiz) => quiz.id))
  for (const quiz of rascunho.quizzes) {
    const quizRef = doc(banco, 'quizzes', quiz.id)
    const quizAnterior = await getDoc(quizRef)
    await setDoc(quizRef, {
      trilhaId: ref.id,
      titulo: quiz.titulo.trim(),
      notaMinima: rascunho.notaMinima,
      perguntas: quiz.perguntas,
      publicado: rascunho.publicado,
      ...audienciaBase,
      criadoEm: criadoEmDe(quizAnterior.exists() ? quizAnterior.data().criadoEm : undefined),
      atualizadoEm: serverTimestamp(),
    })
  }
  await Promise.all(existentes.docs.filter((item) => !manter.has(item.id)).map((item) => deleteDoc(item.ref)))
  return ref.id
}

export async function excluirTrilha(id: string): Promise<void> {
  const banco = requireDb()
  const quizzes = await getDocs(query(collection(banco, 'quizzes'), where('trilhaId', '==', id)))
  await Promise.all(quizzes.docs.map((item) => deleteDoc(item.ref)))
  await deleteDoc(doc(banco, 'trilhas', id))
}

export async function obterQuiz(id: string): Promise<Quiz | null> {
  const snap = await getDoc(doc(requireDb(), 'quizzes', id))
  return snap.exists() ? mapQuiz(snap.id, snap.data()) : null
}

export async function listarQuizzesDaTrilha(trilhaId: string): Promise<Quiz[]> {
  const snap = await getDocs(query(collection(requireDb(), 'quizzes'), where('trilhaId', '==', trilhaId)))
  return snap.docs.map((item) => mapQuiz(item.id, item.data()))
}

export async function listarQuizzes(): Promise<Quiz[]> {
  return lerColecao('quizzes', mapQuiz)
}

export async function reidratarAcessos(): Promise<void> {
  const banco = requireDb()
  const usuarios = await listarUsuarios()
  for (const nome of ['categorias', 'documentos', 'trilhas', 'quizzes'] as const) {
    const snap = await getDocs(collection(banco, nome))
    for (const item of snap.docs) {
      const data = item.data()
      if (typeof data.publico !== 'boolean') continue
      const uids = calcularUids(
        {
          publico: data.publico === true,
          unidades: listaTexto(data.unidades),
          papeis: papeis(data.papeis),
          uidsExtra: listaTexto(data.uidsExtra),
        },
        usuarios,
      )
      const atuais = listaTexto(data.uids)
      if (atuais.length === uids.length && atuais.every((uid) => uids.includes(uid))) continue
      await updateDoc(item.ref, { uids, atualizadoEm: serverTimestamp() })
    }
  }
}

export async function atualizarUsuario(
  uid: string,
  patch: Partial<Pick<Usuario, 'nome' | 'papel' | 'ativo' | 'recusado' | 'unidade' | 'cidade'>>,
): Promise<void> {
  await updateDoc(doc(requireDb(), 'usuarios', uid), { ...patch, atualizadoEm: serverTimestamp() })
}

export async function atualizarMeuNome(uid: string, nome: string): Promise<void> {
  await updateDoc(doc(requireDb(), 'usuarios', uid), { nome: nome.trim(), atualizadoEm: serverTimestamp() })
}

export async function registrarLeitura(usuario: Usuario, documento: Pick<Documento, 'id' | 'versao' | 'titulo'>): Promise<void> {
  const ref = doc(requireDb(), 'leituras', idLeitura(usuario.uid, documento.id, documento.versao))
  const snap = await getDoc(ref)
  if (snap.exists()) return
  await setDoc(ref, {
    uid: usuario.uid,
    documentoId: documento.id,
    versao: documento.versao,
    titulo: documento.titulo,
    lidoEm: serverTimestamp(),
  })
}

export async function registrarAceite(usuario: Usuario, documento: Pick<Documento, 'id' | 'versao' | 'titulo'>): Promise<void> {
  const banco = requireDb()
  const ref = doc(banco, 'aceites', idLeitura(usuario.uid, documento.id, documento.versao))
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: usuario.uid,
      documentoId: documento.id,
      versao: documento.versao,
      aceitoEm: serverTimestamp(),
      nome: usuario.nome,
      email: usuario.email,
      texto: 'Li e concordo',
      titulo: documento.titulo,
    })
  }
  await registrarLeitura(usuario, documento)
}

export async function registrarTentativa(dados: Omit<Tentativa, 'id' | 'respondidoEm'>): Promise<string> {
  const ref = doc(collection(requireDb(), 'tentativas'))
  await setDoc(ref, { ...dados, respondidoEm: serverTimestamp() })
  return ref.id
}

export async function emitirCertificado(dados: Omit<Certificado, 'id' | 'emitidoEm'>): Promise<string> {
  const id = idCertificado(dados.uid, dados.trilhaId)
  const ref = doc(requireDb(), 'certificados', id)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, { ...dados, emitidoEm: serverTimestamp() })
  }
  return id
}

function mapLeitura(id: string, data: DocumentData): Leitura {
  return {
    id,
    uid: texto(data.uid),
    documentoId: texto(data.documentoId),
    versao: typeof data.versao === 'number' ? data.versao : 1,
    titulo: texto(data.titulo),
    lidoEm: data.lidoEm,
  }
}

function mapAceite(id: string, data: DocumentData): Aceite {
  return {
    id,
    uid: texto(data.uid),
    documentoId: texto(data.documentoId),
    versao: typeof data.versao === 'number' ? data.versao : 1,
    nome: texto(data.nome),
    email: texto(data.email),
    texto: texto(data.texto),
    titulo: texto(data.titulo),
    aceitoEm: data.aceitoEm,
  }
}

function mapTentativa(id: string, data: DocumentData): Tentativa {
  return {
    id,
    uid: texto(data.uid),
    quizId: texto(data.quizId),
    trilhaId: texto(data.trilhaId),
    nota: typeof data.nota === 'number' ? data.nota : 0,
    aprovado: data.aprovado === true,
    respostas: Array.isArray(data.respostas) ? data.respostas.filter((item): item is number => typeof item === 'number') : [],
    respondidoEm: data.respondidoEm,
  }
}

function mapCertificado(id: string, data: DocumentData): Certificado {
  return {
    id,
    uid: texto(data.uid),
    trilhaId: texto(data.trilhaId),
    nome: texto(data.nome),
    trilhaTitulo: texto(data.trilhaTitulo),
    emitidoEm: data.emitidoEm,
    codigo: texto(data.codigo),
    tentativaId: texto(data.tentativaId),
  }
}

function mapAviso(id: string, data: DocumentData): Aviso {
  const tipo: TipoAviso = data.tipo === 'atualizado' || data.tipo === 'geral' ? data.tipo : 'novo'
  return {
    id,
    titulo: texto(data.titulo),
    mensagem: texto(data.mensagem),
    documentoId: texto(data.documentoId),
    tipo,
    ...audiencia(data, true),
    criadoEm: data.criadoEm,
  }
}

async function porUsuario<T>(nome: string, uid: string, mapear: (id: string, data: DocumentData) => T): Promise<T[]> {
  const snap = await getDocs(query(collection(requireDb(), nome), where('uid', '==', uid)))
  return snap.docs.map((item) => mapear(item.id, item.data()))
}

export async function carregarMeuProgresso(uid: string): Promise<{
  leituras: Leitura[]
  aceites: Aceite[]
  tentativas: Tentativa[]
  certificados: Certificado[]
  avisosLidos: AvisoLeitura[]
}> {
  const [leituras, aceites, tentativas, certificados, avisosLidos] = await Promise.all([
    porUsuario('leituras', uid, mapLeitura),
    porUsuario('aceites', uid, mapAceite),
    porUsuario('tentativas', uid, mapTentativa),
    porUsuario('certificados', uid, mapCertificado),
    porUsuario('avisosLeituras', uid, (id, data) => ({
      id,
      uid: texto(data.uid),
      avisoId: texto(data.avisoId),
      lidaEm: data.lidaEm,
    })),
  ])
  return { leituras, aceites, tentativas, certificados, avisosLidos }
}

export async function carregarRegistrosAdmin(): Promise<{
  leituras: Leitura[]
  aceites: Aceite[]
  tentativas: Tentativa[]
  certificados: Certificado[]
}> {
  const [leituras, aceites, tentativas, certificados] = await Promise.all([
    lerColecao('leituras', mapLeitura),
    lerColecao('aceites', mapAceite),
    lerColecao('tentativas', mapTentativa),
    lerColecao('certificados', mapCertificado),
  ])
  return { leituras, aceites, tentativas, certificados }
}

export async function carregarAvisos(usuario: Usuario): Promise<Aviso[]> {
  const banco = requireDb()
  if (usuario.papel === 'admin') return lerColecao('avisos', mapAviso)
  const [publicos, meus] = await Promise.all([
    getDocs(query(collection(banco, 'avisos'), where('publico', '==', true))),
    getDocs(query(collection(banco, 'avisos'), where('uids', 'array-contains', usuario.uid))),
  ])
  return mesclar([
    publicos.docs.map((item) => mapAviso(item.id, item.data())),
    meus.docs.map((item) => mapAviso(item.id, item.data())),
  ])
}

export async function marcarAvisoLido(uid: string, avisoId: string): Promise<void> {
  const ref = doc(requireDb(), 'avisosLeituras', idAvisoLeitura(uid, avisoId))
  const snap = await getDoc(ref)
  if (snap.exists()) return
  await setDoc(ref, { uid, avisoId, lidaEm: serverTimestamp() })
}

export async function enviarArquivo(arquivo: File): Promise<string> {
  const { firebaseApp } = await import('./firebase')
  const { storageHabilitado } = await import('../firebaseConfig')
  if (!storageHabilitado() || !firebaseApp) {
    throw new Error('O envio de arquivos está desligado. Cole um link do Google Drive.')
  }
  const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
  const storage = getStorage(firebaseApp)
  const nome = arquivo.name.replace(/[^\w.\-]+/g, '_')
  const snap = await uploadBytes(ref(storage, `anexos/${Date.now()}-${nome}`), arquivo)
  return getDownloadURL(snap.ref)
}
