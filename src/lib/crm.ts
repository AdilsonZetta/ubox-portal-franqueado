// Módulo 11 — CRM e Gestão Comercial: funil de locação de boxes da unidade (tipos e regras puras).

export const ORIGENS_PADRAO = ['Site', 'Instagram', 'Google', 'Indicação', 'Passante', 'WhatsApp', 'Outro']
export const MOTIVOS_PERDA_PADRAO = ['Preço', 'Sem box do tamanho', 'Escolheu concorrente', 'Desistiu', 'Sem retorno', 'Outro']
export const MAX_LISTA_CONFIG = 20

export const ETAPAS = ['novo', 'contato', 'visita', 'proposta', 'ganho', 'perdido'] as const
export type Etapa = (typeof ETAPAS)[number]
export const ETAPAS_ABERTAS: Etapa[] = ['novo', 'contato', 'visita', 'proposta']
export const ROTULO_ETAPA: Record<Etapa, string> = {
  novo: 'Novo', contato: 'Contato', visita: 'Visita agendada', proposta: 'Proposta', ganho: 'Fechado ganho', perdido: 'Perdido',
}

export const TIPOS_ATIVIDADE = ['ligacao', 'whatsapp', 'visita', 'email', 'nota'] as const
export type TipoAtividade = (typeof TIPOS_ATIVIDADE)[number]
export const ROTULO_ATIVIDADE: Record<TipoAtividade, string> = { ligacao: 'Ligação', whatsapp: 'WhatsApp', visita: 'Visita', email: 'E-mail', nota: 'Nota' }

export const STATUS_PROPOSTA = ['enviada', 'aceita', 'recusada', 'expirada'] as const
export type StatusProposta = (typeof STATUS_PROPOSTA)[number]
export const ROTULO_PROPOSTA: Record<StatusProposta, string> = { enviada: 'Enviada', aceita: 'Aceita', recusada: 'Recusada', expirada: 'Expirada' }

export interface ConfigCrm {
  origens: string[]
  motivosPerda: string[]
  atualizadoPorNome: string
  atualizadoEmMs: number
}

/** Campos sem dados pessoais (a franqueadora lê só isto). */
export interface Lead {
  id: string
  unidadeId: string
  unidadeNome: string
  origem: string
  valorEstimadoCentavos: number | null
  etapa: Etapa
  motivoPerda: string
  responsavelUid: string
  responsavelNome: string
  proximoContatoMs: number
  ultimaAtividadeMs: number
  arquivado: boolean
  criadoEmMs: number
  etapaEmMs: number
  fechadoEmMs: number
  atualizadoPorNome: string
}

/** Dados pessoais do cliente e o interesse em texto livre: só a unidade lê. */
export interface Contato {
  id: string
  nome: string
  telefone: string
  email: string
  interesseTamanho: string
  interessePeriodo: string
  interesseUso: string
}

export interface Atividade {
  id: string
  leadId: string
  tipo: TipoAtividade
  texto: string
  nome: string
  geradoPorIA: boolean
  iaModelo: string
  criadoEmMs: number
}

export interface Proposta {
  id: string
  leadId: string
  box: string
  precoMensalCentavos: number
  periodoMeses: number
  validadeMs: number
  status: StatusProposta
  obs: string
  geradoPorIA: boolean
  iaModelo: string
  criadoEmMs: number
  atualizadoPorNome: string
}

export interface LeadForm {
  nome: string
  telefone: string
  email: string
  origem: string
  interesseTamanho: string
  interessePeriodo: string
  interesseUso: string
  valorEstimado: string
  responsavelUid: string
  proximoContato: string
}

export const fechado = (etapa: Etapa) => etapa === 'ganho' || etapa === 'perdido'

const TELEFONE = /^[0-9 ()+.-]{0,30}$/
const EMAIL = /^[^@ ]+@[^@ ]+[.][^@ ]+$/

export function validarContato(c: Pick<LeadForm, 'nome' | 'telefone' | 'email'>): string[] {
  const erros: string[] = []
  const nome = c.nome.trim()
  if (nome.length < 2 || nome.length > 120) erros.push('O nome do cliente precisa ter de 2 a 120 caracteres.')
  if (!TELEFONE.test(c.telefone.trim())) erros.push('Telefone: use só números, espaços, parênteses, + e -.')
  const email = c.email.trim()
  if (email && (email.length > 120 || !EMAIL.test(email))) erros.push('E-mail inválido.')
  if (!c.telefone.trim() && !email) erros.push('Informe telefone ou e-mail para conseguir retornar.')
  return erros
}

export function validarLead(f: LeadForm, origens: string[]): string[] {
  const erros = validarContato(f)
  if (!origens.includes(f.origem)) erros.push('Escolha a origem do lead.')
  if (!f.responsavelUid) erros.push('Escolha o responsável.')
  if (f.valorEstimado.trim() && centavos(f.valorEstimado) === null) erros.push('Valor estimado inválido (ex.: 289,90).')
  return erros
}

/** "289,90" → 28990; vazio → null; inválido → null (validarLead acusa). */
export function centavos(texto: string): number | null {
  const limpo = texto.trim().replace(/^R\$\s*/i, '').replace(/\./g, '').replace(',', '.')
  if (!limpo || !/^\d+(\.\d{1,2})?$/.test(limpo)) return null
  const v = Math.round(Number(limpo) * 100)
  return v <= 100_000_000 ? v : null
}

export function formatarReais(c: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)
}

/** Follow-up vencido: lead aberto, não arquivado, com próximo contato antes de agora. */
export function atrasado(l: Pick<Lead, 'etapa' | 'arquivado' | 'proximoContatoMs'>, agora: number): boolean {
  return !l.arquivado && !fechado(l.etapa) && l.proximoContatoMs > 0 && l.proximoContatoMs < agora
}

export function followUps(leads: Lead[], agora: number): { atrasados: Lead[]; hoje: Lead[]; semData: Lead[] } {
  const fimDoDia = new Date(agora)
  fimDoDia.setHours(23, 59, 59, 999)
  const abertos = leads.filter((l) => !l.arquivado && !fechado(l.etapa))
  return {
    atrasados: abertos.filter((l) => atrasado(l, agora)).sort((a, b) => a.proximoContatoMs - b.proximoContatoMs),
    hoje: abertos.filter((l) => l.proximoContatoMs >= agora && l.proximoContatoMs <= fimDoDia.getTime()).sort((a, b) => a.proximoContatoMs - b.proximoContatoMs),
    semData: abertos.filter((l) => !l.proximoContatoMs),
  }
}

export function porEtapa(leads: Lead[], mostrarArquivados = false): Record<Etapa, Lead[]> {
  const grupos = Object.fromEntries(ETAPAS.map((e) => [e, [] as Lead[]])) as Record<Etapa, Lead[]>
  for (const l of leads) if (mostrarArquivados || !l.arquivado) grupos[l.etapa].push(l)
  for (const e of ETAPAS) grupos[e].sort((a, b) => (a.proximoContatoMs || Infinity) - (b.proximoContatoMs || Infinity) || b.criadoEmMs - a.criadoEmMs)
  return grupos
}

export interface Kpis {
  total: number
  abertos: number
  ganhos: number
  perdidos: number
  /** ganhos / (ganhos + perdidos), em %; null sem lead fechado. */
  conversao: number | null
  /** média em dias entre criação e fechamento ganho; null sem ganho. */
  diasParaFechar: number | null
  atrasados: number
  valorGanhoCentavos: number
  porOrigem: { origem: string; total: number; ganhos: number }[]
  porEtapa: Record<Etapa, number>
  motivosPerda: { motivo: string; total: number }[]
}

const DIA = 86_400_000

/** KPIs só com campos sem dados pessoais (servem para a unidade e para a franqueadora). Arquivados contam no histórico. */
export function calcularKpis(leads: Lead[], agora: number, desdeMs = 0): Kpis {
  const lista = leads.filter((l) => l.criadoEmMs >= desdeMs)
  const ganhos = lista.filter((l) => l.etapa === 'ganho')
  const perdidos = lista.filter((l) => l.etapa === 'perdido')
  const comTempo = ganhos.filter((l) => l.fechadoEmMs && l.criadoEmMs)
  const origens = new Map<string, { total: number; ganhos: number }>()
  for (const l of lista) {
    const o = origens.get(l.origem) ?? { total: 0, ganhos: 0 }
    o.total += 1
    if (l.etapa === 'ganho') o.ganhos += 1
    origens.set(l.origem, o)
  }
  const motivos = new Map<string, number>()
  for (const l of perdidos) motivos.set(l.motivoPerda, (motivos.get(l.motivoPerda) ?? 0) + 1)
  const etapas = Object.fromEntries(ETAPAS.map((e) => [e, lista.filter((l) => l.etapa === e).length])) as Record<Etapa, number>
  return {
    total: lista.length,
    abertos: lista.filter((l) => !fechado(l.etapa) && !l.arquivado).length,
    ganhos: ganhos.length,
    perdidos: perdidos.length,
    conversao: ganhos.length + perdidos.length ? Math.round((ganhos.length * 100) / (ganhos.length + perdidos.length)) : null,
    diasParaFechar: comTempo.length ? Math.round((comTempo.reduce((s, l) => s + (l.fechadoEmMs - l.criadoEmMs), 0) / comTempo.length / DIA) * 10) / 10 : null,
    atrasados: lista.filter((l) => atrasado(l, agora)).length,
    valorGanhoCentavos: ganhos.reduce((s, l) => s + (l.valorEstimadoCentavos ?? 0), 0),
    porOrigem: [...origens.entries()].map(([origem, v]) => ({ origem, ...v })).sort((a, b) => b.total - a.total || a.origem.localeCompare(b.origem, 'pt-BR')),
    porEtapa: etapas,
    motivosPerda: [...motivos.entries()].map(([motivo, total]) => ({ motivo, total })).sort((a, b) => b.total - a.total),
  }
}

export interface KpiUnidade extends Kpis {
  unidadeId: string
  unidadeNome: string
}

export function kpisPorUnidade(leads: Lead[], agora: number, desdeMs = 0): KpiUnidade[] {
  const nomes = new Map<string, string>()
  for (const l of leads) if (!nomes.has(l.unidadeId)) nomes.set(l.unidadeId, l.unidadeNome || l.unidadeId)
  return [...nomes.entries()]
    .map(([unidadeId, unidadeNome]) => ({ unidadeId, unidadeNome, ...calcularKpis(leads.filter((l) => l.unidadeId === unidadeId), agora, desdeMs) }))
    .sort((a, b) => (b.conversao ?? -1) - (a.conversao ?? -1) || a.unidadeNome.localeCompare(b.unidadeNome, 'pt-BR'))
}

/** Lista de configuração: aparar, sem vazios nem repetidos, até 20 itens de até 40 caracteres. */
export function normalizarLista(textos: string[]): string[] {
  const vistos = new Set<string>()
  const saida: string[] = []
  for (const t of textos) {
    const v = t.trim().slice(0, 40)
    if (!v || vistos.has(v.toLowerCase())) continue
    vistos.add(v.toLowerCase())
    saida.push(v)
  }
  return saida.slice(0, MAX_LISTA_CONFIG)
}

export function validarProposta(box: string, preco: string, periodoMeses: number, validade: string, agora: number): string[] {
  const erros: string[] = []
  if (!box.trim() || box.trim().length > 60) erros.push('Informe o box (até 60 caracteres).')
  const c = centavos(preco)
  if (c === null || c <= 0) erros.push('Informe o preço mensal (ex.: 289,90).')
  if (!Number.isInteger(periodoMeses) || periodoMeses < 1 || periodoMeses > 120) erros.push('Período de 1 a 120 meses.')
  const v = validade ? new Date(`${validade}T23:59:59`).getTime() : 0
  if (!v || v <= agora) erros.push('A validade precisa ser uma data futura.')
  return erros
}

export function podeGerirCrm(
  usuario: { papel: string; ativo?: boolean; modulosLiberados?: string[] } | null | undefined,
  ehAdmin: boolean,
): boolean {
  if (!usuario) return false
  if (ehAdmin) return true
  return usuario.papel === 'equipe_franqueadora' && usuario.ativo !== false && (usuario.modulosLiberados ?? []).includes('crm')
}

export function fazCrm(usuario: { papel: string } | null | undefined): boolean {
  return usuario?.papel === 'franqueado' || usuario?.papel === 'equipe_franqueado'
}
