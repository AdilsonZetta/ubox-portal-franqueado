import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, type DocumentData } from 'firebase/firestore'
import { requireDb } from './firebase'
import { paraMillis } from './format'
import { juntarLinks, normalizarTags, tagsDoCampo, tagsParaCampo, type LinkForm, type LinkNuvem, type Visibilidade } from './nuvem'
import type { Usuario } from '../types'

const texto = (v: unknown) => (typeof v === 'string' ? v : '')
const VIS: Visibilidade[] = ['rede', 'unidades', 'franqueadora', 'privada']

export function mapLink(id: string, d: DocumentData): LinkNuvem {
  return {
    id,
    titulo: texto(d.titulo),
    descricao: texto(d.descricao),
    url: texto(d.url),
    pasta: texto(d.pasta) || 'Sem pasta',
    tags: tagsDoCampo(texto(d.tags)),
    visibilidade: VIS.includes(d.visibilidade) ? d.visibilidade : 'privada',
    unidades: Array.isArray(d.unidades) ? d.unidades.filter((u: unknown): u is string => typeof u === 'string') : [],
    dono: texto(d.dono),
    geradoPorIA: d.geradoPorIA === true,
    iaModelo: texto(d.iaModelo),
    criadoPorNome: texto(d.criadoPorNome),
    criadoEmMs: paraMillis(d.criadoEm),
    atualizadoPorNome: texto(d.atualizadoPorNome),
    atualizadoEmMs: paraMillis(d.atualizadoEm),
  }
}

const col = () => collection(requireDb(), 'nuvemLinks')
const ler = async (q: ReturnType<typeof query>) => (await getDocs(q)).docs.map((s) => mapLink(s.id, s.data() as DocumentData))

/** Franqueadora: tudo o que ela publicou (rede, unidades escolhidas e a pasta só dela). Nunca a área privada das unidades. */
export async function carregarLinksRede(): Promise<LinkNuvem[]> {
  return ler(query(col(), where('dono', '==', '')))
}

/** Unidade: links da rede toda, os compartilhados com ela e a própria área privada (três consultas, cada uma permitida pelas regras). */
export async function carregarLinksUnidade(unidadeId: string): Promise<LinkNuvem[]> {
  const [rede, minhas, privada] = await Promise.all([
    ler(query(col(), where('dono', '==', ''), where('visibilidade', '==', 'rede'))),
    ler(query(col(), where('dono', '==', ''), where('unidades', 'array-contains', unidadeId))),
    ler(query(col(), where('dono', '==', unidadeId))),
  ])
  return juntarLinks(rede, minhas, privada)
}

function campos(f: LinkForm) {
  const ia = f.geradoPorIA
  return {
    titulo: f.titulo.trim().slice(0, 120),
    descricao: f.descricao.trim().slice(0, 1000),
    url: f.url.trim(),
    pasta: f.pasta.trim().slice(0, 60),
    tags: tagsParaCampo(normalizarTags(f.tags)),
    visibilidade: f.visibilidade,
    unidades: f.visibilidade === 'unidades' ? [...new Set(f.unidades)].slice(0, 50) : [],
    geradoPorIA: ia,
    iaModelo: ia ? f.iaModelo.trim().slice(0, 80) : '',
  }
}

const autoria = (autor: Usuario) => ({ atualizadoPor: autor.uid, atualizadoPorNome: autor.nome, atualizadoEm: serverTimestamp() })

export async function criarLink(autor: Usuario, papel: 'rede' | 'unidade', f: LinkForm): Promise<string> {
  const ref = doc(col())
  await setDoc(ref, {
    ...campos(f),
    dono: papel === 'rede' ? '' : autor.unidadeId ?? '',
    criadoPor: autor.uid, criadoPorNome: autor.nome, criadoEm: serverTimestamp(),
    ...autoria(autor),
  })
  return ref.id
}

export async function salvarLink(autor: Usuario, id: string, f: LinkForm): Promise<void> {
  await updateDoc(doc(col(), id), { ...campos(f), ...autoria(autor) })
}

/** Remove só o registro do portal; o arquivo no Drive não é tocado. */
export async function removerLink(id: string): Promise<void> {
  await deleteDoc(doc(col(), id))
}
