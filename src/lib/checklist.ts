// Módulo 7: Checklist Operacional. Lógica pura (sem Firebase), testada no Vitest.
import { linkHttpsValido } from './marketing'

export const TIPOS_CHECKLIST = ['abertura', 'fechamento', 'limpeza', 'inauguracao', 'vistoria', 'outro'] as const
export type TipoChecklist = (typeof TIPOS_CHECKLIST)[number]
export const ROTULO_TIPO_CK: Record<TipoChecklist, string> = {
  abertura: 'Abertura',
  fechamento: 'Fechamento',
  limpeza: 'Limpeza',
  inauguracao: 'Inauguração',
  vistoria: 'Vistoria',
  outro: 'Outro',
}

export const FREQUENCIAS = ['diaria', 'semanal', 'mensal', 'avulsa'] as const
export type Frequencia = (typeof FREQUENCIAS)[number]
export const ROTULO_FREQ: Record<Frequencia, string> = { diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal', avulsa: 'Avulsa' }

export const RESULTADOS = ['ok', 'nao_ok', 'na'] as const
export type Resultado = (typeof RESULTADOS)[number]
export const ROTULO_RESULTADO: Record<Resultado, string> = { ok: 'OK', nao_ok: 'Não OK', na: 'N/A' }

export const MAX_ITENS = 60
export const PESO_MAX = 10

export interface ItemModelo {
  id: string
  texto: string
  secao: string
  peso: number
  exigeEvidencia: boolean
  exigeObs: boolean
}

export interface ModeloChecklist {
  id: string
  titulo: string
  descricao: string
  tipo: TipoChecklist
  frequencia: Frequencia
  horarioLiberacao?: string | null
  itens: ItemModelo[]
  totalItens: number
  pesoTotal: number
  versao: number
  publico: boolean
  unidades: string[]
  ativo: boolean
  geradoPorIA: boolean
  iaModelo: string
  criadoEmMs: number
  atualizadoPorNome: string
  atualizadoEmMs: number
}

export interface Resposta {
  itemId: string
  texto: string
  secao: string
  peso: number
  resultado: Resultado | ''
  obs: string
  evidenciaUrl: string
}

export interface Totais {
  totalItens: number
  qtdOk: number
  qtdNaoOk: number
  qtdNa: number
  pontosObtidos: number
  pontosPossiveis: number
  score: number
}

/**
 * Execução de checklist. Imutável depois do envio (só a observação do proprietário muda).
 * O Módulo 8 (Auditoria) pode referenciar `checklistExecucoes/{id}` e usar `score`,
 * `qtdNaoOk`, `modeloId`/`modeloVersao`, `unidadeId` e `criadoEm` (hora do servidor);
 * `respostas` guarda a cópia dos itens como estavam no envio.
 */
export interface ExecucaoChecklist extends Totais {
  id: string
  modeloId: string
  modeloTitulo: string
  modeloVersao: number
  tipo: TipoChecklist
  frequencia: Frequencia
  unidadeId: string
  unidadeNome: string
  uid: string
  nome: string
  respostas: Resposta[]
  obsGeral: string
  obsProprietario: string
  obsProprietarioNome: string
  obsProprietarioEmMs: number
  criadoEmMs: number
}

const HORA_BRASILIA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
})

export function horarioValido(h: unknown): h is string {
  return typeof h === 'string' && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(h)
}

export function liberacaoChecklist(
  modelo: Pick<ModeloChecklist, 'horarioLiberacao'>,
  agora: Date,
): { liberado: boolean; horario: string | null } {
  const horario = modelo.horarioLiberacao
  if (!horarioValido(horario)) return { liberado: true, horario: null }
  // HH:MM tem largura fixa e ordena da mesma forma que os minutos do dia.
  return { liberado: HORA_BRASILIA.format(agora) >= horario, horario }
}

const DIA = 86_400_000

/** Pontuação: N/A fica fora da conta; sem itens pontuáveis vale 100%. Mesma conta das rules. */
export function calcularTotais(respostas: Pick<Resposta, 'peso' | 'resultado'>[]): Totais {
  let qtdOk = 0
  let qtdNaoOk = 0
  let qtdNa = 0
  let pontosObtidos = 0
  let pontosPossiveis = 0
  for (const r of respostas) {
    const peso = pesoValido(r.peso)
    if (r.resultado === 'ok') {
      qtdOk++
      pontosObtidos += peso
      pontosPossiveis += peso
    } else if (r.resultado === 'nao_ok') {
      qtdNaoOk++
      pontosPossiveis += peso
    } else if (r.resultado === 'na') qtdNa++
  }
  const score = pontosPossiveis === 0 ? 100 : Math.floor((pontosObtidos * 100) / pontosPossiveis)
  return { totalItens: respostas.length, qtdOk, qtdNaoOk, qtdNa, pontosObtidos, pontosPossiveis, score }
}

export function pesoValido(peso: unknown): number {
  const n = Math.round(Number(peso))
  return Number.isFinite(n) ? Math.min(PESO_MAX, Math.max(1, n)) : 1
}

/** Recalcula pelas respostas e compara com o que foi gravado (detecta total adulterado). */
export function totaisConferem(
  e: Pick<ExecucaoChecklist, 'respostas' | 'score' | 'qtdNaoOk' | 'qtdOk' | 'qtdNa' | 'pontosObtidos' | 'pontosPossiveis'>,
): boolean {
  const t = calcularTotais(e.respostas)
  return (
    t.score === e.score &&
    t.qtdNaoOk === e.qtdNaoOk &&
    t.qtdOk === e.qtdOk &&
    t.qtdNa === e.qtdNa &&
    t.pontosObtidos === e.pontosObtidos &&
    t.pontosPossiveis === e.pontosPossiveis
  )
}

/** Mudanças que sobem a versão do modelo (mesma regra das rules). */
export function versaoMuda(
  antes: Pick<ModeloChecklist, 'itens' | 'titulo' | 'tipo' | 'frequencia' | 'pesoTotal'>,
  depois: Pick<ModeloChecklist, 'itens' | 'titulo' | 'tipo' | 'frequencia' | 'pesoTotal'>,
): boolean {
  return (
    itensMudaram(antes.itens, depois.itens) ||
    antes.titulo !== depois.titulo ||
    antes.tipo !== depois.tipo ||
    antes.frequencia !== depois.frequencia ||
    antes.pesoTotal !== depois.pesoTotal
  )
}

export function respostasIniciais(modelo: Pick<ModeloChecklist, 'itens'>): Resposta[] {
  return modelo.itens.map((i) => ({ itemId: i.id, texto: i.texto, secao: i.secao, peso: pesoValido(i.peso), resultado: '', obs: '', evidenciaUrl: '' }))
}

/** Erros por item (índice) e gerais antes de enviar. */
export function validarExecucao(modelo: Pick<ModeloChecklist, 'itens'>, respostas: Resposta[]): { porItem: Record<string, string>; gerais: string[] } {
  const porItem: Record<string, string> = {}
  const gerais: string[] = []
  if (respostas.length !== modelo.itens.length) gerais.push('O checklist mudou. Recarregue a página.')
  modelo.itens.forEach((item, i) => {
    const r = respostas[i]
    if (!r || r.itemId !== item.id) return
    if (!r.resultado) porItem[item.id] = 'Marque OK, Não OK ou N/A.'
    else if (r.evidenciaUrl.trim() && !linkHttpsValido(r.evidenciaUrl.trim())) porItem[item.id] = 'O link da evidência precisa começar com https://.'
    else if (r.resultado !== 'na' && item.exigeEvidencia && !r.evidenciaUrl.trim()) porItem[item.id] = 'Este item exige o link da foto ou evidência.'
    else if (r.resultado !== 'na' && item.exigeObs && r.obs.trim().length < 2) porItem[item.id] = 'Este item exige uma observação.'
    else if (r.resultado === 'nao_ok' && r.obs.trim().length < 2) porItem[item.id] = 'Explique o que não está OK.'
    else if (r.obs.length > 500) porItem[item.id] = 'A observação aceita até 500 caracteres.'
  })
  const faltando = Object.keys(porItem).length
  if (faltando) gerais.push(`${faltando} item(ns) precisam de atenção.`)
  return { porItem, gerais }
}

export interface ModeloForm {
  horarioLiberacao?: string | null
  titulo: string
  descricao: string
  tipo: TipoChecklist
  frequencia: Frequencia
  itens: ItemModelo[]
  publico: boolean
  unidades: string[]
  ativo: boolean
  geradoPorIA: boolean
  iaModelo: string
}

export function validarModelo(f: ModeloForm): string[] {
  const erros: string[] = []
  if (f.horarioLiberacao != null && !horarioValido(f.horarioLiberacao)) {
    erros.push('Informe um horário de liberação válido no formato HH:MM.')
  }
  if (f.titulo.trim().length < 2 || f.titulo.trim().length > 120) erros.push('O título precisa ter de 2 a 120 caracteres.')
  if (!f.itens.length) erros.push('Inclua ao menos um item.')
  if (f.itens.length > MAX_ITENS) erros.push(`Um checklist aceita até ${MAX_ITENS} itens.`)
  if (f.itens.some((i) => i.texto.trim().length < 2)) erros.push('Todo item precisa de um texto.')
  if (f.itens.some((i) => i.texto.length > 300 || i.secao.length > 60)) erros.push('Item com texto acima de 300 caracteres ou seção acima de 60.')
  if (new Set(f.itens.map((i) => i.id)).size !== f.itens.length) erros.push('Há itens repetidos.')
  if (!f.publico && !f.unidades.length) erros.push('Escolha ao menos uma unidade ou deixe para a rede toda.')
  if (f.unidades.length > 30) erros.push('Direcione para no máximo 30 unidades; acima disso, use a rede toda.')
  if (f.geradoPorIA && f.iaModelo.trim().length < 2) erros.push('Informe qual IA ou modelo participou da criação.')
  return erros
}

export function pesoTotalDe(itens: Pick<ItemModelo, 'peso'>[]): number {
  return itens.reduce((s, i) => s + pesoValido(i.peso), 0)
}

/** Itens mudaram (texto, seção, peso, exigências ou ordem)? Se sim, a versão sobe. */
export function itensMudaram(antes: ItemModelo[], depois: ItemModelo[]): boolean {
  return JSON.stringify(antes.map(normalizarItem)) !== JSON.stringify(depois.map(normalizarItem))
}

export function normalizarItem(i: ItemModelo): ItemModelo {
  return { id: i.id, texto: i.texto.trim().slice(0, 300), secao: i.secao.trim().slice(0, 60), peso: pesoValido(i.peso), exigeEvidencia: i.exigeEvidencia, exigeObs: i.exigeObs }
}

export function novoItemId(existentes: Pick<ItemModelo, 'id'>[]): string {
  let n = existentes.length + 1
  const usados = new Set(existentes.map((i) => i.id))
  while (usados.has(`i${n}`)) n++
  return `i${n}`
}

/** Agrupa respostas/itens por seção, preservando a ordem. */
export function porSecao<T extends { secao: string }>(lista: T[]): { secao: string; itens: { item: T; indice: number }[] }[] {
  const grupos: { secao: string; itens: { item: T; indice: number }[] }[] = []
  lista.forEach((item, indice) => {
    const secao = item.secao.trim()
    let g = grupos.find((x) => x.secao === secao)
    if (!g) {
      g = { secao, itens: [] }
      grupos.push(g)
    }
    g.itens.push({ item, indice })
  })
  return grupos
}

// ---------- Períodos, pendências e atrasos (como no Konclui) ----------

function diaLocal(ms: number): Date {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Início do período (horário local) que contém `ms`. Semana começa na segunda. */
export function inicioPeriodo(freq: Exclude<Frequencia, 'avulsa'>, ms: number): number {
  const d = diaLocal(ms)
  if (freq === 'diaria') return d.getTime()
  if (freq === 'mensal') return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  const dia = (d.getDay() + 6) % 7
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dia).getTime()
}

export function periodoAnterior(freq: Exclude<Frequencia, 'avulsa'>, inicioMs: number): number {
  const d = new Date(inicioMs)
  if (freq === 'diaria') return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime()
  if (freq === 'semanal') return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7).getTime()
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime()
}

export interface VigenciaChecklist {
  id: string
  modeloId: string
  unidadeId: string
  inicio: string // YYYY-MM-DD
  primeiroVencimento: string // YYYY-MM-DD
  registradoPorNome: string
  registradoEmMs: number
}

type DatasVigencia = Pick<VigenciaChecklist, 'inicio' | 'primeiroVencimento'>
type FrequenciaRecorrente = Exclude<Frequencia, 'avulsa'>

function dataISOlocal(data: Date): string {
  const ano = String(data.getFullYear()).padStart(4, '0')
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export function dataLocalMs(iso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso.startsWith('0000')) return NaN
  const data = new Date(`${iso}T00:00:00`)
  return dataISOlocal(data) === iso ? data.getTime() : NaN
}

/** Limite exclusivo do período, em horário local. */
export function fimPeriodo(freq: FrequenciaRecorrente, inicioMs: number): number {
  const d = new Date(inicioMs)
  if (freq === 'mensal') d.setMonth(d.getMonth() + 1, 1)
  else d.setDate(d.getDate() + (freq === 'semanal' ? 7 : 1))
  return d.setHours(0, 0, 0, 0)
}

export function vigenciaDe(vigencias: VigenciaChecklist[], modeloId: string, unidadeId: string) {
  return vigencias.find((v) => v.modeloId === modeloId && v.unidadeId === unidadeId)
}

export function validarVigencia({ inicio, primeiroVencimento }: DatasVigencia, _hojeISO: string): string[] {
  const erros: string[] = []
  if (!Number.isFinite(dataLocalMs(inicio))) erros.push('Informe uma data válida para o início da responsabilidade.')
  if (!Number.isFinite(dataLocalMs(primeiroVencimento))) erros.push('Informe uma data válida para o primeiro vencimento.')
  if (!erros.length && primeiroVencimento < inicio) erros.push('O primeiro vencimento deve ser na data de início ou depois.')
  return erros
}

export function primeiroVencimentoPadrao(freq: Frequencia, inicioISO: string): string {
  const inicio = dataLocalMs(inicioISO)
  if (!Number.isFinite(inicio)) return ''
  if (freq === 'avulsa') return inicioISO
  return dataISOlocal(new Date(fimPeriodo(freq, inicioPeriodo(freq, inicio)) - 1))
}

/** Amplia o histórico enquanto uma execução na primeira janela ainda pode valer. */
export function inicioHistoricoVigencias(
  vigencias: VigenciaChecklist[], modelos: Pick<ModeloChecklist, 'id' | 'frequencia'>[], agoraMs: number, deMs: number,
): number {
  const frequencias = new Map(modelos.map((m) => [m.id, m.frequencia]))
  for (const v of vigencias) {
    const freq = frequencias.get(v.modeloId)
    if (!freq || freq === 'avulsa') continue
    const anterior = periodoAnterior(freq, inicioPeriodo(freq, agoraMs))
    if (anterior < fimPeriodo('diaria', dataLocalMs(v.primeiroVencimento))) {
      deMs = Math.min(deMs, dataLocalMs(v.inicio))
    }
  }
  return deMs
}

export const ROTULO_PERIODO: Record<Exclude<Frequencia, 'avulsa'>, string> = { diaria: 'hoje', semanal: 'nesta semana', mensal: 'neste mês' }

export type Situacao = 'em_dia' | 'pendente' | 'atrasado' | 'avulso'
export const ROTULO_SITUACAO: Record<Situacao, string> = { em_dia: 'Em dia', pendente: 'Pendente', atrasado: 'Atrasado', avulso: 'Avulso' }

export function situacaoModelo(
  modelo: Pick<ModeloChecklist, 'id' | 'frequencia' | 'criadoEmMs'>,
  execucoes: Pick<ExecucaoChecklist, 'modeloId' | 'criadoEmMs'>[],
  agoraMs: number,
  vigencia?: DatasVigencia | null,
): { situacao: Situacao; ultimaMs: number | null; venceEmMs: number | null; primeiroVencimentoMs: number | null; aguardandoInicio: boolean } {
  const freq = modelo.frequencia
  const inicio = vigencia && freq !== 'avulsa' ? dataLocalMs(vigencia.inicio) : -Infinity
  const doModelo = execucoes.filter((e) => e.modeloId === modelo.id && e.criadoEmMs >= inicio)
  const ultimaMs = doModelo.reduce<number | null>((ultima, e) => Math.max(ultima ?? -Infinity, e.criadoEmMs), null)
  const padrao = { ultimaMs, venceEmMs: null, primeiroVencimentoMs: null, aguardandoInicio: false }
  if (freq === 'avulsa') return { ...padrao, situacao: 'avulso' }

  const atual = inicioPeriodo(freq, agoraMs)
  const anterior = periodoAnterior(freq, atual)
  const regular = { ...padrao, venceEmMs: fimPeriodo(freq, atual) }
  const feita = (de: number, ate = Infinity) => doModelo.some((e) => e.criadoEmMs >= de && e.criadoEmMs < ate)

  if (!vigencia) {
    if (feita(atual)) return { ...regular, situacao: 'em_dia' }
    return { ...regular, situacao: feita(anterior, atual) || modelo.criadoEmMs >= atual ? 'pendente' : 'atrasado' }
  }

  const primeiroVencimentoMs = fimPeriodo('diaria', dataLocalMs(vigencia.primeiroVencimento))
  if (agoraMs < primeiroVencimentoMs) {
    const aguardandoInicio = agoraMs < inicio
    return {
      ...padrao, aguardandoInicio, primeiroVencimentoMs, venceEmMs: primeiroVencimentoMs,
      situacao: !aguardandoInicio && feita(inicio, primeiroVencimentoMs) ? 'em_dia' : 'pendente',
    }
  }
  if (atual < primeiroVencimentoMs) {
    return { ...regular, situacao: doModelo.some((e) => e.criadoEmMs <= agoraMs) ? 'em_dia' : 'atrasado' }
  }
  if (feita(atual)) return { ...regular, situacao: 'em_dia' }
  const janelaAnterior = anterior >= primeiroVencimentoMs ? anterior : inicio
  return { ...regular, situacao: feita(janelaAnterior, atual) ? 'pendente' : 'atrasado' }
}

export interface NaoConformidade {
  execucaoId: string
  modeloTitulo: string
  unidadeId: string
  unidadeNome: string
  nome: string
  criadoEmMs: number
  texto: string
  secao: string
  obs: string
  evidenciaUrl: string
}

export function naoConformidades(execucoes: ExecucaoChecklist[]): NaoConformidade[] {
  const lista: NaoConformidade[] = []
  for (const e of execucoes) {
    for (const r of e.respostas) {
      if (r.resultado !== 'nao_ok') continue
      lista.push({
        execucaoId: e.id, modeloTitulo: e.modeloTitulo, unidadeId: e.unidadeId, unidadeNome: e.unidadeNome, nome: e.nome,
        criadoEmMs: e.criadoEmMs, texto: r.texto, secao: r.secao, obs: r.obs, evidenciaUrl: r.evidenciaUrl,
      })
    }
  }
  return lista.sort((a, b) => b.criadoEmMs - a.criadoEmMs)
}

export interface FiltroExecucoes {
  unidadeId?: string
  modeloId?: string
  deMs?: number | null
  ateMs?: number | null
  soComNaoConformidade?: boolean
}

/** `ateMs` é inclusivo até o fim do dia. */
export function filtrarExecucoes<T extends Pick<ExecucaoChecklist, 'unidadeId' | 'modeloId' | 'criadoEmMs' | 'qtdNaoOk'>>(lista: T[], f: FiltroExecucoes): T[] {
  return lista
    .filter((e) => !f.unidadeId || e.unidadeId === f.unidadeId)
    .filter((e) => !f.modeloId || e.modeloId === f.modeloId)
    .filter((e) => f.deMs == null || e.criadoEmMs >= f.deMs)
    .filter((e) => f.ateMs == null || e.criadoEmMs < f.ateMs + DIA)
    .filter((e) => !f.soComNaoConformidade || e.qtdNaoOk > 0)
    .sort((a, b) => b.criadoEmMs - a.criadoEmMs)
}

export function mediaScore(lista: Pick<ExecucaoChecklist, 'score'>[]): number | null {
  if (!lista.length) return null
  return Math.round(lista.reduce((s, e) => s + e.score, 0) / lista.length)
}

export type FaixaScore = 'bom' | 'atencao' | 'critico'
export function faixaScore(score: number): FaixaScore {
  if (score >= 90) return 'bom'
  if (score >= 70) return 'atencao'
  return 'critico'
}

export function modeloServeUnidade(m: Pick<ModeloChecklist, 'ativo' | 'publico' | 'unidades'>, unidadeId: string): boolean {
  return m.ativo && (m.publico || m.unidades.includes(unidadeId))
}

export function podeGerirChecklist(
  usuario: { papel: string; ativo?: boolean; modulosLiberados?: string[] } | null | undefined,
  ehAdmin: boolean,
): boolean {
  if (!usuario) return false
  if (ehAdmin) return true
  return usuario.papel === 'equipe_franqueadora' && usuario.ativo !== false && (usuario.modulosLiberados ?? []).includes('checklist')
}

export function fazChecklist(usuario: { papel: string } | null | undefined): boolean {
  return usuario?.papel === 'franqueado' || usuario?.papel === 'equipe_franqueado'
}

export interface ChaveRascunho {
  modeloId: string
  versao: number
  periodo: string
}

export interface RascunhoChecklist extends ChaveRascunho {
  respostas: Resposta[]
  obsGeral: string
  atualizadoEmMs: number
}

/** Preserva o mapeamento dos registros de execução que precedem os rascunhos. */
export function mapResposta(v: unknown, i: number): Resposta {
  const d = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const texto = (valor: unknown, padrao = '') => typeof valor === 'string' ? valor : padrao
  const resultado = d.resultado as Resultado
  return {
    itemId: texto(d.itemId, `i${i + 1}`),
    texto: texto(d.texto),
    secao: texto(d.secao),
    peso: pesoValido(d.peso),
    resultado: RESULTADOS.includes(resultado) ? resultado : '',
    obs: texto(d.obs),
    evidenciaUrl: texto(d.evidenciaUrl),
  }
}

export function mapRespostasRascunho(valor: unknown): Resposta[] {
  if (!Array.isArray(valor)) return []
  return valor.slice(0, MAX_ITENS).flatMap((r: unknown, i) => {
    if (!r || typeof r !== 'object' || !('itemId' in r) || typeof r.itemId !== 'string' || !r.itemId) return []
    const resposta = mapResposta(r, i)
    return [{
      ...resposta,
      obs: resposta.resultado === 'na' ? '' : resposta.obs.slice(0, 500),
      evidenciaUrl: resposta.resultado === 'na' ? '' : resposta.evidenciaUrl.slice(0, 600),
    }]
  })
}

export function mesclarRespostasRascunho(modelo: Pick<ModeloChecklist, 'itens'>, valor: unknown): Resposta[] {
  const porId = new Map(mapRespostasRascunho(valor).map((r) => [r.itemId, r]))
  return respostasIniciais(modelo).map((inicial) => {
    const r = porId.get(inicial.itemId)
    return r ? { ...inicial, resultado: r.resultado, obs: r.obs, evidenciaUrl: r.evidenciaUrl } : inicial
  })
}

const DATA_BRASILIA = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function periodoRascunho(frequencia: Frequencia, agoraMs: number): string {
  if (frequencia === 'avulsa') return 'avulsa'
  const dia = dataLocalMs(DATA_BRASILIA.format(agoraMs))
  return dataISOlocal(new Date(inicioPeriodo(frequencia, dia)))
}

export function horaRascunho(ms: number): string {
  return HORA_BRASILIA.format(ms)
}
