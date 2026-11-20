// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import {
  ETAPAS, MOTIVOS_PERDA_PADRAO, ORIGENS_PADRAO, STATUS_PROPOSTA, TIPOS_ATIVIDADE,
  centavos, fechado, normalizarLista,
  type Atividade, type ConfigCrm, type Contato, type Lead, type LeadForm,
  type Proposta, type StatusProposta, type TipoAtividade,
} from './crm'
import type { ContatoEditavel, MudancaLead } from './crmApi'
import { requireSupabase } from './supabase'
import type { Usuario } from '../types'

type Linha = Record<string, unknown> & { id: string }
type Tabela = 'crm_leads' | 'crm_contatos' | 'crm_atividades' | 'crm_propostas'

function dataSb(valor: unknown): number {
  const ms = typeof valor === 'string' ? Date.parse(valor) : NaN
  return Number.isFinite(ms) ? ms : 0
}

const texto = (v: unknown, padrao = '') => (typeof v === 'string' ? v : padrao)
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
function umDe<T extends string>(lista: readonly T[], v: unknown, padrao: T): T {
  return lista.includes(v as T) ? (v as T) : padrao
}
const textos = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export function mapLeadSb(d: Linha): Lead {
  return {
    id: d.id,
    unidadeId: texto(d.unidade_id),
    unidadeNome: texto(d.unidade_nome),
    origem: texto(d.origem, 'Outro'),
    valorEstimadoCentavos: typeof d.valor_estimado_centavos === 'number' ? d.valor_estimado_centavos : null,
    etapa: umDe(ETAPAS, d.etapa, 'novo'),
    motivoPerda: texto(d.motivo_perda),
    responsavelUid: texto(d.responsavel_uid),
    responsavelNome: texto(d.responsavel_nome),
    proximoContatoMs: dataSb(d.proximo_contato),
    ultimaAtividadeMs: dataSb(d.ultima_atividade_em),
    arquivado: d.arquivado === true,
    criadoEmMs: dataSb(d.criado_em),
    etapaEmMs: dataSb(d.etapa_em),
    fechadoEmMs: dataSb(d.fechado_em),
    atualizadoPorNome: texto(d.atualizado_por_nome),
  }
}

export const mapContatoSb = (d: Linha): Contato => ({
  id: d.id, nome: texto(d.nome), telefone: texto(d.telefone), email: texto(d.email),
  interesseTamanho: texto(d.interesse_tamanho), interessePeriodo: texto(d.interesse_periodo), interesseUso: texto(d.interesse_uso),
})

export const mapAtividadeSb = (d: Linha): Atividade => ({
  id: d.id, leadId: texto(d.lead_id), tipo: umDe(TIPOS_ATIVIDADE, d.tipo, 'nota'), texto: texto(d.texto), nome: texto(d.nome),
  geradoPorIA: d.gerado_por_ia === true, iaModelo: texto(d.ia_modelo), criadoEmMs: dataSb(d.criado_em),
})

export const mapPropostaSb = (d: Linha): Proposta => ({
  id: d.id, leadId: texto(d.lead_id), box: texto(d.box), precoMensalCentavos: numero(d.preco_mensal_centavos), periodoMeses: numero(d.periodo_meses),
  validadeMs: dataSb(d.validade), status: umDe(STATUS_PROPOSTA, d.status, 'enviada'), obs: texto(d.obs),
  geradoPorIA: d.gerado_por_ia === true, iaModelo: texto(d.ia_modelo), criadoEmMs: dataSb(d.criado_em), atualizadoPorNome: texto(d.atualizado_por_nome),
})

export function mapConfigSb(linha: Record<string, unknown> | null): ConfigCrm {
  const d = linha ?? {}
  const origens = textos(d.origens)
  const motivos = textos(d.motivos_perda)
  return {
    origens: origens.length ? origens : ORIGENS_PADRAO,
    motivosPerda: motivos.length ? motivos : MOTIVOS_PERDA_PADRAO,
    atualizadoPorNome: texto(d.atualizado_por_nome),
    atualizadoEmMs: dataSb(d.atualizado_em),
  }
}

async function listar(tabela: Tabela, unidadeId?: string, leadId?: string): Promise<Linha[]> {
  const banco = requireSupabase()
  const linhas: Linha[] = []
  const pagina = 500
  for (;;) {
    const consulta = banco.from(tabela).select('*').order('id').range(linhas.length, linhas.length + pagina - 1)
    if (unidadeId !== undefined) consulta.eq('unidade_id', unidadeId)
    if (leadId !== undefined) consulta.eq('lead_id', leadId)
    const { data, error } = await consulta.overrideTypes<Linha[], { merge: false }>()
    if (error) throw new Error('Não foi possível carregar os dados do CRM.')
    linhas.push(...data)
    if (data.length < pagina) return linhas
  }
}

const recentes = (a: { criadoEmMs: number }, b: { criadoEmMs: number }) => b.criadoEmMs - a.criadoEmMs
const dataOuNull = (dia: string) => dia ? new Date(`${dia}T09:00:00`).toISOString() : null
const modelo = (ia: { geradoPorIA: boolean; iaModelo: string }) => ia.geradoPorIA ? ia.iaModelo.trim().slice(0, 80) : ''

function contatoParaGravar(c: ContatoEditavel) {
  return {
    nome: c.nome.trim().slice(0, 120),
    telefone: c.telefone.trim().slice(0, 30),
    email: c.email.trim().slice(0, 120),
    interesse_tamanho: c.interesseTamanho.trim().slice(0, 60),
    interesse_periodo: c.interessePeriodo.trim().slice(0, 60),
    interesse_uso: c.interesseUso.trim().slice(0, 200),
  }
}

async function atualizar(tabela: Tabela, id: string, dados: Record<string, unknown>): Promise<void> {
  const { error } = await requireSupabase().from(tabela).update(dados).eq('id', id).select('id').single()
  if (error) throw new Error('Não foi possível atualizar o registro do CRM.')
}

export async function lerConfigSb(): Promise<ConfigCrm> {
  const { data, error } = await requireSupabase().from('crm_config').select('*').eq('id', 'rede').maybeSingle()
  if (error) throw new Error('Não foi possível carregar a configuração do CRM.')
  return mapConfigSb(data)
}

export async function salvarConfigSb(origens: string[], motivosPerda: string[]): Promise<void> {
  const { error } = await requireSupabase().from('crm_config').upsert({
    id: 'rede', origens: normalizarLista(origens), motivos_perda: normalizarLista(motivosPerda),
  })
  if (error) throw new Error('Não foi possível salvar a configuração do CRM.')
}

export async function carregarUnidadeSb(unidadeId: string): Promise<{ leads: Lead[]; contatos: Map<string, Contato> }> {
  const [leads, contatos] = await Promise.all([
    listar('crm_leads', unidadeId),
    listar('crm_contatos', unidadeId),
  ])
  return {
    leads: leads.map(mapLeadSb).sort(recentes),
    contatos: new Map(contatos.map((linha) => [linha.id, mapContatoSb(linha)])),
  }
}

export async function carregarRedeSb(): Promise<Lead[]> {
  return (await listar('crm_leads')).map(mapLeadSb)
}

export async function carregarDetalheSb(unidadeId: string, leadId: string): Promise<{ atividades: Atividade[]; propostas: Proposta[] }> {
  const [atividades, propostas] = await Promise.all([
    listar('crm_atividades', unidadeId, leadId),
    listar('crm_propostas', unidadeId, leadId),
  ])
  return {
    atividades: atividades.map(mapAtividadeSb).sort(recentes),
    propostas: propostas.map(mapPropostaSb).sort(recentes),
  }
}

export async function criarLeadSb(autor: Usuario, f: LeadForm, responsavelNome: string): Promise<string> {
  const id = crypto.randomUUID()
  const unidadeId = autor.unidadeId ?? ''
  const { error } = await requireSupabase().rpc('criar_lead_crm', {
    p_id: id,
    p_lead: {
      unidade_id: unidadeId,
      unidade_nome: autor.unidade ?? '',
      origem: f.origem,
      valor_estimado_centavos: centavos(f.valorEstimado),
      etapa: 'novo',
      motivo_perda: '',
      responsavel_uid: f.responsavelUid,
      responsavel_nome: responsavelNome,
      proximo_contato: dataOuNull(f.proximoContato),
      arquivado: false,
    },
    p_contato: { unidade_id: unidadeId, ...contatoParaGravar(f) },
  })
  if (error) throw new Error('Não foi possível criar o lead e o contato.')
  return id
}

export async function salvarContatoSb(leadId: string, c: ContatoEditavel): Promise<void> {
  await atualizar('crm_contatos', leadId, contatoParaGravar(c))
}

export async function atualizarLeadSb(lead: Lead, m: MudancaLead): Promise<void> {
  const dados: Record<string, unknown> = { atualizado_em: null }
  if (m.etapa && m.etapa !== lead.etapa) {
    dados.etapa = m.etapa
    dados.motivo_perda = m.etapa === 'perdido' ? (m.motivoPerda ?? '').slice(0, 60) : ''
    // O gatilho troca o marcador pela hora do servidor.
    dados.etapa_em = 'infinity'
    dados.fechado_em = fechado(m.etapa) ? 'infinity' : null
  }
  if (m.responsavelUid && (m.responsavelUid !== lead.responsavelUid || (m.responsavelNome ?? '') !== lead.responsavelNome)) {
    dados.responsavel_uid = m.responsavelUid
    dados.responsavel_nome = m.responsavelNome ?? ''
  }
  if (m.proximoContato !== undefined) dados.proximo_contato = dataOuNull(m.proximoContato ?? '')
  if (m.arquivado !== undefined) dados.arquivado = m.arquivado
  if (m.origem !== undefined) dados.origem = m.origem
  if (m.valorEstimado !== undefined) dados.valor_estimado_centavos = centavos(m.valorEstimado)
  await atualizar('crm_leads', lead.id, dados)
}

export async function registrarAtividadeSb(
  lead: Lead, tipo: TipoAtividade, textoAtividade: string,
  ia: { geradoPorIA: boolean; iaModelo: string }, proximoContato: string | null,
): Promise<void> {
  const { error } = await requireSupabase().rpc('registrar_atividade_crm', {
    p_id: crypto.randomUUID(),
    p_lead_id: lead.id,
    p_unidade_id: lead.unidadeId,
    p_tipo: tipo,
    p_texto: textoAtividade.trim().slice(0, 2000),
    p_gerado_por_ia: ia.geradoPorIA,
    p_ia_modelo: modelo(ia),
    p_atualizar_lead: !fechado(lead.etapa),
    p_agendar: proximoContato !== null,
    p_proximo_contato: dataOuNull(proximoContato ?? ''),
  })
  if (error) throw new Error('Não foi possível registrar a atividade.')
}

export async function criarPropostaSb(
  lead: Lead,
  p: { box: string; preco: string; periodoMeses: number; validade: string; obs: string; geradoPorIA: boolean; iaModelo: string },
): Promise<void> {
  const { error } = await requireSupabase().from('crm_propostas').insert({
    id: crypto.randomUUID(),
    lead_id: lead.id,
    unidade_id: lead.unidadeId,
    box: p.box.trim().slice(0, 60),
    preco_mensal_centavos: centavos(p.preco) ?? 0,
    periodo_meses: p.periodoMeses,
    validade: new Date(`${p.validade}T23:59:59`).toISOString(),
    status: 'enviada',
    obs: p.obs.trim().slice(0, 1000),
    gerado_por_ia: p.geradoPorIA,
    ia_modelo: modelo(p),
  })
  if (error) throw new Error('Não foi possível registrar a proposta.')
}

export async function mudarStatusPropostaSb(proposta: Proposta, status: StatusProposta): Promise<void> {
  await atualizar('crm_propostas', proposta.id, { status })
}
