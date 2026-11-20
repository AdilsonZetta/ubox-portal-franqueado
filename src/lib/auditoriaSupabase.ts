// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import {
  normalizarItemAud,
  respostasParaGravar,
  resultadoAuditoria,
  versaoMudaAud,
  type AcaoAuditoria,
  type Auditoria,
  type ModeloAuditoria,
  type ModeloAuditoriaForm,
  type StatusAcao,
} from './auditoria'
import { mapAcao, mapAuditoria, mapModeloAud, type DadosAuditoria } from './auditoriaApi'
import { calcularTotais } from './checklist'
import { requireSupabase } from './supabase'

type Linha = Record<string, unknown> & { id: string }
type Tabela = 'auditoria_modelos' | 'auditorias' | 'auditoria_acoes'
type Consulta = ReturnType<ReturnType<ReturnType<typeof requireSupabase>['from']>['select']>
type UnidadeId = string | null | undefined

function dataSb(valor: unknown): number {
  const ms = typeof valor === 'string' ? Date.parse(valor) : NaN
  return Number.isFinite(ms) ? ms : 0
}

export function mapModeloAudSb(linha: Linha): ModeloAuditoria {
  return mapModeloAud(linha.id, {
    ...linha,
    totalItens: linha.total_itens,
    pesoTotal: linha.peso_total,
    notaMinima: linha.nota_minima,
    geradoPorIA: linha.gerado_por_ia,
    iaModelo: linha.ia_modelo,
    criadoEm: dataSb(linha.criado_em),
    atualizadoPorNome: linha.atualizado_por_nome,
    atualizadoEm: dataSb(linha.atualizado_em),
  })
}

export function mapAuditoriaSb(linha: Linha): Auditoria {
  return mapAuditoria(linha.id, {
    ...linha,
    unidadeId: linha.unidade_id,
    unidadeNome: linha.unidade_nome,
    modeloId: linha.modelo_id,
    modeloTitulo: linha.modelo_titulo,
    modeloVersao: linha.modelo_versao,
    dataVisita: dataSb(linha.data_visita),
    auditorUid: linha.auditor_uid,
    auditorNome: linha.auditor_nome,
    totalItens: linha.total_itens,
    pesoTotal: linha.peso_total,
    qtdOk: linha.qtd_ok,
    qtdNaoOk: linha.qtd_nao_ok,
    qtdNa: linha.qtd_na,
    pontosObtidos: linha.pontos_obtidos,
    pontosPossiveis: linha.pontos_possiveis,
    notaMinima: linha.nota_minima,
    checklistExecucaoId: linha.checklist_execucao_id,
    checklistScore: linha.checklist_score,
    obsGeral: linha.obs_geral,
    geradoPorIA: linha.gerado_por_ia,
    iaModelo: linha.ia_modelo,
    assinaturaAuditorUid: linha.assinatura_auditor_uid,
    assinaturaAuditorNome: linha.assinatura_auditor_nome,
    assinaturaAuditorEm: dataSb(linha.assinatura_auditor_em),
    cienciaUid: linha.ciencia_uid,
    cienciaNome: linha.ciencia_nome,
    cienciaEm: dataSb(linha.ciencia_em),
    criadoEm: dataSb(linha.criado_em),
    atualizadoEm: dataSb(linha.atualizado_em),
  })
}

export function mapAcaoSb(linha: Linha): AcaoAuditoria {
  return mapAcao(linha.id, {
    ...linha,
    auditoriaId: linha.auditoria_id,
    unidadeId: linha.unidade_id,
    itemId: linha.item_id,
    itemTexto: linha.item_texto,
    prazo: dataSb(linha.prazo),
    evidenciaUrl: linha.evidencia_url,
    comentarioUnidade: linha.comentario_unidade,
    comentarioFranqueadora: linha.comentario_franqueadora,
    criadoEm: dataSb(linha.criado_em),
    atualizadoPorNome: linha.atualizado_por_nome,
    atualizadoEm: dataSb(linha.atualizado_em),
  })
}

async function listarLinhas(tabela: Tabela, filtrar: (consulta: Consulta) => Consulta, maximo = Infinity): Promise<Linha[]> {
  const banco = requireSupabase()
  const linhas: Linha[] = []
  while (linhas.length < maximo) {
    const tamanho = Math.min(500, maximo - linhas.length)
    const { data, error } = await filtrar(banco.from(tabela).select('*')).order('id')
      .range(linhas.length, linhas.length + tamanho - 1).overrideTypes<Linha[], { merge: false }>()
    if (error) throw error
    linhas.push(...data)
    if (data.length < tamanho) break
  }
  return linhas
}

async function gravarLinha(tabela: Tabela, id: string | null, campos: Record<string, unknown>): Promise<string> {
  const tabelaSb = requireSupabase().from(tabela)
  const gravacao = id === null ? tabelaSb.insert(campos) : tabelaSb.update(campos).eq('id', id)
  const { data, error } = await gravacao.select('id').single()
  if (error) throw error
  return data.id
}

export async function listarModelosAudSb(): Promise<ModeloAuditoria[]> {
  const linhas = await listarLinhas('auditoria_modelos', (q) => q)
  return linhas.map(mapModeloAudSb).sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

export function salvarModeloAudSb(existente: ModeloAuditoria | null, f: ModeloAuditoriaForm): Promise<string> {
  const itens = f.itens.map(normalizarItemAud)
  const titulo = f.titulo.trim().slice(0, 120)
  const pesoTotal = itens.reduce((s, i) => s + i.peso, 0)
  const versao = existente
    ? existente.versao + Number(versaoMudaAud(existente, { itens, titulo, pesoTotal }))
    : 1
  return gravarLinha('auditoria_modelos', existente?.id ?? null, {
    titulo,
    descricao: f.descricao.trim().slice(0, 1000),
    itens,
    total_itens: itens.length,
    peso_total: pesoTotal,
    nota_minima: Math.round(f.notaMinima),
    versao,
    ativo: f.ativo,
    gerado_por_ia: f.geradoPorIA,
    ia_modelo: f.geradoPorIA ? f.iaModelo.trim().slice(0, 80) : '',
  })
}

export async function listarAuditoriasSb(gestor: boolean, unidadeId: UnidadeId): Promise<Auditoria[]> {
  if (gestor) {
    const linhas = await listarLinhas('auditorias', (q) => q.order('criado_em', { ascending: false }), 500)
    return linhas.map(mapAuditoriaSb)
  }
  if (!unidadeId) return []
  const linhas = await listarLinhas('auditorias', (q) =>
    q.eq('unidade_id', unidadeId).in('status', ['aguardando_ciencia', 'concluida']).order('data_visita', { ascending: false }),
  )
  return linhas.map(mapAuditoriaSb)
}

export async function lerAuditoriaSb(id: string): Promise<Auditoria | null> {
  const { data, error } = await requireSupabase().from('auditorias').select('*').eq('id', id).maybeSingle<Linha>()
  if (error) throw error
  return data ? mapAuditoriaSb(data) : null
}

function camposEditaveisSb(f: DadosAuditoria) {
  const respostas = respostasParaGravar(f.respostas)
  const totais = calcularTotais(respostas)
  const checklistScore = f.checklistExecucaoId ? f.checklistScore : null
  const notaMinima = Math.round(f.notaMinima)
  return {
    modalidade: f.modalidade,
    data_visita: f.dataVisita.toISOString(),
    respostas,
    qtd_ok: totais.qtdOk,
    qtd_nao_ok: totais.qtdNaoOk,
    qtd_na: totais.qtdNa,
    pontos_obtidos: totais.pontosObtidos,
    pontos_possiveis: totais.pontosPossiveis,
    score: totais.score,
    nota_minima: notaMinima,
    checklist_execucao_id: f.checklistExecucaoId,
    checklist_score: checklistScore,
    resultado: resultadoAuditoria(totais.score, notaMinima, checklistScore),
    obs_geral: f.obsGeral.trim().slice(0, 4000),
    gerado_por_ia: f.geradoPorIA,
    ia_modelo: f.geradoPorIA ? f.iaModelo.trim().slice(0, 80) : '',
  }
}

export function criarAuditoriaSb(modelo: ModeloAuditoria, unidade: { id: string; nome: string }, f: DadosAuditoria): Promise<string> {
  return gravarLinha('auditorias', null, {
    unidade_id: unidade.id,
    unidade_nome: unidade.nome.trim().slice(0, 120),
    modelo_id: modelo.id,
    modelo_titulo: modelo.titulo,
    modelo_versao: modelo.versao,
    total_itens: modelo.totalItens,
    peso_total: modelo.pesoTotal,
    ...camposEditaveisSb(f),
    status: 'rascunho',
  })
}

export async function salvarRascunhoSb(id: string, f: DadosAuditoria): Promise<void> {
  await gravarLinha('auditorias', id, camposEditaveisSb(f))
}

export async function assinarAuditoriaSb(id: string, f: DadosAuditoria): Promise<void> {
  await gravarLinha('auditorias', id, {
    ...camposEditaveisSb(f),
    status: 'aguardando_ciencia',
  })
}

export async function assinarCienciaSb(id: string, contestacao: string): Promise<void> {
  await gravarLinha('auditorias', id, {
    status: 'concluida',
    contestacao: contestacao.trim().slice(0, 2000),
  })
}

export async function listarAcoesSb(gestor: boolean, unidadeId: UnidadeId): Promise<AcaoAuditoria[]> {
  if (!gestor && !unidadeId) return []
  const linhas = await listarLinhas('auditoria_acoes', (q) => gestor
    ? q.order('criado_em', { ascending: false })
    : q.eq('unidade_id', unidadeId),
  gestor ? 1000 : Infinity)
  return linhas.map(mapAcaoSb).sort((a, b) => a.prazoMs - b.prazoMs)
}

export async function listarAcoesDaAuditoriaSb(gestor: boolean, auditoria: Pick<Auditoria, 'id' | 'unidadeId'>): Promise<AcaoAuditoria[]> {
  const linhas = await listarLinhas('auditoria_acoes', (q) => {
    const daAuditoria = q.eq('auditoria_id', auditoria.id)
    return gestor ? daAuditoria : daAuditoria.eq('unidade_id', auditoria.unidadeId)
  })
  return linhas.map(mapAcaoSb).sort((a, b) => a.prazoMs - b.prazoMs)
}

export async function criarAcaoSb(
  auditoria: Pick<Auditoria, 'id' | 'unidadeId'>,
  item: { itemId: string; itemTexto: string },
  f: { descricao: string; responsavel: string; prazo: Date },
): Promise<void> {
  await gravarLinha('auditoria_acoes', null, {
    auditoria_id: auditoria.id,
    unidade_id: auditoria.unidadeId,
    item_id: item.itemId.slice(0, 64),
    item_texto: item.itemTexto.slice(0, 300),
    descricao: f.descricao.trim().slice(0, 1000),
    responsavel: f.responsavel.trim().slice(0, 120),
    prazo: f.prazo.toISOString(),
    status: 'aberta',
  })
}

export async function andamentoAcaoUnidadeSb(id: string, status: StatusAcao, evidenciaUrl: string, comentario: string): Promise<void> {
  await gravarLinha('auditoria_acoes', id, {
    status,
    evidencia_url: evidenciaUrl.trim().slice(0, 600),
    comentario_unidade: comentario.trim().slice(0, 1000),
  })
}

export async function decidirAcaoSb(id: string, status: 'validada' | 'reaberta', comentario: string): Promise<void> {
  await gravarLinha('auditoria_acoes', id, {
    status,
    comentario_franqueadora: comentario.trim().slice(0, 1000),
  })
}
