import { BACKEND } from './backend'
import {
  listarMateriaisSb,
  salvarMaterialSb,
  listarCampanhasSb,
  salvarCampanhaSb,
  listarPedidosSb,
  criarPedidoSb,
  cancelarPedidoSb,
  responderPedidoSb,
  andamentoPedidoSb,
} from './marketingSupabase'
import { collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, type DocumentData } from 'firebase/firestore'
import { requireDb } from './firebase'
import { paraMillis } from './format'
import {
  STATUS_PEDIDO,
  TIPOS_CAMPANHA,
  TIPOS_MATERIAL,
  TIPOS_PECA,
  dataDoInput,
  mesclarMateriais,
  type CampanhaMkt,
  type MaterialForm,
  type MaterialMkt,
  type PedidoForm,
  type PedidoMkt,
  type StatusPedido,
  type TipoCampanha,
} from './marketing'
import type { Usuario } from '../types'

const texto = (v: unknown, padrao = '') => (typeof v === 'string' ? v : padrao)
const msOuNull = (v: unknown) => (v ? paraMillis(v) || null : null)
function umDe<T extends string>(lista: readonly T[], v: unknown, padrao: T): T {
  return lista.includes(v as T) ? (v as T) : padrao
}

export function mapMaterial(id: string, d: DocumentData): MaterialMkt {
  return {
    id,
    titulo: texto(d.titulo, 'Material'),
    descricao: texto(d.descricao),
    tipo: umDe(TIPOS_MATERIAL, d.tipo, 'outro'),
    categoria: texto(d.categoria),
    campanhaId: texto(d.campanhaId),
    url: texto(d.url),
    previaUrl: texto(d.previaUrl),
    formato: texto(d.formato),
    regrasUso: texto(d.regrasUso),
    validoDeMs: msOuNull(d.validoDe),
    validoAteMs: msOuNull(d.validoAte),
    publico: d.publico === true,
    unidades: Array.isArray(d.unidades) ? d.unidades.filter((u: unknown): u is string => typeof u === 'string') : [],
    ativo: d.ativo === true,
    geradoPorIA: d.geradoPorIA === true,
    iaModelo: texto(d.iaModelo),
    atualizadoPorNome: texto(d.atualizadoPorNome),
    atualizadoEmMs: paraMillis(d.atualizadoEm),
  }
}

export function mapCampanha(id: string, d: DocumentData): CampanhaMkt {
  return {
    id,
    titulo: texto(d.titulo, 'Campanha'),
    descricao: texto(d.descricao),
    tipo: umDe(TIPOS_CAMPANHA, d.tipo, 'campanha'),
    inicioMs: paraMillis(d.inicio),
    fimMs: paraMillis(d.fim),
    ativo: d.ativo === true,
    geradoPorIA: d.geradoPorIA === true,
    iaModelo: texto(d.iaModelo),
  }
}

export function mapPedido(id: string, d: DocumentData): PedidoMkt {
  return {
    id,
    uid: texto(d.uid),
    nome: texto(d.nome, 'Pessoa'),
    unidadeId: texto(d.unidadeId),
    unidadeNome: texto(d.unidadeNome),
    titulo: texto(d.titulo, 'Pedido'),
    tipoPeca: umDe(TIPOS_PECA, d.tipoPeca, 'outro'),
    descricao: texto(d.descricao),
    medidas: texto(d.medidas),
    prazoDesejadoMs: msOuNull(d.prazoDesejado),
    referenciaUrl: texto(d.referenciaUrl),
    campanhaId: texto(d.campanhaId),
    status: umDe(STATUS_PEDIDO, d.status, 'aberta'),
    complemento: texto(d.complemento),
    resposta: texto(d.resposta),
    entregaUrl: texto(d.entregaUrl),
    geradoPorIA: d.geradoPorIA === true,
    iaModelo: texto(d.iaModelo),
    responsavelNome: texto(d.responsavelNome),
    criadoEmMs: paraMillis(d.criadoEm),
    atualizadoEmMs: paraMillis(d.atualizadoEm),
    entregueEmMs: msOuNull(d.entregueEm),
  }
}

/** Franqueadora: tudo. Unidade: ativos da rede + ativos direcionados à própria unidade (duas consultas que as rules aceitam). */
export async function listarMateriais(usuario: Usuario, gestor: boolean): Promise<MaterialMkt[]> {
  if (BACKEND === 'supabase') return listarMateriaisSb(usuario, gestor)
  const base = collection(requireDb(), 'marketingMateriais')
  if (gestor) return (await getDocs(base)).docs.map((d) => mapMaterial(d.id, d.data()))
  const rede = getDocs(query(base, where('ativo', '==', true), where('publico', '==', true)))
  const daUnidade = usuario.unidadeId
    ? getDocs(query(base, where('ativo', '==', true), where('unidades', 'array-contains', usuario.unidadeId)))
    : Promise.resolve(null)
  const [a, b] = await Promise.all([rede, daUnidade])
  return mesclarMateriais(a.docs.map((d) => mapMaterial(d.id, d.data())), b ? b.docs.map((d) => mapMaterial(d.id, d.data())) : [])
}

export async function salvarMaterial(autor: Usuario, id: string | null, f: MaterialForm): Promise<string> {
  if (BACKEND === 'supabase') return salvarMaterialSb(id, f)
  const banco = requireDb()
  const ref = id ? doc(banco, 'marketingMateriais', id) : doc(collection(banco, 'marketingMateriais'))
  const dados = {
    titulo: f.titulo.trim().slice(0, 120),
    descricao: f.descricao.trim().slice(0, 1000),
    tipo: f.tipo,
    categoria: f.categoria.trim().slice(0, 60),
    campanhaId: f.campanhaId,
    url: f.url.trim(),
    previaUrl: f.previaUrl.trim(),
    formato: f.formato.trim().slice(0, 40),
    regrasUso: f.regrasUso.trim().slice(0, 1000),
    validoDe: dataDoInput(f.validoDe),
    validoAte: dataDoInput(f.validoAte),
    publico: f.publico,
    unidades: f.publico ? [] : f.unidades.slice(0, 30),
    ativo: f.ativo,
    geradoPorIA: f.geradoPorIA,
    iaModelo: f.geradoPorIA ? f.iaModelo.trim().slice(0, 80) : '',
    atualizadoPor: autor.uid,
    atualizadoPorNome: autor.nome,
    atualizadoEm: serverTimestamp(),
  }
  // Na edição o criadoEm fica intocado (a regra exige o mesmo valor); updateDoc preserva o campo.
  if (id) await updateDoc(ref, dados)
  else await setDoc(ref, { ...dados, criadoEm: serverTimestamp() })
  return ref.id
}

export async function listarCampanhas(gestor: boolean): Promise<CampanhaMkt[]> {
  if (BACKEND === 'supabase') return listarCampanhasSb(gestor)
  const base = collection(requireDb(), 'marketingCampanhas')
  const snap = await getDocs(gestor ? base : query(base, where('ativo', '==', true)))
  return snap.docs.map((d) => mapCampanha(d.id, d.data()))
}

export interface CampanhaForm {
  titulo: string
  descricao: string
  tipo: TipoCampanha
  inicio: string
  fim: string
  ativo: boolean
  geradoPorIA: boolean
  iaModelo: string
}

export async function salvarCampanha(autor: Usuario, id: string | null, f: CampanhaForm): Promise<string> {
  if (BACKEND === 'supabase') return salvarCampanhaSb(id, f)
  const banco = requireDb()
  const inicio = dataDoInput(f.inicio)
  const fim = dataDoInput(f.fim)
  if (!inicio || !fim) throw new Error('Informe o início e o fim da campanha.')
  if (fim < inicio) throw new Error('A campanha termina antes de começar.')
  if (f.geradoPorIA && f.iaModelo.trim().length < 2) throw new Error('Informe qual IA ou modelo participou.')
  const ref = id ? doc(banco, 'marketingCampanhas', id) : doc(collection(banco, 'marketingCampanhas'))
  await setDoc(ref, {
    titulo: f.titulo.trim().slice(0, 120),
    descricao: f.descricao.trim().slice(0, 1000),
    tipo: f.tipo,
    inicio,
    fim,
    ativo: f.ativo,
    geradoPorIA: f.geradoPorIA,
    iaModelo: f.geradoPorIA ? f.iaModelo.trim().slice(0, 80) : '',
    atualizadoPor: autor.uid,
    atualizadoPorNome: autor.nome,
    atualizadoEm: serverTimestamp(),
  })
  return ref.id
}

/** Franqueadora: todos. Franqueado: os da unidade. Equipe: os próprios. */
export async function listarPedidos(usuario: Usuario, gestor: boolean): Promise<PedidoMkt[]> {
  if (BACKEND === 'supabase') return listarPedidosSb(usuario, gestor)
  const base = collection(requireDb(), 'marketingSolicitacoes')
  let consulta
  if (gestor) consulta = base
  else if (usuario.papel === 'franqueado' && usuario.unidadeId) consulta = query(base, where('unidadeId', '==', usuario.unidadeId))
  else consulta = query(base, where('uid', '==', usuario.uid))
  const snap = await getDocs(consulta)
  return snap.docs.map((d) => mapPedido(d.id, d.data())).sort((a, b) => b.criadoEmMs - a.criadoEmMs)
}

export async function criarPedido(usuario: Usuario, f: PedidoForm): Promise<string> {
  if (BACKEND === 'supabase') return criarPedidoSb(f)
  const ref = doc(collection(requireDb(), 'marketingSolicitacoes'))
  await setDoc(ref, {
    uid: usuario.uid,
    nome: usuario.nome,
    unidadeId: usuario.unidadeId ?? '',
    unidadeNome: usuario.unidade ?? '',
    titulo: f.titulo.trim().slice(0, 120),
    tipoPeca: f.tipoPeca,
    descricao: f.descricao.trim().slice(0, 2000),
    medidas: f.medidas.trim().slice(0, 120),
    prazoDesejado: dataDoInput(f.prazoDesejado),
    referenciaUrl: f.referenciaUrl.trim(),
    campanhaId: f.campanhaId,
    status: 'aberta',
    complemento: '',
    resposta: '',
    entregaUrl: '',
    geradoPorIA: false,
    iaModelo: '',
    responsavelNome: '',
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    entregueEm: null,
  })
  return ref.id
}

export async function cancelarPedido(id: string): Promise<void> {
  if (BACKEND === 'supabase') return cancelarPedidoSb(id)
  await updateDoc(doc(requireDb(), 'marketingSolicitacoes', id), { status: 'cancelada', atualizadoEm: serverTimestamp() })
}

export async function responderPedido(id: string, complemento: string): Promise<void> {
  if (BACKEND === 'supabase') return responderPedidoSb(id, complemento)
  await updateDoc(doc(requireDb(), 'marketingSolicitacoes', id), {
    status: 'aberta',
    complemento: complemento.trim().slice(0, 2000),
    atualizadoEm: serverTimestamp(),
  })
}

export interface AndamentoPedido {
  status: StatusPedido
  resposta: string
  entregaUrl: string
  geradoPorIA: boolean
  iaModelo: string
}

export async function andamentoPedido(autor: Usuario, id: string, a: AndamentoPedido): Promise<void> {
  if (BACKEND === 'supabase') return andamentoPedidoSb(id, a)
  const entregue = a.status === 'entregue'
  await updateDoc(doc(requireDb(), 'marketingSolicitacoes', id), {
    status: a.status,
    resposta: a.resposta.trim().slice(0, 2000),
    entregaUrl: entregue ? a.entregaUrl.trim() : '',
    geradoPorIA: entregue && a.geradoPorIA,
    iaModelo: entregue && a.geradoPorIA ? a.iaModelo.trim().slice(0, 80) : '',
    responsavelNome: autor.nome,
    atualizadoEm: serverTimestamp(),
    entregueEm: entregue ? serverTimestamp() : null,
  })
}
