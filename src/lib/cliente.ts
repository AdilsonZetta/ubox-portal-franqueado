// Módulo 12: Painel do Cliente. Regras puras (sem Firebase) para cadastro, cobranças, visitas, recados e o link público.

export type StatusCliente = 'ativo' | 'encerrado'
export type StatusCobranca = 'pendente' | 'pago'
export type SituacaoCobranca = 'pago' | 'pendente' | 'atrasado'
export type StatusVisita = 'agendada' | 'realizada' | 'cancelada'

export const MAX_COBRANCAS = 24
export const MAX_VISITAS = 10
export const MAX_RECADOS = 10

/** Cadastro do locatário com dados pessoais: só a unidade lê. */
export interface Cliente {
  id: string
  unidadeId: string
  nome: string
  telefone: string
  email: string
  box: string
  contratoInicioMs: number
  contratoFimMs: number
  valorMensalCentavos: number
  diaVencimento: number
  status: StatusCliente
  painelToken: string
  obs: string
  criadoEmMs: number
  atualizadoPorNome: string
  atualizadoEmMs: number
}

export interface Cobranca {
  id: string
  competencia: string // AAAA-MM
  valorCentavos: number
  vencimento: string // AAAA-MM-DD
  status: StatusCobranca
  pagoEm: string // AAAA-MM-DD ou ''
}

export interface Visita {
  id: string
  data: string // AAAA-MM-DD
  hora: string // HH:MM
  motivo: string
  status: StatusVisita
}

export interface Recado {
  id: string
  texto: string
  emMs: number
  autor: string // só o primeiro nome de quem escreveu
  geradoPorIA: boolean
  iaModelo: string
}

/** O que o locatário vê pelo link (sem telefone, e-mail ou sobrenome). */
export interface Painel {
  token: string
  unidadeId: string
  unidadeNome: string
  contatoUnidade: string
  clienteId: string
  primeiroNome: string
  box: string
  contratoInicioMs: number
  contratoFimMs: number
  valorMensalCentavos: number
  diaVencimento: number
  cobrancas: Cobranca[]
  visitas: Visita[]
  recados: Recado[]
  ativo: boolean
  atualizadoEmMs: number
}

export interface ClienteForm {
  nome: string
  telefone: string
  email: string
  box: string
  contratoInicio: string // AAAA-MM-DD
  contratoFim: string // AAAA-MM-DD ou ''
  valorMensal: string // "289,90"
  diaVencimento: string
  obs: string
}

export const ROTULO_SITUACAO: Record<SituacaoCobranca, string> = { pago: 'Paga', pendente: 'Em aberto', atrasado: 'Atrasada' }
export const ROTULO_VISITA: Record<StatusVisita, string> = { agendada: 'Agendada', realizada: 'Realizada', cancelada: 'Cancelada' }

type Sorteio = (n: number) => Uint8Array
const sortear: Sorteio = (n) => { const b = new Uint8Array(new ArrayBuffer(n)); crypto.getRandomValues(b); return b }
const hexa = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/** Token do link público: 128 bits aleatórios (32 hex). */
export function gerarToken(aleatorio: Sorteio = sortear): string {
  return hexa(aleatorio(16))
}

export const tokenValido = (t: string) => /^[0-9a-f]{32}$/.test(t)

export function idCurto(aleatorio: Sorteio = sortear): string {
  return hexa(aleatorio(6))
}

/** Só a primeira palavra do nome, sem espaços, até 40 caracteres (o que as rules aceitam no painel). */
export function primeiroNomeDe(nome: string): string {
  return (nome.trim().split(/\s+/)[0] ?? '').slice(0, 40)
}

export function centavos(valor: string): number {
  const limpo = valor.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}

export function formatarReais(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export const hojeISO = (agora = Date.now()) => {
  const d = new Date(agora)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatarDiaISO(iso: string): string {
  const [a, m, d] = iso.split('-')
  return a && m && d ? `${d}/${m}/${a}` : iso
}

export function formatarCompetencia(c: string): string {
  const [a, m] = c.split('-').map(Number)
  if (!a || !m) return c
  const t = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function situacao(c: Cobranca, hoje: string): SituacaoCobranca {
  if (c.status === 'pago') return 'pago'
  return c.vencimento < hoje ? 'atrasado' : 'pendente'
}

export interface ResumoCobrancas {
  emAbertoCentavos: number
  atrasadoCentavos: number
  atrasadas: number
  proxima: Cobranca | null
}

export function resumoCobrancas(lista: Cobranca[], hoje: string): ResumoCobrancas {
  let emAbertoCentavos = 0
  let atrasadoCentavos = 0
  let atrasadas = 0
  let proxima: Cobranca | null = null
  for (const c of lista) {
    const s = situacao(c, hoje)
    if (s === 'pago') continue
    emAbertoCentavos += c.valorCentavos
    if (s === 'atrasado') {
      atrasadoCentavos += c.valorCentavos
      atrasadas += 1
    } else if (!proxima || c.vencimento < proxima.vencimento) proxima = c
  }
  return { emAbertoCentavos, atrasadoCentavos, atrasadas, proxima }
}

/** Vencimento sugerido da competência AAAA-MM no dia do contrato. */
export function vencimentoDe(competencia: string, dia: number): string {
  return `${competencia}-${String(Math.min(Math.max(dia, 1), 28)).padStart(2, '0')}`
}

/** Próxima competência ainda sem cobrança (a partir do mês atual). */
export function proximaCompetencia(lista: Cobranca[], agora = Date.now()): string {
  const d = new Date(agora)
  for (let i = 0; i < 36; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1)
    const c = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
    if (!lista.some((x) => x.competencia === c)) return c
  }
  return hojeISO(agora).slice(0, 7)
}

export const ordenarCobrancas = (l: Cobranca[]) => [...l].sort((a, b) => b.competencia.localeCompare(a.competencia))
export const ordenarVisitas = (l: Visita[]) => [...l].sort((a, b) => `${b.data}${b.hora}`.localeCompare(`${a.data}${a.hora}`))

/**
 * Inclui uma cobrança respeitando o limite do painel: se cheio, sai a paga mais antiga.
 * Retorna null quando todas estão em aberto (a unidade precisa baixar alguma antes).
 */
export function incluirCobranca(lista: Cobranca[], nova: Cobranca): Cobranca[] | null {
  if (lista.some((c) => c.competencia === nova.competencia)) return null
  const base = [...lista]
  if (base.length >= MAX_COBRANCAS) {
    const pagas = base.filter((c) => c.status === 'pago').sort((a, b) => a.competencia.localeCompare(b.competencia))
    if (!pagas.length) return null
    base.splice(base.indexOf(pagas[0]), 1)
  }
  return ordenarCobrancas([...base, nova])
}

/** Visitas: se cheio, sai a mais antiga já realizada/cancelada. */
export function incluirVisita(lista: Visita[], nova: Visita): Visita[] | null {
  const base = [...lista]
  if (base.length >= MAX_VISITAS) {
    const fechadas = base.filter((v) => v.status !== 'agendada').sort((a, b) => `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`))
    if (!fechadas.length) return null
    base.splice(base.indexOf(fechadas[0]), 1)
  }
  return ordenarVisitas([...base, nova])
}

/** Recados: os 10 mais recentes. */
export function incluirRecado(lista: Recado[], novo: Recado): Recado[] {
  return [novo, ...lista].sort((a, b) => b.emMs - a.emMs).slice(0, MAX_RECADOS)
}

export function validarCliente(f: ClienteForm): string[] {
  const erros: string[] = []
  if (f.nome.trim().length < 2) erros.push('Informe o nome do cliente.')
  if (!/^[0-9 ()+.-]{0,30}$/.test(f.telefone.trim())) erros.push('Telefone só com números, espaços, parênteses, + . e -.')
  if (f.email.trim() && !/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(f.email.trim())) erros.push('E-mail inválido.')
  if (!f.box.trim()) erros.push('Informe o box.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.contratoInicio)) erros.push('Informe o início do contrato.')
  if (f.contratoFim && f.contratoFim < f.contratoInicio) erros.push('O fim do contrato não pode ser antes do início.')
  const v = centavos(f.valorMensal)
  if (!f.valorMensal.trim() || !Number.isFinite(v) || v < 0 || v > 100_000_000) erros.push('Mensalidade inválida.')
  const d = Number(f.diaVencimento)
  if (!Number.isInteger(d) || d < 1 || d > 28) erros.push('Dia de vencimento entre 1 e 28.')
  return erros
}

export function validarCobranca(c: { competencia: string; valor: string; vencimento: string }): string[] {
  const erros: string[] = []
  if (!/^\d{4}-\d{2}$/.test(c.competencia)) erros.push('Informe o mês de referência.')
  const v = centavos(c.valor)
  if (!Number.isFinite(v) || v <= 0) erros.push('Valor inválido.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.vencimento)) erros.push('Informe o vencimento.')
  return erros
}

export function validarRecado(texto: string, ia: boolean, modelo: string): string[] {
  const erros: string[] = []
  if (texto.trim().length < 2 || texto.trim().length > 500) erros.push('O recado deve ter de 2 a 500 caracteres.')
  if (ia && modelo.trim().length < 2) erros.push('Informe qual IA ajudou no texto.')
  return erros
}

export function linkPainel(token: string, origem = typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}`): string {
  return `${origem}#/painel/${token}`
}

export interface KpisClientes {
  ativos: number
  receitaMensalCentavos: number
  atrasadoCentavos: number
  clientesEmAtraso: number
  linksAtivos: number
}

export function kpisClientes(clientes: Cliente[], paineis: Map<string, Painel>, hoje: string): KpisClientes {
  let ativos = 0
  let receitaMensalCentavos = 0
  let atrasadoCentavos = 0
  let clientesEmAtraso = 0
  let linksAtivos = 0
  for (const c of clientes) {
    if (c.status !== 'ativo') continue
    ativos += 1
    receitaMensalCentavos += c.valorMensalCentavos
    const p = paineis.get(c.id)
    if (!p) continue
    if (p.ativo) linksAtivos += 1
    const r = resumoCobrancas(p.cobrancas, hoje)
    if (r.atrasadas) {
      clientesEmAtraso += 1
      atrasadoCentavos += r.atrasadoCentavos
    }
  }
  return { ativos, receitaMensalCentavos, atrasadoCentavos, clientesEmAtraso, linksAtivos }
}

export function fazCliente(usuario: { papel: string; modulosLiberados?: string[] } | null | undefined): boolean {
  return (usuario?.papel === 'franqueado' || usuario?.papel === 'equipe_franqueado') && (usuario.modulosLiberados ?? []).includes('cliente')
}
