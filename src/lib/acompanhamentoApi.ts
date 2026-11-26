import { STATUS_PENDENTES } from '../data/chamados'
import type { VigenciaChecklist } from './checklist'
import { BACKEND } from './backend'
import {
  carregarAcompanhamentoSb,
  concluirPassoUnidadeSb,
  decidirPassoSb,
  listarCompartilhadosSb,
  salvarRegistroSb,
} from './acompanhamentoSupabase'
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore'
import { requireDb } from './firebase'
import { paraMillis } from './format'
import { listarModelos, mapExecucao, mapModelo } from './checklistApi'
import { mapAcao, mapAuditoria } from './auditoriaApi'
import { entradaPrazoChamado, mapChamado } from './chamados'
import { mapPedido } from './marketingApi'
import { mapProgresso } from './manuaisApi'
import { mapTentativa } from './universidadeApi'
import {
  STATUS_PASSO,
  TIPOS_REGISTRO,
  type Fontes,
  type PassoAc,
  type RegistroAc,
  type RegistroForm,
} from './acompanhamento'
import type { Usuario } from '../types'

const DIA = 86_400_000
const texto = (v: unknown, padrao = '') => (typeof v === 'string' ? v : padrao)
function umDe<T extends string>(lista: readonly T[], v: unknown, padrao: T): T {
  return lista.includes(v as T) ? (v as T) : padrao
}

export function mapRegistro(id: string, d: DocumentData): RegistroAc {
  return {
    id,
    unidadeId: texto(d.unidadeId),
    unidadeNome: texto(d.unidadeNome),
    dataMs: paraMillis(d.data),
    tipo: umDe(TIPOS_REGISTRO, d.tipo, 'visita'),
    notas: texto(d.notas),
    compartilhado: d.compartilhado === true,
    geradoPorIA: d.geradoPorIA === true,
    iaModelo: texto(d.iaModelo),
    autorUid: texto(d.autorUid),
    autorNome: texto(d.autorNome),
    criadoEmMs: paraMillis(d.criadoEm),
    atualizadoPorNome: texto(d.atualizadoPorNome),
    atualizadoEmMs: paraMillis(d.atualizadoEm),
  }
}

export function mapPasso(id: string, d: DocumentData): PassoAc {
  return {
    id,
    registroId: texto(d.registroId),
    unidadeId: texto(d.unidadeId),
    descricao: texto(d.descricao),
    responsavel: texto(d.responsavel),
    prazoMs: paraMillis(d.prazo),
    status: umDe(STATUS_PASSO, d.status, 'aberto'),
    compartilhado: d.compartilhado === true,
    comentarioUnidade: texto(d.comentarioUnidade),
    comentarioFranqueadora: texto(d.comentarioFranqueadora),
    criadoEmMs: paraMillis(d.criadoEm),
    atualizadoPorNome: texto(d.atualizadoPorNome),
    atualizadoEmMs: paraMillis(d.atualizadoEm),
  }
}

/** Uma fonte que falhar (sem permissão, por exemplo) vira `null` e aparece como indisponível, sem derrubar o painel. */
async function seguro<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch {
    return null
  }
}

export interface DadosAcompanhamento {
  fontes: Omit<Fontes, 'modelosChecklist' | 'acoes' | 'chamados'> & {
    modelosChecklist: (NonNullable<Fontes['modelosChecklist']>[number] & { titulo?: string })[] | null
    acoes: (NonNullable<Fontes['acoes']>[number] & { id?: string; auditoriaId?: string; descricao?: string; responsavel?: string })[] | null
    chamados: (NonNullable<Fontes['chamados']>[number] & { id?: string; titulo?: string; abertoPor?: string })[] | null
  }
  /** Início e primeiro vencimento das rotinas por unidade (etapa 04). Vazio no Firebase ou sem a migração. */
  vigenciasChecklist?: VigenciaChecklist[]
  registros: RegistroAc[]
  passos: PassoAc[]
}

export interface OpcoesAcompanhamento {
  fontes?: readonly (keyof Fontes)[]
  incluirChamadosEncerrados?: boolean
  solicitanteUid?: string
}

/** Lê o que o painel agrega. Com `unidadeId`, só a unidade; sem, a rede toda (visão geral). Somente leitura. */
export async function carregarAcompanhamento(unidadeId?: string, opcoes: OpcoesAcompanhamento = {}): Promise<DadosAcompanhamento> {
  if (BACKEND === 'supabase') return carregarAcompanhamentoSb(unidadeId, opcoes)
  const banco = requireDb()
  const un: QueryConstraint[] = unidadeId ? [where('unidadeId', '==', unidadeId)] : []
  const ler = (nome: string, ...extra: QueryConstraint[]) => getDocs(query(collection(banco, nome), ...un, ...extra))
  const agora = Date.now()
  const lerFonte = <T>(fonte: keyof Fontes, consulta: () => Promise<T>) =>
    !opcoes.fontes || opcoes.fontes.includes(fonte) ? seguro(consulta()) : Promise.resolve(null)
  const [modelos, execucoes, auditorias, acoes, chamados, tentativas, cursos, progresso, trilha, pedidos, registros, passos] = await Promise.all([
    lerFonte('modelosChecklist', () => unidadeId && opcoes.fontes ? listarModelos({ unidadeId }, false) : getDocs(collection(banco, 'checklistModelos')).then((s) => s.docs.map((d) => mapModelo(d.id, d.data())))),
    lerFonte('execucoes', () => ler('checklistExecucoes', where('criadoEm', '>=', new Date(agora - 62 * DIA)), orderBy('criadoEm', 'desc'), limit(3000)).then((s) => s.docs.map((d) => mapExecucao(d.id, d.data())))),
    // Só auditorias assinadas: o rascunho é do auditor (as rules exigem este filtro).
    lerFonte('auditorias', () => ler('auditorias', where('status', 'in', ['aguardando_ciencia', 'concluida'])).then((s) => s.docs.map((d) => mapAuditoria(d.id, d.data())))),
    lerFonte('acoes', () => ler('auditoriaAcoes').then((s) => s.docs.map((d) => mapAcao(d.id, d.data())))),
    lerFonte('chamados', () =>
      ler('chamados',
        ...(opcoes.solicitanteUid ? [where('abertoPor', '==', opcoes.solicitanteUid)] : []),
        ...(unidadeId || opcoes.incluirChamadosEncerrados ? [] : [where('status', 'in', STATUS_PENDENTES)]),
      ).then((s) =>
        s.docs.map((d) => mapChamado(d.id, d.data())).filter((c) => c !== null),
      ),
    ),
    lerFonte('tentativas', () => ler('tentativasProva').then((s) => s.docs.map((d) => mapTentativa(d.id, d.data())))),
    // O consultor só lê cursos publicados (as rules exigem este filtro).
    lerFonte('cursosPublicados', () => getDocs(query(collection(banco, 'cursos'), where('publicado', '==', true))).then((s) => s.size)),
    lerFonte('progresso', () => ler('progressoManuais').then((s) => s.docs.map((d) => mapProgresso(d.id, d.data())))),
    lerFonte('trilhaManuais', () => getDocs(collection(banco, 'manuaisTrilha')).then((s) => s.docs.filter((d) => d.data().ativo === true).length)),
    lerFonte('pedidos', () => ler('marketingSolicitacoes').then((s) => s.docs.map((d) => mapPedido(d.id, d.data())))),
    lerFonte('registros', () => ler('acompanhamentoRegistros').then((s) => s.docs.map((d) => mapRegistro(d.id, d.data())))),
    lerFonte('passos', () => ler('acompanhamentoPassos').then((s) => s.docs.map((d) => mapPasso(d.id, d.data())))),
  ])
  return {
    fontes: {
      modelosChecklist: modelos,
      execucoes,
      auditorias,
      acoes,
      chamados: chamados ? chamados.map((c) => ({ id: c.id, titulo: c.titulo, unidadeId: c.unidadeId, abertoPor: c.abertoPor, ...entradaPrazoChamado(c) })) : null,
      tentativas,
      cursosPublicados: cursos,
      progresso,
      trilhaManuais: trilha,
      pedidos,
      registros,
      passos,
    },
    registros: (registros ?? []).sort((a, b) => b.dataMs - a.dataMs),
    passos: (passos ?? []).sort((a, b) => a.prazoMs - b.prazoMs),
  }
}

function deInputData(v: string): Date {
  const [a, m, d] = v.split('-').map(Number)
  return new Date(a, (m || 1) - 1, d || 1, 12)
}

/**
 * Cria ou edita um registro e grava os passos novos no mesmo lote. Ao mudar o compartilhamento,
 * todos os passos do registro acompanham (as rules conferem pelo estado final do lote).
 */
export async function salvarRegistro(
  autor: Usuario,
  unidade: { id: string; nome: string },
  existente: RegistroAc | null,
  passosDoRegistro: PassoAc[],
  f: RegistroForm,
): Promise<string> {
  if (BACKEND === 'supabase') return salvarRegistroSb(unidade, existente, f)
  const banco = requireDb()
  const lote = writeBatch(banco)
  const ref = existente ? doc(banco, 'acompanhamentoRegistros', existente.id) : doc(collection(banco, 'acompanhamentoRegistros'))
  const autoria = { atualizadoPor: autor.uid, atualizadoPorNome: autor.nome, atualizadoEm: serverTimestamp() }
  const conteudo = {
    data: deInputData(f.data),
    tipo: f.tipo,
    notas: f.notas.trim().slice(0, 4000),
    compartilhado: f.compartilhado,
    geradoPorIA: f.geradoPorIA,
    iaModelo: f.geradoPorIA ? f.iaModelo.trim().slice(0, 80) : '',
    ...autoria,
  }
  if (existente) {
    lote.update(ref, conteudo)
    if (existente.compartilhado !== f.compartilhado) {
      for (const p of passosDoRegistro) lote.update(doc(banco, 'acompanhamentoPassos', p.id), { compartilhado: f.compartilhado, ...autoria })
    }
  } else {
    lote.set(ref, {
      unidadeId: unidade.id,
      unidadeNome: unidade.nome.trim().slice(0, 120),
      ...conteudo,
      autorUid: autor.uid,
      autorNome: autor.nome,
      criadoEm: serverTimestamp(),
    })
  }
  for (const p of f.passos) {
    lote.set(doc(collection(banco, 'acompanhamentoPassos')), {
      registroId: ref.id,
      unidadeId: unidade.id,
      descricao: p.descricao.trim().slice(0, 1000),
      responsavel: p.responsavel.trim().slice(0, 120),
      prazo: deInputData(p.prazo),
      status: 'aberto',
      compartilhado: f.compartilhado,
      comentarioUnidade: '',
      comentarioFranqueadora: '',
      criadoEm: serverTimestamp(),
      ...autoria,
    })
  }
  await lote.commit()
  return ref.id
}

export async function decidirPasso(autor: Usuario, passo: PassoAc, status: 'validado' | 'reaberto', comentario: string): Promise<void> {
  if (BACKEND === 'supabase') return decidirPassoSb(passo, status, comentario)
  const lote = writeBatch(requireDb())
  lote.update(doc(requireDb(), 'acompanhamentoPassos', passo.id), {
    status,
    comentarioFranqueadora: comentario.trim().slice(0, 1000),
    atualizadoPor: autor.uid,
    atualizadoPorNome: autor.nome,
    atualizadoEm: serverTimestamp(),
  })
  await lote.commit()
}

// ---------- Visão da unidade ----------

export async function listarCompartilhados(unidadeId: string): Promise<{ registros: RegistroAc[]; passos: PassoAc[] }> {
  if (BACKEND === 'supabase') return listarCompartilhadosSb(unidadeId)
  const banco = requireDb()
  const filtros = [where('unidadeId', '==', unidadeId), where('compartilhado', '==', true)]
  const r = await getDocs(query(collection(banco, 'acompanhamentoRegistros'), ...filtros))
  const registros = r.docs.map((d) => mapRegistro(d.id, d.data())).sort((a, b) => b.dataMs - a.dataMs)
  // Passos por registro compartilhado: as rules conferem o registro-pai, e o filtro por registroId deixa isso provável.
  const listas = await Promise.all(
    registros.map((reg) => getDocs(query(collection(banco, 'acompanhamentoPassos'), ...filtros, where('registroId', '==', reg.id)))),
  )
  return {
    registros,
    passos: listas.flatMap((p) => p.docs.map((d) => mapPasso(d.id, d.data()))).sort((a, b) => a.prazoMs - b.prazoMs),
  }
}

export async function concluirPassoUnidade(autor: Usuario, id: string, comentario: string): Promise<void> {
  if (BACKEND === 'supabase') return concluirPassoUnidadeSb(id, comentario)
  const lote = writeBatch(requireDb())
  lote.update(doc(requireDb(), 'acompanhamentoPassos', id), {
    status: 'concluido_unidade',
    comentarioUnidade: comentario.trim().slice(0, 1000),
    atualizadoPor: autor.uid,
    atualizadoPorNome: autor.nome,
    atualizadoEm: serverTimestamp(),
  })
  await lote.commit()
}
