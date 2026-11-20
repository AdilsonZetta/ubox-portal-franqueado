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
import { paraMillis } from './format'
import {
  ETAPAS,
  MOTIVOS_PERDA_PADRAO,
  ORIGENS_PADRAO,
  STATUS_PROPOSTA,
  TIPOS_ATIVIDADE,
  centavos,
  normalizarLista,
  type Atividade,
  type ConfigCrm,
  type Contato,
  type Etapa,
  type Lead,
  type LeadForm,
  type Proposta,
  type StatusProposta,
  type TipoAtividade,
} from './crm'
import type { Usuario } from '../types'

const texto = (v: unknown, padrao = '') => (typeof v === 'string' ? v : padrao)
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
function umDe<T extends string>(lista: readonly T[], v: unknown, padrao: T): T {
  return lista.includes(v as T) ? (v as T) : padrao
}
const textos = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export function mapLead(id: string, d: DocumentData): Lead {
  return {
    id,
    unidadeId: texto(d.unidadeId),
    unidadeNome: texto(d.unidadeNome),
    origem: texto(d.origem, 'Outro'),
    interesseTamanho: texto(d.interesseTamanho),
    interessePeriodo: texto(d.interessePeriodo),
    interesseUso: texto(d.interesseUso),
    valorEstimadoCentavos: typeof d.valorEstimadoCentavos === 'number' ? d.valorEstimadoCentavos : null,
    etapa: umDe(ETAPAS, d.etapa, 'novo'),
    motivoPerda: texto(d.motivoPerda),
    responsavelUid: texto(d.responsavelUid),
    responsavelNome: texto(d.responsavelNome),
    proximoContatoMs: paraMillis(d.proximoContato),
    ultimaAtividadeMs: paraMillis(d.ultimaAtividadeEm),
    arquivado: d.arquivado === true,
    criadoEmMs: paraMillis(d.criadoEm),
    etapaEmMs: paraMillis(d.etapaEm),
    fechadoEmMs: paraMillis(d.fechadoEm),
    atualizadoPorNome: texto(d.atualizadoPorNome),
  }
}

const mapContato = (id: string, d: DocumentData): Contato => ({ id, nome: texto(d.nome), telefone: texto(d.telefone), email: texto(d.email) })

const mapAtividade = (id: string, d: DocumentData): Atividade => ({
  id, leadId: texto(d.leadId), tipo: umDe(TIPOS_ATIVIDADE, d.tipo, 'nota'), texto: texto(d.texto), nome: texto(d.nome),
  geradoPorIA: d.geradoPorIA === true, iaModelo: texto(d.iaModelo), criadoEmMs: paraMillis(d.criadoEm),
})

const mapProposta = (id: string, d: DocumentData): Proposta => ({
  id, leadId: texto(d.leadId), box: texto(d.box), precoMensalCentavos: numero(d.precoMensalCentavos), periodoMeses: numero(d.periodoMeses),
  validadeMs: paraMillis(d.validade), status: umDe(STATUS_PROPOSTA, d.status, 'enviada'), obs: texto(d.obs),
  geradoPorIA: d.geradoPorIA === true, iaModelo: texto(d.iaModelo), criadoEmMs: paraMillis(d.criadoEm), atualizadoPorNome: texto(d.atualizadoPorNome),
})

export async function lerConfig(): Promise<ConfigCrm> {
  const snap = await getDoc(doc(requireDb(), 'crmConfig', 'rede'))
  const d = snap.exists() ? snap.data() : {}
  const origens = textos(d.origens)
  const motivos = textos(d.motivosPerda)
  return {
    origens: origens.length ? origens : ORIGENS_PADRAO,
    motivosPerda: motivos.length ? motivos : MOTIVOS_PERDA_PADRAO,
    atualizadoPorNome: texto(d.atualizadoPorNome),
    atualizadoEmMs: paraMillis(d.atualizadoEm),
  }
}

export async function salvarConfig(autor: Usuario, origens: string[], motivosPerda: string[]): Promise<void> {
  await setDoc(doc(requireDb(), 'crmConfig', 'rede'), {
    origens: normalizarLista(origens),
    motivosPerda: normalizarLista(motivosPerda),
    atualizadoPor: autor.uid,
    atualizadoPorNome: autor.nome,
    atualizadoEm: serverTimestamp(),
  })
}

/** Unidade: leads (sem PII) e contatos (PII) da própria unidade, sempre com o filtro que as rules exigem. */
export async function carregarUnidade(unidadeId: string): Promise<{ leads: Lead[]; contatos: Map<string, Contato> }> {
  const banco = requireDb()
  const [l, c] = await Promise.all([
    getDocs(query(collection(banco, 'crmLeads'), where('unidadeId', '==', unidadeId))),
    getDocs(query(collection(banco, 'crmContatos'), where('unidadeId', '==', unidadeId))),
  ])
  return {
    leads: l.docs.map((d) => mapLead(d.id, d.data())).sort((a, b) => b.criadoEmMs - a.criadoEmMs),
    contatos: new Map(c.docs.map((d) => [d.id, mapContato(d.id, d.data())])),
  }
}

/** Franqueadora: só crmLeads (campos sem dados pessoais). */
export async function carregarRede(): Promise<Lead[]> {
  const snap = await getDocs(collection(requireDb(), 'crmLeads'))
  return snap.docs.map((d) => mapLead(d.id, d.data()))
}

export async function carregarDetalhe(unidadeId: string, leadId: string): Promise<{ atividades: Atividade[]; propostas: Proposta[] }> {
  const banco = requireDb()
  const [a, p] = await Promise.all([
    getDocs(query(collection(banco, 'crmAtividades'), where('unidadeId', '==', unidadeId), where('leadId', '==', leadId))),
    getDocs(query(collection(banco, 'crmPropostas'), where('unidadeId', '==', unidadeId), where('leadId', '==', leadId))),
  ])
  return {
    atividades: a.docs.map((d) => mapAtividade(d.id, d.data())).sort((x, y) => y.criadoEmMs - x.criadoEmMs),
    propostas: p.docs.map((d) => mapProposta(d.id, d.data())).sort((x, y) => y.criadoEmMs - x.criadoEmMs),
  }
}

const autoria = (autor: Usuario) => ({ atualizadoPor: autor.uid, atualizadoPorNome: autor.nome, atualizadoEm: serverTimestamp() })
const dataOuNull = (dia: string) => (dia ? new Date(`${dia}T09:00:00`) : null)

/** Lead (sem PII) e contato (PII) nascem juntos, no mesmo lote e com o mesmo id. */
export async function criarLead(autor: Usuario, f: LeadForm, responsavelNome: string): Promise<string> {
  const banco = requireDb()
  const ref = doc(collection(banco, 'crmLeads'))
  const lote = writeBatch(banco)
  lote.set(ref, {
    unidadeId: autor.unidadeId ?? '',
    unidadeNome: autor.unidade ?? '',
    origem: f.origem,
    interesseTamanho: f.interesseTamanho.trim().slice(0, 60),
    interessePeriodo: f.interessePeriodo.trim().slice(0, 60),
    interesseUso: f.interesseUso.trim().slice(0, 200),
    valorEstimadoCentavos: f.valorEstimado.trim() ? centavos(f.valorEstimado) : null,
    etapa: 'novo',
    motivoPerda: '',
    responsavelUid: f.responsavelUid,
    responsavelNome,
    proximoContato: dataOuNull(f.proximoContato),
    ultimaAtividadeEm: null,
    arquivado: false,
    criadoEm: serverTimestamp(),
    etapaEm: serverTimestamp(),
    fechadoEm: null,
    ...autoria(autor),
  })
  lote.set(doc(banco, 'crmContatos', ref.id), {
    unidadeId: autor.unidadeId ?? '',
    nome: f.nome.trim().slice(0, 120),
    telefone: f.telefone.trim().slice(0, 30),
    email: f.email.trim().slice(0, 120),
    atualizadoPor: autor.uid,
    atualizadoEm: serverTimestamp(),
  })
  await lote.commit()
  return ref.id
}

export async function salvarContato(autor: Usuario, leadId: string, c: Pick<Contato, 'nome' | 'telefone' | 'email'>): Promise<void> {
  await updateDoc(doc(requireDb(), 'crmContatos', leadId), {
    nome: c.nome.trim().slice(0, 120), telefone: c.telefone.trim().slice(0, 30), email: c.email.trim().slice(0, 120),
    atualizadoPor: autor.uid, atualizadoEm: serverTimestamp(),
  })
}

export interface MudancaLead {
  etapa?: Etapa
  motivoPerda?: string
  responsavelUid?: string
  responsavelNome?: string
  proximoContato?: string | null
  arquivado?: boolean
  origem?: string
  interesseTamanho?: string
  interessePeriodo?: string
  interesseUso?: string
  valorEstimado?: string
}

export async function atualizarLead(autor: Usuario, lead: Lead, m: MudancaLead): Promise<void> {
  const dados: Record<string, unknown> = { ...autoria(autor) }
  if (m.etapa && m.etapa !== lead.etapa) {
    dados.etapa = m.etapa
    dados.etapaEm = serverTimestamp()
    dados.motivoPerda = m.etapa === 'perdido' ? (m.motivoPerda ?? '').slice(0, 60) : ''
    dados.fechadoEm = m.etapa === 'ganho' || m.etapa === 'perdido' ? serverTimestamp() : null
  }
  if (m.responsavelUid && m.responsavelUid !== lead.responsavelUid) {
    dados.responsavelUid = m.responsavelUid
    dados.responsavelNome = m.responsavelNome ?? ''
  }
  if (m.proximoContato !== undefined) dados.proximoContato = m.proximoContato ? dataOuNull(m.proximoContato) : null
  if (m.arquivado !== undefined) dados.arquivado = m.arquivado
  if (m.origem !== undefined) dados.origem = m.origem
  if (m.interesseTamanho !== undefined) dados.interesseTamanho = m.interesseTamanho.trim().slice(0, 60)
  if (m.interessePeriodo !== undefined) dados.interessePeriodo = m.interessePeriodo.trim().slice(0, 60)
  if (m.interesseUso !== undefined) dados.interesseUso = m.interesseUso.trim().slice(0, 200)
  if (m.valorEstimado !== undefined) dados.valorEstimadoCentavos = m.valorEstimado.trim() ? centavos(m.valorEstimado) : null
  await updateDoc(doc(requireDb(), 'crmLeads', lead.id), dados)
}

/** Atividade imutável + data da última atividade (e o próximo follow-up, se veio) no mesmo lote. */
export async function registrarAtividade(autor: Usuario, lead: Lead, tipo: TipoAtividade, textoAtividade: string, ia: { geradoPorIA: boolean; iaModelo: string }, proximoContato: string | null): Promise<void> {
  const banco = requireDb()
  const lote = writeBatch(banco)
  lote.set(doc(collection(banco, 'crmAtividades')), {
    leadId: lead.id,
    unidadeId: lead.unidadeId,
    tipo,
    texto: textoAtividade.trim().slice(0, 2000),
    uid: autor.uid,
    nome: autor.nome,
    geradoPorIA: ia.geradoPorIA,
    iaModelo: ia.geradoPorIA ? ia.iaModelo.trim().slice(0, 80) : '',
    criadoEm: serverTimestamp(),
  })
  if (!(lead.etapa === 'ganho' || lead.etapa === 'perdido')) {
    lote.update(doc(banco, 'crmLeads', lead.id), {
      ultimaAtividadeEm: serverTimestamp(),
      ...(proximoContato !== null ? { proximoContato: proximoContato ? dataOuNull(proximoContato) : null } : {}),
      ...autoria(autor),
    })
  }
  await lote.commit()
}

export async function criarProposta(autor: Usuario, lead: Lead, p: { box: string; preco: string; periodoMeses: number; validade: string; obs: string; geradoPorIA: boolean; iaModelo: string }): Promise<void> {
  await setDoc(doc(collection(requireDb(), 'crmPropostas')), {
    leadId: lead.id,
    unidadeId: lead.unidadeId,
    box: p.box.trim().slice(0, 60),
    precoMensalCentavos: centavos(p.preco) ?? 0,
    periodoMeses: p.periodoMeses,
    validade: new Date(`${p.validade}T23:59:59`),
    status: 'enviada',
    obs: p.obs.trim().slice(0, 1000),
    geradoPorIA: p.geradoPorIA,
    iaModelo: p.geradoPorIA ? p.iaModelo.trim().slice(0, 80) : '',
    criadoEm: serverTimestamp(),
    ...autoria(autor),
  })
}

export async function mudarStatusProposta(autor: Usuario, proposta: Proposta, status: StatusProposta): Promise<void> {
  await updateDoc(doc(requireDb(), 'crmPropostas', proposta.id), { status, ...autoria(autor) })
}
