// Módulo 8: Auditoria e Qualidade. Lógica pura (sem Firebase), testada no Vitest.
import { calcularTotais, pesoValido, type Resposta, type Resultado, type Totais } from './checklist'
import { linkHttpsValido } from './marketing'

export const MODALIDADES = ['visita', 'presencial', 'remota'] as const
export type Modalidade = (typeof MODALIDADES)[number]
export const ROTULO_MODALIDADE: Record<Modalidade, string> = { visita: 'Visita de campo', presencial: 'Presencial', remota: 'Remota' }

export const STATUS_AUDITORIA = ['rascunho', 'aguardando_ciencia', 'concluida'] as const
export type StatusAuditoria = (typeof STATUS_AUDITORIA)[number]
export const ROTULO_STATUS_AUD: Record<StatusAuditoria, string> = { rascunho: 'Rascunho', aguardando_ciencia: 'Aguardando ciência', concluida: 'Concluída' }

export const STATUS_ACAO = ['aberta', 'em_andamento', 'concluida_unidade', 'validada', 'reaberta'] as const
export type StatusAcao = (typeof STATUS_ACAO)[number]
export const ROTULO_STATUS_ACAO: Record<StatusAcao, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  concluida_unidade: 'Concluída pela unidade',
  validada: 'Validada',
  reaberta: 'Reaberta',
}

export const MAX_ITENS_AUD = 80

export interface ItemAuditoria {
  id: string
  texto: string
  secao: string
  peso: number
}

export interface ModeloAuditoria {
  id: string
  titulo: string
  descricao: string
  itens: ItemAuditoria[]
  totalItens: number
  pesoTotal: number
  notaMinima: number
  versao: number
  ativo: boolean
  geradoPorIA: boolean
  iaModelo: string
  criadoEmMs: number
  atualizadoPorNome: string
  atualizadoEmMs: number
}

export interface Auditoria extends Totais {
  id: string
  unidadeId: string
  unidadeNome: string
  modeloId: string
  modeloTitulo: string
  modeloVersao: number
  modalidade: Modalidade
  dataVisitaMs: number
  auditorUid: string
  auditorNome: string
  respostas: Resposta[]
  pesoTotal: number
  notaMinima: number
  checklistExecucaoId: string
  checklistScore: number | null
  resultado: 'aprovada' | 'reprovada'
  obsGeral: string
  geradoPorIA: boolean
  iaModelo: string
  status: StatusAuditoria
  assinaturaAuditorUid: string
  assinaturaAuditorNome: string
  assinaturaAuditorEmMs: number
  cienciaUid: string
  cienciaNome: string
  cienciaEmMs: number
  contestacao: string
  criadoEmMs: number
  atualizadoEmMs: number
}

export interface AcaoAuditoria {
  id: string
  auditoriaId: string
  unidadeId: string
  itemId: string
  itemTexto: string
  descricao: string
  responsavel: string
  prazoMs: number
  status: StatusAcao
  evidenciaUrl: string
  comentarioUnidade: string
  comentarioFranqueadora: string
  criadoEmMs: number
  atualizadoPorNome: string
  atualizadoEmMs: number
}

/** Aprovação pela pontuação: a auditoria e, se houver, o checklist de referência atingem a nota mínima (igual às rules). */
export function resultadoAuditoria(score: number, notaMinima: number, checklistScore: number | null): 'aprovada' | 'reprovada' {
  return score >= notaMinima && (checklistScore === null || checklistScore >= notaMinima) ? 'aprovada' : 'reprovada'
}

/** Score do checklist recalculado pelas respostas (não confia nos totais gravados). */
export function scoreRecalculado(execucao: { respostas: Pick<Resposta, 'peso' | 'resultado'>[] }): number {
  return calcularTotais(execucao.respostas).score
}

export function respostasDoModelo(modelo: Pick<ModeloAuditoria, 'itens'>): Resposta[] {
  return modelo.itens.map((i) => ({ itemId: i.id, texto: i.texto, secao: i.secao, peso: pesoValido(i.peso), resultado: '', obs: '', evidenciaUrl: '' }))
}

/** Para assinar: todo item marcado; Não OK explicado; evidência só https. Rascunho aceita itens em branco. */
export function validarAuditoria(respostas: Resposta[], paraAssinar: boolean): Record<string, string> {
  const erros: Record<string, string> = {}
  for (const r of respostas) {
    if (r.evidenciaUrl.trim() && !linkHttpsValido(r.evidenciaUrl.trim())) erros[r.itemId] = 'O link da evidência precisa começar com https://.'
    else if (r.obs.length > 500) erros[r.itemId] = 'A observação aceita até 500 caracteres.'
    else if (paraAssinar && !r.resultado) erros[r.itemId] = 'Marque OK, Não OK ou N/A.'
    else if (paraAssinar && r.resultado === 'nao_ok' && r.obs.trim().length < 2) erros[r.itemId] = 'Descreva a não conformidade.'
  }
  return erros
}

/** Rascunho com itens em branco conta como N/A nos totais (as rules exigem a soma igual ao total de itens). */
export function respostasParaGravar(respostas: Resposta[]): Resposta[] {
  return respostas.map((r) => ({ ...r, resultado: (r.resultado || 'na') as Resultado, obs: r.obs.trim().slice(0, 500), evidenciaUrl: r.evidenciaUrl.trim().slice(0, 600) }))
}

export interface ModeloAuditoriaForm {
  titulo: string
  descricao: string
  itens: ItemAuditoria[]
  notaMinima: number
  ativo: boolean
  geradoPorIA: boolean
  iaModelo: string
}

export function validarModeloAuditoria(f: ModeloAuditoriaForm): string[] {
  const erros: string[] = []
  if (f.titulo.trim().length < 2 || f.titulo.trim().length > 120) erros.push('O título precisa ter de 2 a 120 caracteres.')
  if (!f.itens.length) erros.push('Inclua ao menos um item.')
  if (f.itens.length > MAX_ITENS_AUD) erros.push(`Uma auditoria aceita até ${MAX_ITENS_AUD} itens.`)
  if (f.itens.some((i) => i.texto.trim().length < 2)) erros.push('Todo item precisa de um texto.')
  if (f.itens.some((i) => i.texto.length > 300 || i.secao.length > 60)) erros.push('Item com texto acima de 300 caracteres ou seção acima de 60.')
  if (new Set(f.itens.map((i) => i.id)).size !== f.itens.length) erros.push('Há itens repetidos.')
  if (!Number.isInteger(f.notaMinima) || f.notaMinima < 0 || f.notaMinima > 100) erros.push('A nota mínima vai de 0 a 100.')
  if (f.geradoPorIA && f.iaModelo.trim().length < 2) erros.push('Informe qual IA ou modelo participou da criação.')
  return erros
}

export function normalizarItemAud(i: ItemAuditoria): ItemAuditoria {
  return { id: i.id, texto: i.texto.trim().slice(0, 300), secao: i.secao.trim().slice(0, 60), peso: pesoValido(i.peso) }
}

/** Mudanças que sobem a versão do modelo (mesma regra das rules). */
export function versaoMudaAud(antes: Pick<ModeloAuditoria, 'itens' | 'titulo' | 'pesoTotal'>, depois: Pick<ModeloAuditoria, 'itens' | 'titulo' | 'pesoTotal'>): boolean {
  return (
    JSON.stringify(antes.itens.map(normalizarItemAud)) !== JSON.stringify(depois.itens.map(normalizarItemAud)) ||
    antes.titulo !== depois.titulo ||
    antes.pesoTotal !== depois.pesoTotal
  )
}

// ---------- Plano de ação ----------

export function acaoDaUnidade(status: StatusAcao): StatusAcao[] {
  if (status === 'aberta' || status === 'reaberta') return ['em_andamento', 'concluida_unidade']
  if (status === 'em_andamento') return ['concluida_unidade']
  return []
}

export function acaoAtrasada(a: Pick<AcaoAuditoria, 'prazoMs' | 'status'>, agoraMs: number): boolean {
  const fimDoPrazo = new Date(a.prazoMs)
  const limite = new Date(fimDoPrazo.getFullYear(), fimDoPrazo.getMonth(), fimDoPrazo.getDate() + 1).getTime()
  return ['aberta', 'em_andamento', 'reaberta'].includes(a.status) && agoraMs >= limite
}

export function resumoAcoes(acoes: Pick<AcaoAuditoria, 'status' | 'prazoMs'>[], agoraMs: number) {
  return {
    abertas: acoes.filter((a) => ['aberta', 'em_andamento', 'reaberta'].includes(a.status)).length,
    paraValidar: acoes.filter((a) => a.status === 'concluida_unidade').length,
    validadas: acoes.filter((a) => a.status === 'validada').length,
    atrasadas: acoes.filter((a) => acaoAtrasada(a, agoraMs)).length,
  }
}

/** Itens Não OK que ainda não têm plano de ação. */
export function naoConformesSemPlano(auditoria: Pick<Auditoria, 'respostas'>, acoes: Pick<AcaoAuditoria, 'itemId'>[]): Resposta[] {
  const comPlano = new Set(acoes.map((a) => a.itemId))
  return auditoria.respostas.filter((r) => r.resultado === 'nao_ok' && !comPlano.has(r.itemId))
}

export function podeGerirAuditoria(
  usuario: { papel: string; ativo?: boolean; modulosLiberados?: string[] } | null | undefined,
  ehAdmin: boolean,
): boolean {
  if (!usuario) return false
  if (ehAdmin) return true
  return usuario.papel === 'equipe_franqueadora' && usuario.ativo !== false && (usuario.modulosLiberados ?? []).includes('auditoria')
}

export function daUnidade(usuario: { papel: string } | null | undefined): boolean {
  return usuario?.papel === 'franqueado' || usuario?.papel === 'equipe_franqueado'
}
