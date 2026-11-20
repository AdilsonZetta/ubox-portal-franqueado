/**
 * Lógica pura da trilha de Manuais e Processos (módulo 4).
 * Sem Firebase aqui: tudo que decide desbloqueio, tempo e rótulos é testável no Vitest.
 */

export const TEMPO_MINIMO_PISO_SEG = 30
export const TEMPO_MINIMO_TETO_SEG = 14400
export const PALAVRAS_POR_MINUTO = 200

export interface ItemTrilhaManual {
  documentoId: string
  titulo: string
  etapa: string
  ordem: number
  tempoMinimoSeg: number
  videoMinutos: number
  anteriorId: string
  ativo: boolean
  atualizadoPor?: string
  atualizadoPorNome?: string
  atualizadoEm?: unknown
}

export type StatusProgressoManual = 'em_andamento' | 'concluido'

export interface ProgressoManual {
  id: string
  uid: string
  documentoId: string
  nome: string
  unidadeId: string
  unidadeNome: string
  status: StatusProgressoManual
  iniciadoEm?: unknown
  reinicios: number
  tempoMinimoSeg: number
  concluidoEm?: unknown
  atualizadoEm?: unknown
}

export type EstadoManual = 'bloqueado' | 'disponivel' | 'em_andamento' | 'concluido'

export function idProgresso(uid: string, documentoId: string): string {
  return `${uid}_${documentoId}`
}

export function contarPalavras(texto: string): number {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo ? limpo.split(' ').length : 0
}

export function limitarTempo(segundos: number): number {
  if (!Number.isFinite(segundos)) return TEMPO_MINIMO_PISO_SEG
  return Math.min(TEMPO_MINIMO_TETO_SEG, Math.max(TEMPO_MINIMO_PISO_SEG, Math.round(segundos)))
}

/** Sugestão: leitura a 200 palavras por minuto mais a duração do vídeo, arredondada para cima em 30 s. */
export function tempoSugeridoSeg(texto: string, videoMinutos: number): number {
  const leitura = (contarPalavras(texto) / PALAVRAS_POR_MINUTO) * 60
  const video = Math.max(0, videoMinutos || 0) * 60
  const total = Math.ceil((leitura + video) / 30) * 30
  return limitarTempo(total)
}

export function formatarDuracao(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h) return `${h}h ${String(m).padStart(2, '0')}min`
  if (m && r) return `${m} min ${String(r).padStart(2, '0')} s`
  if (m) return `${m} min`
  return `${r} s`
}

export function ordenarTrilha<T extends Pick<ItemTrilhaManual, 'ordem' | 'titulo'>>(itens: T[]): T[] {
  return [...itens].sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

/**
 * Recalcula ordem (1..n) e o anterior de cada item ativo, na ordem recebida.
 * Itens inativos ficam fora da corrente (anteriorId vazio) e no fim da ordem.
 */
export function encadearTrilha<T extends Pick<ItemTrilhaManual, 'documentoId' | 'ativo'>>(
  itens: T[],
): Array<T & { ordem: number; anteriorId: string }> {
  const ativos = itens.filter((item) => item.ativo)
  const inativos = itens.filter((item) => !item.ativo)
  let anterior = ''
  const saida: Array<T & { ordem: number; anteriorId: string }> = []
  ativos.forEach((item, indice) => {
    saida.push({ ...item, ordem: indice + 1, anteriorId: anterior })
    anterior = item.documentoId
  })
  inativos.forEach((item, indice) => {
    saida.push({ ...item, ordem: ativos.length + indice + 1, anteriorId: '' })
  })
  return saida
}

/** Seleciona os itens que precisam ser gravados após recalcular a corrente. */
export function alteracoesNaTrilha<T extends ItemTrilhaManual>(depois: T[], antes: ItemTrilhaManual[]): T[] {
  const porDocumento = new Map(antes.map((item) => [item.documentoId, item]))
  return depois.filter((item) => {
    const anterior = porDocumento.get(item.documentoId)
    return !anterior || item.ordem !== anterior.ordem || item.anteriorId !== anterior.anteriorId ||
      item.titulo !== anterior.titulo || item.etapa !== anterior.etapa || item.ativo !== anterior.ativo ||
      item.tempoMinimoSeg !== anterior.tempoMinimoSeg || item.videoMinutos !== anterior.videoMinutos
  })
}

export function estadoDoManual(
  item: Pick<ItemTrilhaManual, 'documentoId' | 'anteriorId'>,
  progressoPorDocumento: Map<string, Pick<ProgressoManual, 'status'>>,
): EstadoManual {
  const proprio = progressoPorDocumento.get(item.documentoId)
  if (proprio?.status === 'concluido') return 'concluido'
  const liberado = !item.anteriorId || progressoPorDocumento.get(item.anteriorId)?.status === 'concluido'
  if (!liberado) return 'bloqueado'
  return proprio ? 'em_andamento' : 'disponivel'
}

export interface EtapaTrilha<T> {
  etapa: string
  itens: Array<T & { estado: EstadoManual }>
}

export function montarTrilhaDoUsuario<T extends ItemTrilhaManual>(
  itens: T[],
  progressos: Pick<ProgressoManual, 'documentoId' | 'status'>[],
): EtapaTrilha<T>[] {
  const mapa = new Map(progressos.map((p) => [p.documentoId, p]))
  const etapas: EtapaTrilha<T>[] = []
  for (const item of ordenarTrilha(itens.filter((i) => i.ativo))) {
    const nome = item.etapa.trim() || 'Trilha da rede'
    let grupo = etapas.find((e) => e.etapa === nome)
    if (!grupo) {
      grupo = { etapa: nome, itens: [] }
      etapas.push(grupo)
    }
    grupo.itens.push({ ...item, estado: estadoDoManual(item, mapa) })
  }
  return etapas
}

/** Cronômetro do cliente: quanto falta, dado o início local e o tempo mínimo. */
export function segundosRestantes(inicioMs: number, agoraMs: number, tempoMinimoSeg: number): number {
  return Math.max(0, tempoMinimoSeg - Math.floor((agoraMs - inicioMs) / 1000))
}

/** Sair da tela zera: visibilidade oculta, ou a janela perdeu o foco para fora da página. */
export function saiuDaTela(evento: { tipo: 'visibilidade' | 'blur'; oculto?: boolean; focoEmIframeDaPagina?: boolean }): boolean {
  if (evento.tipo === 'visibilidade') return evento.oculto === true
  return !evento.focoEmIframeDaPagina
}

export interface ResumoPessoa {
  uid: string
  nome: string
  unidadeId: string
  unidadeNome: string
  concluidos: number
  total: number
  reinicios: number
  ultimoConcluido: string
  ultimoConcluidoMs: number
}

export interface ResumoUnidade {
  unidadeId: string
  unidadeNome: string
  pessoas: ResumoPessoa[]
  concluidos: number
  possiveis: number
  percentual: number
}

/** Agrupa progresso por unidade e pessoa, contando só manuais ativos da trilha. */
export function resumirProgresso(
  itens: Pick<ItemTrilhaManual, 'documentoId' | 'titulo' | 'ativo'>[],
  progressos: Array<Pick<ProgressoManual, 'uid' | 'nome' | 'unidadeId' | 'unidadeNome' | 'documentoId' | 'status' | 'reinicios'> & { concluidoMs?: number }>,
): ResumoUnidade[] {
  const ativos = new Map(itens.filter((i) => i.ativo).map((i) => [i.documentoId, i.titulo]))
  const total = ativos.size
  const pessoas = new Map<string, ResumoPessoa>()
  for (const p of progressos) {
    let pessoa = pessoas.get(p.uid)
    if (!pessoa) {
      pessoa = { uid: p.uid, nome: p.nome, unidadeId: p.unidadeId, unidadeNome: p.unidadeNome, concluidos: 0, total, reinicios: 0, ultimoConcluido: '', ultimoConcluidoMs: 0 }
      pessoas.set(p.uid, pessoa)
    }
    pessoa.reinicios += p.reinicios
    if (p.status === 'concluido' && ativos.has(p.documentoId)) {
      pessoa.concluidos += 1
      const ms = p.concluidoMs ?? 0
      if (ms >= pessoa.ultimoConcluidoMs) {
        pessoa.ultimoConcluidoMs = ms
        pessoa.ultimoConcluido = ativos.get(p.documentoId) ?? ''
      }
    }
  }
  const unidades = new Map<string, ResumoUnidade>()
  for (const pessoa of pessoas.values()) {
    let unidade = unidades.get(pessoa.unidadeId)
    if (!unidade) {
      unidade = { unidadeId: pessoa.unidadeId, unidadeNome: pessoa.unidadeNome || 'Unidade sem nome', pessoas: [], concluidos: 0, possiveis: 0, percentual: 0 }
      unidades.set(pessoa.unidadeId, unidade)
    }
    unidade.pessoas.push(pessoa)
    unidade.concluidos += pessoa.concluidos
    unidade.possiveis += total
  }
  return [...unidades.values()]
    .map((u) => ({
      ...u,
      percentual: u.possiveis ? Math.round((u.concluidos / u.possiveis) * 100) : 0,
      pessoas: u.pessoas.sort((a, b) => b.concluidos - a.concluidos || a.nome.localeCompare(b.nome, 'pt-BR')),
    }))
    .sort((a, b) => a.unidadeNome.localeCompare(b.unidadeNome, 'pt-BR'))
}

/** Quem configura a trilha e vê o progresso da rede: admin, ou equipe da franqueadora com o módulo. */
export function podeGerirTrilha(
  usuario: { papel: string; ativo: boolean; recusado: boolean; modulosLiberados?: string[] } | null | undefined,
  ehAdmin: boolean,
): boolean {
  if (usuario?.ativo !== true || usuario.recusado !== false) return false
  if (usuario.papel === 'admin') return ehAdmin
  return usuario.papel === 'equipe_franqueadora' && (usuario.modulosLiberados ?? []).includes('manuais')
}

/** Só franqueado e equipe da unidade fazem a trilha (as rules exigem esses papéis). */
export function fazTrilha(usuario: { papel: string } | null | undefined): boolean {
  return usuario?.papel === 'franqueado' || usuario?.papel === 'equipe_franqueado'
}

export type AcessoManual =
  | { liberado: true; naTrilha: boolean; estado: EstadoManual | null }
  | { liberado: false; naTrilha: true; estado: 'bloqueado' }

/**
 * A trilha é a única porta dos manuais que estão nela: biblioteca, busca e /documento usam o mesmo
 * estadoDoManual. Fora da trilha (ou item inativo) abre normalmente; a franqueadora vê tudo.
 */
export function acessoAoManual(
  documentoId: string,
  itens: Pick<ItemTrilhaManual, 'documentoId' | 'anteriorId' | 'ativo'>[],
  progressos: Pick<ProgressoManual, 'documentoId' | 'status'>[],
  veTudo: boolean,
): AcessoManual {
  const item = itens.find((i) => i.ativo && i.documentoId === documentoId)
  if (!item) return { liberado: true, naTrilha: false, estado: null }
  if (veTudo) return { liberado: true, naTrilha: true, estado: null }
  const estado = estadoDoManual(item, new Map(progressos.map((p) => [p.documentoId, p])))
  return estado === 'bloqueado' ? { liberado: false, naTrilha: true, estado } : { liberado: true, naTrilha: true, estado }
}

/** Admin e equipe da franqueadora (fora da simulação) veem todos os manuais. */
export function veTodosOsManuais(usuario: { papel: string } | null | undefined, simulando: boolean): boolean {
  return !simulando && (usuario?.papel === 'admin' || usuario?.papel === 'equipe_franqueadora')
}
