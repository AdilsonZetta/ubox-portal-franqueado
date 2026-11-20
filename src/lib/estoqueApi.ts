import { BACKEND } from './backend'
import {
  carregarEstoqueSb,
  salvarItemSb,
  registrarMovimentoSb,
  salvarContagemSb,
  confirmarContagemSb,
  cancelarContagemSb,
  criarPedidoSb,
  cancelarPedidoUnidadeSb,
  receberPedidoSb,
  aprovarPedidoSb,
  enviarPedidoSb,
  cancelarPedidoRedeSb,
} from './estoqueSupabase'
import {
  collection,
  doc,
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
import { paraMillis } from './format'
import {
  CATEGORIAS,
  ORIGENS,
  STATUS_CONTAGEM,
  STATUS_PEDIDO,
  TIPOS_MOV,
  UNIDADES_MEDIDA,
  centavosDe,
  deltaDe,
  divergencias,
  recalcularContagem,
  type Contagem,
  type ItemEstoque,
  type ItemForm,
  type LinhaContagem,
  type LinhaPedido,
  type Movimento,
  type Pedido,
  type TipoManual,
} from './estoque'
import type { Usuario } from '../types'

const texto = (v: unknown, padrao = '') => (typeof v === 'string' ? v : padrao)
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
function umDe<T extends string>(lista: readonly T[], v: unknown, padrao: T): T {
  return lista.includes(v as T) ? (v as T) : padrao
}
const objeto = (v: unknown) => (v && typeof v === 'object' ? v : {}) as Record<string, unknown>

export function mapItem(id: string, d: DocumentData): ItemEstoque {
  return {
    id,
    nome: texto(d.nome, 'Item'),
    codigo: texto(d.codigo),
    categoria: umDe(CATEGORIAS, d.categoria, 'outro'),
    unidadeMedida: umDe(UNIDADES_MEDIDA, d.unidadeMedida, 'un'),
    estoqueMinimo: numero(d.estoqueMinimo),
    precoSugeridoCentavos: numero(d.precoSugeridoCentavos),
    descricao: texto(d.descricao),
    ativo: d.ativo === true,
    geradoPorIA: d.geradoPorIA === true,
    iaModelo: texto(d.iaModelo),
    atualizadoPorNome: texto(d.atualizadoPorNome),
    atualizadoEmMs: paraMillis(d.atualizadoEm),
  }
}

export function mapMovimento(id: string, d: DocumentData): Movimento {
  return {
    id,
    unidadeId: texto(d.unidadeId),
    unidadeNome: texto(d.unidadeNome),
    itemId: texto(d.itemId),
    itemNome: texto(d.itemNome, 'Item'),
    unidadeMedida: texto(d.unidadeMedida, 'un'),
    tipo: umDe(TIPOS_MOV, d.tipo, 'ajuste'),
    quantidade: numero(d.quantidade),
    delta: numero(d.delta),
    motivo: texto(d.motivo),
    origem: umDe(ORIGENS, d.origem, 'manual'),
    origemId: texto(d.origemId),
    indice: numero(d.indice),
    uid: texto(d.uid),
    nome: texto(d.nome),
    criadoEmMs: paraMillis(d.criadoEm),
  }
}

function mapLinhaContagem(v: unknown): LinhaContagem {
  const d = objeto(v)
  return { itemId: texto(d.itemId), itemNome: texto(d.itemNome), unidadeMedida: texto(d.unidadeMedida, 'un'), sistema: numero(d.sistema), contado: numero(d.contado), diferenca: numero(d.diferenca) }
}

export function mapContagem(id: string, d: DocumentData): Contagem {
  return {
    id,
    unidadeId: texto(d.unidadeId),
    unidadeNome: texto(d.unidadeNome),
    itens: Array.isArray(d.itens) ? d.itens.map(mapLinhaContagem) : [],
    totalDivergencias: numero(d.totalDivergencias),
    obs: texto(d.obs),
    status: umDe(STATUS_CONTAGEM, d.status, 'aberta'),
    criadoPorNome: texto(d.criadoPorNome),
    criadoEmMs: paraMillis(d.criadoEm),
    confirmadoNome: texto(d.confirmadoNome),
    confirmadoEmMs: paraMillis(d.confirmadoEm),
    atualizadoPorNome: texto(d.atualizadoPorNome),
    atualizadoEmMs: paraMillis(d.atualizadoEm),
  }
}

function mapLinhaPedido(v: unknown): LinhaPedido {
  const d = objeto(v)
  return { itemId: texto(d.itemId), itemNome: texto(d.itemNome), unidadeMedida: texto(d.unidadeMedida, 'un'), quantidade: numero(d.quantidade), quantidadeEnviada: numero(d.quantidadeEnviada) }
}

export function mapPedido(id: string, d: DocumentData): Pedido {
  return {
    id,
    unidadeId: texto(d.unidadeId),
    unidadeNome: texto(d.unidadeNome),
    itens: Array.isArray(d.itens) ? d.itens.map(mapLinhaPedido) : [],
    status: umDe(STATUS_PEDIDO, d.status, 'aberto'),
    obsUnidade: texto(d.obsUnidade),
    obsFranqueadora: texto(d.obsFranqueadora),
    solicitanteNome: texto(d.solicitanteNome),
    criadoEmMs: paraMillis(d.criadoEm),
    aprovadoEmMs: paraMillis(d.aprovadoEm),
    enviadoEmMs: paraMillis(d.enviadoEm),
    recebidoEmMs: paraMillis(d.recebidoEm),
    canceladoEmMs: paraMillis(d.canceladoEm),
    atualizadoPorNome: texto(d.atualizadoPorNome),
    atualizadoEmMs: paraMillis(d.atualizadoEm),
  }
}

export interface DadosEstoque {
  itens: ItemEstoque[]
  movimentos: Movimento[]
  contagens: Contagem[]
  pedidos: Pedido[]
}

/** Gestor sem unidade: a rede toda. Unidade (ou gestor filtrando): só a unidade, sempre com o filtro que as rules exigem. */
export async function carregarEstoque(unidadeId: string | null): Promise<DadosEstoque> {
  if (BACKEND === 'supabase') return carregarEstoqueSb(unidadeId)
  const banco = requireDb()
  const daUnidade = (nome: string) => (unidadeId ? query(collection(banco, nome), where('unidadeId', '==', unidadeId)) : collection(banco, nome))
  const [i, m, c, p] = await Promise.all([
    getDocs(collection(banco, 'estoqueItens')),
    getDocs(daUnidade('estoqueMovimentos')),
    getDocs(daUnidade('estoqueContagens')),
    getDocs(daUnidade('estoquePedidos')),
  ])
  return {
    itens: i.docs.map((d) => mapItem(d.id, d.data())).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    movimentos: m.docs.map((d) => mapMovimento(d.id, d.data())).sort((a, b) => b.criadoEmMs - a.criadoEmMs),
    contagens: c.docs.map((d) => mapContagem(d.id, d.data())).sort((a, b) => b.criadoEmMs - a.criadoEmMs),
    pedidos: p.docs.map((d) => mapPedido(d.id, d.data())).sort((a, b) => b.criadoEmMs - a.criadoEmMs),
  }
}

const autoria = (autor: Usuario) => ({ atualizadoPor: autor.uid, atualizadoPorNome: autor.nome, atualizadoEm: serverTimestamp() })

export async function salvarItem(autor: Usuario, existente: ItemEstoque | null, f: ItemForm): Promise<string> {
  if (BACKEND === 'supabase') return salvarItemSb(existente, f)
  const banco = requireDb()
  const ref = existente ? doc(banco, 'estoqueItens', existente.id) : doc(collection(banco, 'estoqueItens'))
  const dados = {
    nome: f.nome.trim().slice(0, 120),
    codigo: f.codigo.trim().slice(0, 40),
    categoria: f.categoria,
    unidadeMedida: f.unidadeMedida,
    estoqueMinimo: Math.trunc(f.estoqueMinimo),
    precoSugeridoCentavos: centavosDe(f.preco) ?? 0,
    descricao: f.descricao.trim().slice(0, 500),
    ativo: f.ativo,
    geradoPorIA: f.geradoPorIA,
    iaModelo: f.geradoPorIA ? f.iaModelo.trim().slice(0, 80) : '',
    ...autoria(autor),
  }
  if (existente) await updateDoc(ref, dados)
  else await setDoc(ref, { ...dados, criadoEm: serverTimestamp() })
  return ref.id
}

function baseMovimento(autor: Usuario, item: Pick<ItemEstoque, 'id' | 'nome' | 'unidadeMedida'> | Pick<LinhaPedido, 'itemId' | 'itemNome' | 'unidadeMedida'>) {
  const id = 'id' in item ? item.id : item.itemId
  const nome = 'nome' in item ? item.nome : item.itemNome
  return {
    unidadeId: autor.unidadeId ?? '',
    unidadeNome: autor.unidade ?? '',
    itemId: id,
    itemNome: nome,
    unidadeMedida: item.unidadeMedida,
    uid: autor.uid,
    nome: autor.nome,
    criadoEm: serverTimestamp(),
  }
}

export async function registrarMovimento(autor: Usuario, item: ItemEstoque, tipo: TipoManual, quantidade: number, motivo: string): Promise<void> {
  if (BACKEND === 'supabase') return registrarMovimentoSb(item, tipo, quantidade, motivo)
  const ref = doc(collection(requireDb(), 'estoqueMovimentos'))
  await setDoc(ref, {
    ...baseMovimento(autor, item),
    tipo,
    quantidade,
    delta: deltaDe(tipo, quantidade),
    motivo: motivo.trim().slice(0, 300),
    origem: 'manual',
    origemId: '',
    indice: 0,
  })
}

export async function salvarContagem(autor: Usuario, existente: Contagem | null, linhas: LinhaContagem[], obs: string): Promise<string> {
  if (BACKEND === 'supabase') return salvarContagemSb(autor, existente, linhas, obs)
  const banco = requireDb()
  const dados = {
    itens: linhas,
    totalItens: linhas.length,
    totalDivergencias: divergencias(linhas),
    obs: obs.trim().slice(0, 1000),
    ...autoria(autor),
  }
  if (existente) {
    await updateDoc(doc(banco, 'estoqueContagens', existente.id), dados)
    return existente.id
  }
  const ref = doc(collection(banco, 'estoqueContagens'))
  await setDoc(ref, {
    ...dados,
    unidadeId: autor.unidadeId ?? '',
    unidadeNome: autor.unidade ?? '',
    status: 'aberta',
    criadoPor: autor.uid,
    criadoPorNome: autor.nome,
    criadoEm: serverTimestamp(),
    confirmadoPor: '',
    confirmadoNome: '',
    confirmadoEm: null,
  })
  return ref.id
}

/** Confirma a contagem e grava um ajuste por linha divergente, tudo no mesmo lote (id = contagem_indice). */
export async function confirmarContagem(autor: Usuario, contagem: Contagem, saldoAtual: Map<string, number>, obs: string): Promise<number> {
  if (BACKEND === 'supabase') return confirmarContagemSb(contagem, saldoAtual, obs)
  const banco = requireDb()
  const linhas = recalcularContagem(contagem.itens, saldoAtual)
  const lote = writeBatch(banco)
  lote.update(doc(banco, 'estoqueContagens', contagem.id), {
    itens: linhas,
    totalItens: linhas.length,
    totalDivergencias: divergencias(linhas),
    obs: obs.trim().slice(0, 1000),
    status: 'confirmada',
    confirmadoPor: autor.uid,
    confirmadoNome: autor.nome,
    confirmadoEm: serverTimestamp(),
    ...autoria(autor),
  })
  let ajustes = 0
  linhas.forEach((l, indice) => {
    if (l.diferenca === 0) return
    ajustes += 1
    lote.set(doc(banco, 'estoqueMovimentos', `${contagem.id}_${indice}`), {
      ...baseMovimento(autor, l),
      tipo: 'ajuste',
      quantidade: Math.abs(l.diferenca),
      delta: l.diferenca,
      motivo: `Contagem de ${new Date(contagem.criadoEmMs || Date.now()).toLocaleDateString('pt-BR')}: sistema ${l.sistema}, contado ${l.contado}`.slice(0, 300),
      origem: 'contagem',
      origemId: contagem.id,
      indice,
    })
  })
  await lote.commit()
  return ajustes
}

export async function cancelarContagem(autor: Usuario, contagem: Contagem): Promise<void> {
  if (BACKEND === 'supabase') return cancelarContagemSb(contagem)
  await updateDoc(doc(requireDb(), 'estoqueContagens', contagem.id), { status: 'cancelada', ...autoria(autor) })
}

export async function criarPedido(autor: Usuario, linhas: LinhaPedido[], obs: string): Promise<string> {
  if (BACKEND === 'supabase') return criarPedidoSb(autor, linhas, obs)
  const ref = doc(collection(requireDb(), 'estoquePedidos'))
  const itens = linhas.map((l) => ({ ...l, quantidadeEnviada: 0 }))
  await setDoc(ref, {
    unidadeId: autor.unidadeId ?? '',
    unidadeNome: autor.unidade ?? '',
    itens,
    totalItens: itens.length,
    status: 'aberto',
    obsUnidade: obs.trim().slice(0, 1000),
    obsFranqueadora: '',
    solicitanteUid: autor.uid,
    solicitanteNome: autor.nome,
    criadoEm: serverTimestamp(),
    aprovadoEm: null,
    enviadoEm: null,
    recebidoEm: null,
    canceladoEm: null,
    ...autoria(autor),
  })
  return ref.id
}

export async function cancelarPedidoUnidade(autor: Usuario, pedido: Pedido, obs: string): Promise<void> {
  if (BACKEND === 'supabase') return cancelarPedidoUnidadeSb(pedido, obs)
  await updateDoc(doc(requireDb(), 'estoquePedidos', pedido.id), { status: 'cancelado', canceladoEm: serverTimestamp(), obsUnidade: obs.trim().slice(0, 1000), ...autoria(autor) })
}

/** Recebimento: o pedido vira "recebido" e cada item enviado vira uma entrada (id = pedido_indice), no mesmo lote. */
export async function receberPedido(autor: Usuario, pedido: Pedido, obs: string): Promise<number> {
  if (BACKEND === 'supabase') return receberPedidoSb(pedido, obs)
  const banco = requireDb()
  const lote = writeBatch(banco)
  lote.update(doc(banco, 'estoquePedidos', pedido.id), { status: 'recebido', recebidoEm: serverTimestamp(), obsUnidade: obs.trim().slice(0, 1000), ...autoria(autor) })
  let entradas = 0
  pedido.itens.forEach((l, indice) => {
    if (l.quantidadeEnviada <= 0) return
    entradas += 1
    lote.set(doc(banco, 'estoqueMovimentos', `${pedido.id}_${indice}`), {
      ...baseMovimento(autor, l),
      tipo: 'entrada',
      quantidade: l.quantidadeEnviada,
      delta: l.quantidadeEnviada,
      motivo: 'Recebimento do pedido de reposição',
      origem: 'pedido',
      origemId: pedido.id,
      indice,
    })
  })
  await lote.commit()
  return entradas
}

export async function aprovarPedido(autor: Usuario, pedido: Pedido, obs: string): Promise<void> {
  if (BACKEND === 'supabase') return aprovarPedidoSb(pedido, obs)
  await updateDoc(doc(requireDb(), 'estoquePedidos', pedido.id), { status: 'aprovado', aprovadoEm: serverTimestamp(), obsFranqueadora: obs.trim().slice(0, 1000), ...autoria(autor) })
}

export async function enviarPedido(autor: Usuario, pedido: Pedido, enviadas: number[], obs: string): Promise<void> {
  if (BACKEND === 'supabase') return enviarPedidoSb(pedido, enviadas, obs)
  const itens = pedido.itens.map((l, i) => ({ ...l, quantidadeEnviada: Math.max(0, Math.min(100_000, Math.trunc(enviadas[i] ?? l.quantidade))) }))
  await updateDoc(doc(requireDb(), 'estoquePedidos', pedido.id), { status: 'enviado', enviadoEm: serverTimestamp(), itens, obsFranqueadora: obs.trim().slice(0, 1000), ...autoria(autor) })
}

export async function cancelarPedidoRede(autor: Usuario, pedido: Pedido, obs: string): Promise<void> {
  if (BACKEND === 'supabase') return cancelarPedidoRedeSb(pedido, obs)
  await updateDoc(doc(requireDb(), 'estoquePedidos', pedido.id), { status: 'cancelado', canceladoEm: serverTimestamp(), obsFranqueadora: obs.trim().slice(0, 1000), ...autoria(autor) })
}
