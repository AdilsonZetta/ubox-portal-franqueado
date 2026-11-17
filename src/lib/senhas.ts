/**
 * Módulo 3 — Central de Acessos e Senhas
 *
 * NOTA DE SEGURANÇA (Plano Spark):
 * O projeto opera no plano Spark do Firebase, sem Cloud Functions para criptografia gerenciada.
 * As senhas e dados sensíveis ficam protegidos no Cloud Firestore estritamente por regras de
 * segurança (firestore.rules), com separação de metadados na coleção pai `acessos` e o segredo
 * na subcoleção `acessos/{id}/segredo/atual`.
 *
 * Apenas usuários autorizados (franqueado da respectiva unidade ou equipe autorizada via visivelPara/visivelParaEquipe;
 * ou equipe da franqueadora/admin para itens de rede) possuem permissão de leitura/gravação do segredo.
 * A interface mascara senhas por padrão e exige ação explícita de clique para revelar ou copiar,
 * registrando obrigatoriamente um evento de auditoria (`revelou` / `copiou`) na subcoleção `eventos`.
 */

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
  CATEGORIAS_ACESSO,
  ESCOPOS_ACESSO,
  MAX_VISIVEL_PARA,
  STATUS_SOLICITACAO,
  TEXTO_EVENTO_ACESSO,
  TIPOS_EVENTO_ACESSO,
  TIPOS_SOLICITACAO,
  type CategoriaAcesso,
  type EscopoAcesso,
  type StatusSolicitacaoAcesso,
  type TipoEventoAcesso,
  type TipoSolicitacaoAcesso,
} from '../data/senhas'
import type { Usuario } from '../types'
import { requireDb } from './firebase'
import { paraMillis } from './format'

export interface Acesso {
  id: string
  nome: string
  categoria: CategoriaAcesso
  url: string
  escopo: EscopoAcesso
  unidadeId: string
  unidadeNome: string
  responsavelId: string | null
  responsavelNome: string
  visivelPara: string[]
  visivelParaEquipe: boolean
  ultimaTrocaEm?: Timestamp
  pendenteTroca: boolean
  criadoPor: string
  criadoPorNome: string
  criadoEm?: Timestamp
  atualizadoEm?: Timestamp
}

export interface SegredoAcesso {
  login: string
  senha: string
  notas: string
  atualizadoEm?: Timestamp
  atualizadoPor: string
}

export interface EventoAcesso {
  id: string
  tipo: TipoEventoAcesso
  texto: string
  autorId: string
  autorNome: string
  criadoEm?: Timestamp
}

export interface SolicitacaoAcesso {
  id: string
  tipo: TipoSolicitacaoAcesso
  status: StatusSolicitacaoAcesso
  acessoId: string
  acessoNome: string
  unidadeId: string
  unidadeNome: string
  solicitadoPor: string
  solicitadoPorNome: string
  motivo: string
  alvoUid: string
  alvoNome: string
  decididoPor: string | null
  decididoPorNome: string | null
  criadoEm?: Timestamp
  atualizadoEm?: Timestamp
}

const categorias = new Set<string>(CATEGORIAS_ACESSO.map((item) => item.id))
const escopos = new Set<string>(ESCOPOS_ACESSO.map((item) => item.id))
const tiposSolicitacao = new Set<string>(TIPOS_SOLICITACAO.map((item) => item.id))
const statusesSolicitacao = new Set<string>(STATUS_SOLICITACAO.map((item) => item.id))
const tiposEvento = new Set<string>(TIPOS_EVENTO_ACESSO.map((item) => item.id))

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

export function mapAcesso(id: string, data: Record<string, unknown>): Acesso | null {
  const categoria = texto(data.categoria)
  const escopo = texto(data.escopo)
  if (!categorias.has(categoria) || !escopos.has(escopo)) return null

  const visivelPara = Array.isArray(data.visivelPara)
    ? data.visivelPara
        .filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 128)
        .slice(0, MAX_VISIVEL_PARA)
    : []

  return {
    id,
    nome: texto(data.nome),
    categoria: categoria as CategoriaAcesso,
    url: texto(data.url),
    escopo: escopo as EscopoAcesso,
    unidadeId: texto(data.unidadeId),
    unidadeNome: texto(data.unidadeNome),
    responsavelId: typeof data.responsavelId === 'string' && data.responsavelId.length > 0 ? data.responsavelId : null,
    responsavelNome: texto(data.responsavelNome) || 'Equipe da unidade',
    visivelPara,
    visivelParaEquipe: data.visivelParaEquipe === true,
    ultimaTrocaEm: data.ultimaTrocaEm as Timestamp | undefined,
    pendenteTroca: data.pendenteTroca === true,
    criadoPor: texto(data.criadoPor),
    criadoPorNome: texto(data.criadoPorNome),
    criadoEm: data.criadoEm as Timestamp | undefined,
    atualizadoEm: data.atualizadoEm as Timestamp | undefined,
  }
}

export function mapSegredo(data: Record<string, unknown>): SegredoAcesso | null {
  if (typeof data.senha !== 'string') return null
  return {
    login: texto(data.login),
    senha: data.senha,
    notas: texto(data.notas),
    atualizadoEm: data.atualizadoEm as Timestamp | undefined,
    atualizadoPor: texto(data.atualizadoPor),
  }
}

export function mapEventoAcesso(id: string, data: Record<string, unknown>): EventoAcesso | null {
  const tipo = texto(data.tipo)
  if (!tiposEvento.has(tipo)) return null
  return {
    id,
    tipo: tipo as TipoEventoAcesso,
    texto: texto(data.texto),
    autorId: texto(data.autorId),
    autorNome: texto(data.autorNome),
    criadoEm: data.criadoEm as Timestamp | undefined,
  }
}

export function mapSolicitacaoAcesso(id: string, data: Record<string, unknown>): SolicitacaoAcesso | null {
  const tipo = texto(data.tipo)
  const status = texto(data.status)
  if (!tiposSolicitacao.has(tipo) || !statusesSolicitacao.has(status)) return null

  return {
    id,
    tipo: tipo as TipoSolicitacaoAcesso,
    status: status as StatusSolicitacaoAcesso,
    acessoId: texto(data.acessoId),
    acessoNome: texto(data.acessoNome),
    unidadeId: texto(data.unidadeId),
    unidadeNome: texto(data.unidadeNome),
    solicitadoPor: texto(data.solicitadoPor),
    solicitadoPorNome: texto(data.solicitadoPorNome),
    motivo: texto(data.motivo),
    alvoUid: texto(data.alvoUid),
    alvoNome: texto(data.alvoNome),
    decididoPor: typeof data.decididoPor === 'string' && data.decididoPor.length > 0 ? data.decididoPor : null,
    decididoPorNome: typeof data.decididoPorNome === 'string' && data.decididoPorNome.length > 0 ? data.decididoPorNome : null,
    criadoEm: data.criadoEm as Timestamp | undefined,
    atualizadoEm: data.atualizadoEm as Timestamp | undefined,
  }
}

export function observarAcessos(
  filtro: { rede: boolean; unidadeId?: string | null },
  aoMudar: (acessos: Acesso[]) => void,
  aoErro: (erro: unknown) => void,
): () => void {
  const banco = requireDb()
  const base = collection(banco, 'acessos')

  if (filtro.rede) {
    // Visão franqueadora: lista da rede
    const qRede = base
    return onSnapshot(
      qRede,
      (snap) => {
        const lista = snap.docs.map((d) => mapAcesso(d.id, d.data())).filter((item): item is Acesso => item !== null)
        lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        aoMudar(lista)
      },
      aoErro,
    )
  }

  if (!filtro.unidadeId) {
    aoMudar([])
    return () => undefined
  }

  // Visão unidade: ouve acessos da unidade do franqueado
  const qUnidade = query(base, where('unidadeId', '==', filtro.unidadeId))
  const qRede = query(base, where('escopo', '==', 'rede'))

  let itensUnidade: Acesso[] = []
  let itensRede: Acesso[] = []

  function emitir() {
    const unicos = new Map<string, Acesso>()
    for (const item of [...itensUnidade, ...itensRede]) {
      unicos.set(item.id, item)
    }
    const combinado = Array.from(unicos.values())
    combinado.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    aoMudar(combinado)
  }

  const unsubUnidade = onSnapshot(
    qUnidade,
    (snap) => {
      itensUnidade = snap.docs.map((d) => mapAcesso(d.id, d.data())).filter((item): item is Acesso => item !== null)
      emitir()
    },
    aoErro,
  )

  const unsubRede = onSnapshot(
    qRede,
    (snap) => {
      itensRede = snap.docs.map((d) => mapAcesso(d.id, d.data())).filter((item): item is Acesso => item !== null)
      emitir()
    },
    (falha) => {
      // Se não tiver permissão para itens de rede, mantém os da unidade
      console.warn('Não foi possível carregar acessos da rede:', falha)
    },
  )

  return () => {
    unsubUnidade()
    unsubRede()
  }
}

export async function buscarSegredo(acessoId: string): Promise<SegredoAcesso> {
  const banco = requireDb()
  const snap = await getDoc(doc(banco, 'acessos', acessoId, 'segredo', 'atual'))
  if (!snap.exists()) {
    throw new Error('Segredo não encontrado ou você não tem permissão para visualizá-lo.')
  }
  const segredo = mapSegredo(snap.data())
  if (!segredo) {
    throw new Error('Dados do segredo corrompidos ou inválidos.')
  }
  return segredo
}

export function observarEventosAcesso(
  acessoId: string,
  aoMudar: (eventos: EventoAcesso[]) => void,
  aoErro: (erro: unknown) => void,
): () => void {
  const banco = requireDb()
  const q = query(collection(banco, 'acessos', acessoId, 'eventos'), orderBy('criadoEm', 'desc'))
  return onSnapshot(
    q,
    (snap) => {
      const lista = snap.docs.map((d) => mapEventoAcesso(d.id, d.data())).filter((item): item is EventoAcesso => item !== null)
      aoMudar(lista)
    },
    aoErro,
  )
}

export async function gravarEventoAcesso(
  acessoId: string,
  autor: Usuario,
  tipo: TipoEventoAcesso,
  _textoLegado?: string,
): Promise<void> {
  const banco = requireDb()
  const ref = doc(collection(banco, 'acessos', acessoId, 'eventos'))
  await setDoc(ref, {
    tipo,
    texto: TEXTO_EVENTO_ACESSO[tipo],
    autorId: autor.uid,
    autorNome: autor.nome,
    criadoEm: serverTimestamp(),
  })
}

export interface NovoAcessoDados {
  nome: string
  categoria: CategoriaAcesso
  url: string
  escopo: EscopoAcesso
  unidadeId: string
  unidadeNome: string
  responsavelId: string | null
  responsavelNome: string
  visivelPara: string[]
  visivelParaEquipe: boolean
  login: string
  senha: string
  notas?: string
}

export async function criarAcesso(autor: Usuario, dados: NovoAcessoDados): Promise<string> {
  const banco = requireDb()
  const acessoRef = doc(collection(banco, 'acessos'))

  const unidadeId = dados.escopo === 'unidade' ? dados.unidadeId.trim() : ''
  const unidadeNome = dados.escopo === 'unidade' ? dados.unidadeNome.trim() : ''

  if (dados.escopo === 'unidade') {
    if (!unidadeId) throw new Error('Unidade é obrigatória para acessos da unidade.')
    const unidadeSnap = await getDoc(doc(banco, 'unidades', unidadeId))
    if (!unidadeSnap.exists()) throw new Error('Unidade não encontrada.')
  }

  const agora = serverTimestamp()
  const batch = writeBatch(banco)

  // 1. Grava metadados do acesso
  batch.set(acessoRef, {
    nome: dados.nome.trim(),
    categoria: dados.categoria,
    url: dados.url.trim(),
    escopo: dados.escopo,
    unidadeId,
    unidadeNome,
    responsavelId: dados.responsavelId || null,
    responsavelNome: dados.responsavelNome.trim() || 'Equipe da unidade',
    visivelPara: dados.escopo === 'rede' ? [] : dados.visivelPara.slice(0, MAX_VISIVEL_PARA),
    visivelParaEquipe: dados.escopo === 'rede' ? false : dados.visivelParaEquipe,
    ultimaTrocaEm: agora,
    pendenteTroca: false,
    criadoPor: autor.uid,
    criadoPorNome: autor.nome,
    criadoEm: agora,
    atualizadoEm: agora,
  })

  // 2. Grava segredo na subcoleção atual
  const segredoRef = doc(banco, 'acessos', acessoRef.id, 'segredo', 'atual')
  batch.set(segredoRef, {
    login: dados.login.trim(),
    senha: dados.senha,
    notas: (dados.notas ?? '').trim(),
    atualizadoEm: agora,
    atualizadoPor: autor.uid,
  })

  // 3. Grava evento de criação com frase oficial
  const eventoRef = doc(collection(banco, 'acessos', acessoRef.id, 'eventos'))
  batch.set(eventoRef, {
    tipo: 'criacao',
    texto: TEXTO_EVENTO_ACESSO.criacao,
    autorId: autor.uid,
    autorNome: autor.nome,
    criadoEm: agora,
  })

  await batch.commit()
  return acessoRef.id
}

export async function atualizarMetadadosAcesso(
  autor: Usuario,
  acesso: Acesso,
  patch: {
    nome?: string
    categoria?: CategoriaAcesso
    url?: string
    responsavelId?: string | null
    responsavelNome?: string
    visivelPara?: string[]
    visivelParaEquipe?: boolean
    pendenteTroca?: boolean
  },
): Promise<void> {
  const banco = requireDb()
  const ref = doc(banco, 'acessos', acesso.id)
  const agora = serverTimestamp()

  const alteracoes: Record<string, unknown> = {
    atualizadoEm: agora,
  }

  let mudouPermissao = false

  if (patch.nome !== undefined) alteracoes.nome = patch.nome.trim()
  if (patch.categoria !== undefined) alteracoes.categoria = patch.categoria
  if (patch.url !== undefined) alteracoes.url = patch.url.trim()
  if (patch.responsavelId !== undefined) alteracoes.responsavelId = patch.responsavelId
  if (patch.responsavelNome !== undefined) alteracoes.responsavelNome = patch.responsavelNome.trim()
  if (patch.pendenteTroca !== undefined) alteracoes.pendenteTroca = patch.pendenteTroca
  if (patch.visivelPara !== undefined) {
    alteracoes.visivelPara = acesso.escopo === 'rede' ? [] : patch.visivelPara.slice(0, MAX_VISIVEL_PARA)
    mudouPermissao = true
  }
  if (patch.visivelParaEquipe !== undefined) {
    alteracoes.visivelParaEquipe = acesso.escopo === 'rede' ? false : patch.visivelParaEquipe
    mudouPermissao = true
  }

  const batch = writeBatch(banco)
  batch.update(ref, alteracoes)

  const eventoRef = doc(collection(banco, 'acessos', acesso.id, 'eventos'))
  batch.set(eventoRef, {
    tipo: mudouPermissao ? 'permissao' : 'atualizacao',
    texto: mudouPermissao ? TEXTO_EVENTO_ACESSO.permissao : TEXTO_EVENTO_ACESSO.atualizacao,
    autorId: autor.uid,
    autorNome: autor.nome,
    criadoEm: agora,
  })

  await batch.commit()
}

export async function trocarSenhaAcesso(
  autor: Usuario,
  acessoId: string,
  novosDados: { login: string; senha: string; notas?: string },
): Promise<void> {
  const banco = requireDb()
  const agora = serverTimestamp()
  const batch = writeBatch(banco)

  // Atualiza segredo
  const segredoRef = doc(banco, 'acessos', acessoId, 'segredo', 'atual')
  batch.set(segredoRef, {
    login: novosDados.login.trim(),
    senha: novosDados.senha,
    notas: (novosDados.notas ?? '').trim(),
    atualizadoEm: agora,
    atualizadoPor: autor.uid,
  })

  // Atualiza metadados com nova data de troca e remove pendência
  const acessoRef = doc(banco, 'acessos', acessoId)
  batch.update(acessoRef, {
    ultimaTrocaEm: agora,
    pendenteTroca: false,
    atualizadoEm: agora,
  })

  // Grava evento com frase oficial
  const eventoRef = doc(collection(banco, 'acessos', acessoId, 'eventos'))
  batch.set(eventoRef, {
    tipo: 'troca_senha',
    texto: TEXTO_EVENTO_ACESSO.troca_senha,
    autorId: autor.uid,
    autorNome: autor.nome,
    criadoEm: agora,
  })

  await batch.commit()
}

export function observarSolicitacoes(
  filtro: { rede: boolean; unidadeId?: string | null },
  aoMudar: (solicitacoes: SolicitacaoAcesso[]) => void,
  aoErro: (erro: unknown) => void,
): () => void {
  if (!filtro.rede && !filtro.unidadeId) {
    aoMudar([])
    return () => undefined
  }
  const banco = requireDb()
  const base = collection(banco, 'solicitacoesAcesso')
  const consulta = filtro.rede ? base : query(base, where('unidadeId', '==', filtro.unidadeId))

  return onSnapshot(
    consulta,
    (snap) => {
      const lista = snap.docs.map((d) => mapSolicitacaoAcesso(d.id, d.data())).filter((item): item is SolicitacaoAcesso => item !== null)
      lista.sort((a, b) => paraMillis(b.criadoEm) - paraMillis(a.criadoEm))
      aoMudar(lista)
    },
    aoErro,
  )
}

export function observarSolicitacoesAbertas(
  filtro: { rede: boolean; unidadeId?: string | null },
  aoMudar: (total: number) => void,
): () => void {
  return observarSolicitacoes(
    filtro,
    (itens) => aoMudar(itens.filter((item) => item.status === 'aberta').length),
    () => aoMudar(0),
  )
}

export async function criarSolicitacaoAcesso(
  autor: Usuario,
  dados: {
    tipo: TipoSolicitacaoAcesso
    acessoId?: string
    acessoNome?: string
    unidadeId: string
    unidadeNome?: string
    motivo: string
    alvoUid?: string
    alvoNome?: string
  },
): Promise<string> {
  const banco = requireDb()
  const ref = doc(collection(banco, 'solicitacoesAcesso'))
  const agora = serverTimestamp()

  const unidadeId = (autor.unidadeId || dados.unidadeId).trim()
  if (!unidadeId) throw new Error('Unidade é obrigatória para criar solicitação.')

  const unidadeSnap = await getDoc(doc(banco, 'unidades', unidadeId))
  if (!unidadeSnap.exists()) throw new Error('Unidade não encontrada.')
  const unidadeNome = String(unidadeSnap.data()?.nome || dados.unidadeNome || '').trim()

  await setDoc(ref, {
    tipo: dados.tipo,
    status: 'aberta',
    acessoId: dados.acessoId?.trim() ?? '',
    acessoNome: dados.acessoNome?.trim() ?? '',
    unidadeId,
    unidadeNome,
    solicitadoPor: autor.uid,
    solicitadoPorNome: autor.nome,
    motivo: dados.motivo.trim().slice(0, 2000),
    alvoUid: dados.alvoUid?.trim() ?? '',
    alvoNome: dados.alvoNome?.trim() ?? '',
    decididoPor: null,
    decididoPorNome: null,
    criadoEm: agora,
    atualizadoEm: agora,
  })

  return ref.id
}

export async function decidirSolicitacaoAcesso(
  decisor: Usuario,
  solicitacao: SolicitacaoAcesso,
  novoStatus: 'aprovada' | 'recusada' | 'concluida',
  acessoAtual?: Acesso | null,
  dadosRevogacao?: { novaSenha: string; login?: string; notas?: string },
): Promise<void> {
  const banco = requireDb()
  const agora = serverTimestamp()

  if (novoStatus === 'aprovada') {
    if (solicitacao.tipo === 'pedir_acesso' || solicitacao.tipo === 'revogar') {
      if (!solicitacao.acessoId || !acessoAtual) {
        throw new Error('Acesso correspondente não encontrado para aprovação da solicitação.')
      }
      if (!solicitacao.alvoUid) {
        throw new Error('A solicitação não indica quem deve ganhar ou perder o acesso.')
      }
    }
  }

  const batch = writeBatch(banco)

  if (novoStatus === 'aprovada' && solicitacao.acessoId && acessoAtual) {
    if (solicitacao.tipo === 'pedir_acesso' && solicitacao.alvoUid) {
      const novosUids = Array.from(new Set([...acessoAtual.visivelPara, solicitacao.alvoUid])).slice(0, MAX_VISIVEL_PARA)
      const acessoRef = doc(banco, 'acessos', acessoAtual.id)
      batch.update(acessoRef, {
        visivelPara: novosUids,
        atualizadoEm: agora,
      })
      const eventoRef = doc(collection(banco, 'acessos', acessoAtual.id, 'eventos'))
      batch.set(eventoRef, {
        tipo: 'permissao',
        texto: TEXTO_EVENTO_ACESSO.permissao,
        autorId: decisor.uid,
        autorNome: decisor.nome,
        criadoEm: agora,
      })
    } else if (solicitacao.tipo === 'revogar' && solicitacao.alvoUid) {
      if (!dadosRevogacao?.novaSenha?.trim()) {
        throw new Error('Nova senha é obrigatória para aprovação da revogação com rotação imediata.')
      }
      const novosUids = acessoAtual.visivelPara.filter((uid) => uid !== solicitacao.alvoUid)
      const acessoRef = doc(banco, 'acessos', acessoAtual.id)
      batch.update(acessoRef, {
        visivelPara: novosUids,
        visivelParaEquipe: false,
        pendenteTroca: false,
        ultimaTrocaEm: agora,
        atualizadoEm: agora,
      })
      const segredoRef = doc(banco, 'acessos', acessoAtual.id, 'segredo', 'atual')
      batch.set(segredoRef, {
        login: (dadosRevogacao.login ?? '').trim(),
        senha: dadosRevogacao.novaSenha.trim(),
        notas: (dadosRevogacao.notas ?? '').trim(),
        atualizadoEm: agora,
        atualizadoPor: decisor.uid,
      })
      const eventoTrocaRef = doc(collection(banco, 'acessos', acessoAtual.id, 'eventos'))
      batch.set(eventoTrocaRef, {
        tipo: 'troca_senha',
        texto: TEXTO_EVENTO_ACESSO.troca_senha,
        autorId: decisor.uid,
        autorNome: decisor.nome,
        criadoEm: agora,
      })
      const eventoPermRef = doc(collection(banco, 'acessos', acessoAtual.id, 'eventos'))
      batch.set(eventoPermRef, {
        tipo: 'permissao',
        texto: TEXTO_EVENTO_ACESSO.permissao,
        autorId: decisor.uid,
        autorNome: decisor.nome,
        criadoEm: agora,
      })
    }
  }

  const solRef = doc(banco, 'solicitacoesAcesso', solicitacao.id)
  batch.update(solRef, {
    status: novoStatus,
    decididoPor: decisor.uid,
    decididoPorNome: decisor.nome,
    atualizadoEm: agora,
  })

  await batch.commit()
}
