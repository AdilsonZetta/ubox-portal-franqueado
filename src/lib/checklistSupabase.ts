// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import type { Usuario } from '../types'
import {
  calcularTotais,
  normalizarItem,
  pesoTotalDe,
  pesoValido,
  versaoMuda,
  type ModeloChecklist,
  type ModeloForm,
  type Resposta,
} from './checklist'
import { mapExecucao, mapModelo, type ConsultaExecucoes } from './checklistApi'
import { requireSupabase } from './supabase'

type Linha = Record<string, unknown> & { id: string }
type Tabela = 'checklist_modelos' | 'checklist_execucoes'
type Consulta = ReturnType<ReturnType<ReturnType<typeof requireSupabase>['from']>['select']>
type Unidade = Pick<Usuario, 'unidadeId'>

function dataSb(valor: unknown): number {
  const ms = typeof valor === 'string' ? Date.parse(valor) : NaN
  return Number.isFinite(ms) ? ms : 0
}

export function mapModeloSb(linha: Linha) {
  return mapModelo(linha.id, {
    ...linha,
    horarioLiberacao: linha.horario_liberacao,
    totalItens: linha.total_itens,
    pesoTotal: linha.peso_total,
    geradoPorIA: linha.gerado_por_ia,
    iaModelo: linha.ia_modelo,
    criadoEm: dataSb(linha.criado_em),
    atualizadoPorNome: linha.atualizado_por_nome,
    atualizadoEm: dataSb(linha.atualizado_em),
  })
}

export function mapExecucaoSb(linha: Linha) {
  return mapExecucao(linha.id, {
    ...linha,
    modeloId: linha.modelo_id,
    modeloTitulo: linha.modelo_titulo,
    modeloVersao: linha.modelo_versao,
    unidadeId: linha.unidade_id,
    unidadeNome: linha.unidade_nome,
    totalItens: linha.total_itens,
    qtdOk: linha.qtd_ok,
    qtdNaoOk: linha.qtd_nao_ok,
    qtdNa: linha.qtd_na,
    pontosObtidos: linha.pontos_obtidos,
    pontosPossiveis: linha.pontos_possiveis,
    obsGeral: linha.obs_geral,
    obsProprietario: linha.obs_proprietario,
    obsProprietarioNome: linha.obs_proprietario_nome,
    obsProprietarioEm: dataSb(linha.obs_proprietario_em),
    criadoEm: dataSb(linha.criado_em),
  })
}

async function listarLinhas(tabela: Tabela, filtrar: (consulta: Consulta) => Consulta, maximo = Infinity): Promise<Linha[]> {
  const banco = requireSupabase()
  const linhas: Linha[] = []
  while (linhas.length < maximo) {
    const tamanho = Math.min(500, maximo - linhas.length)
    const { data, error } = await filtrar(banco.from(tabela).select('*'))
      .range(linhas.length, linhas.length + tamanho - 1).overrideTypes<Linha[], { merge: false }>()
    if (error) throw error
    linhas.push(...data)
    if (data.length < tamanho) break
  }
  return linhas
}

async function lerLinha(tabela: Tabela, id: string): Promise<Linha | null> {
  const { data, error } = await requireSupabase().from(tabela).select('*').eq('id', id)
    .maybeSingle<Linha>()
  if (error) throw error
  return data
}

async function gravarLinha(tabela: Tabela, id: string | null, campos: Record<string, unknown>): Promise<string> {
  const tabelaSb = requireSupabase().from(tabela)
  const gravacao = id === null ? tabelaSb.insert(campos) : tabelaSb.update(campos).eq('id', id)
  const { data, error } = await gravacao.select('id').single()
  if (error) throw error
  return data.id
}

export async function listarModelosSb(usuario: Unidade, gestor: boolean) {
  const tabela = 'checklist_modelos'
  if (gestor) return (await listarLinhas(tabela, (q) => q.order('id'))).map(mapModeloSb)

  const unidade = usuario.unidadeId
  const [rede, direcionados] = await Promise.all([
    listarLinhas(tabela, (q) => q.eq('ativo', true).eq('publico', true).order('id')),
    unidade ? listarLinhas(tabela, (q) => q.eq('ativo', true).contains('unidades', [unidade]).order('id')) : [],
  ])
  const modelos = new Map([...rede, ...direcionados].map((linha) => [linha.id, mapModeloSb(linha)]))
  return [...modelos.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

export async function lerModeloSb(id: string) {
  const linha = await lerLinha('checklist_modelos', id)
  return linha ? mapModeloSb(linha) : null
}

export function salvarModeloSb(existente: ModeloChecklist | null, f: ModeloForm): Promise<string> {
  const itens = f.itens.map(normalizarItem)
  const titulo = f.titulo.trim().slice(0, 120)
  const pesoTotal = pesoTotalDe(itens)
  const versao = existente
    ? existente.versao + Number(versaoMuda(existente, { itens, titulo, tipo: f.tipo, frequencia: f.frequencia, pesoTotal }))
    : 1
  return gravarLinha('checklist_modelos', existente?.id ?? null, {
    titulo,
    descricao: f.descricao.trim().slice(0, 1000),
    tipo: f.tipo,
    frequencia: f.frequencia,
    ...(f.horarioLiberacao === undefined ? {} : { horario_liberacao: f.horarioLiberacao }),
    itens,
    total_itens: itens.length,
    peso_total: pesoTotal,
    versao,
    publico: f.publico,
    unidades: f.publico ? [] : f.unidades.slice(0, 30),
    ativo: f.ativo,
    gerado_por_ia: f.geradoPorIA,
    ia_modelo: f.geradoPorIA ? f.iaModelo.trim().slice(0, 80) : '',
  })
}

export async function listarExecucoesSb(usuario: Unidade, gestor: boolean, c: ConsultaExecucoes) {
  const unidade = gestor ? c.unidadeId : usuario.unidadeId
  if (!gestor && !unidade) return []
  const linhas = await listarLinhas('checklist_execucoes', (q) => {
    if (unidade) q = q.eq('unidade_id', unidade)
    if (c.deMs != null) q = q.gte('criado_em', new Date(c.deMs).toISOString())
    if (c.ateMs != null) q = q.lt('criado_em', new Date(c.ateMs + 86_400_000).toISOString())
    return q.order('criado_em', { ascending: false }).order('id', { ascending: false })
  }, c.maximo ?? 300)
  return linhas.map(mapExecucaoSb)
}

export async function lerExecucaoSb(id: string) {
  const linha = await lerLinha('checklist_execucoes', id)
  return linha ? mapExecucaoSb(linha) : null
}

export function enviarExecucaoSb(autor: Usuario, modelo: ModeloChecklist, respostas: Resposta[], obsGeral: string): Promise<string> {
  const limpas = respostas.map((r) => ({
    itemId: r.itemId,
    texto: r.texto.slice(0, 300),
    secao: r.secao.slice(0, 60),
    peso: pesoValido(r.peso),
    resultado: r.resultado,
    obs: r.obs.trim().slice(0, 500),
    evidenciaUrl: r.evidenciaUrl.trim().slice(0, 600),
  }))
  const totais = calcularTotais(limpas)
  return gravarLinha('checklist_execucoes', null, {
    modelo_id: modelo.id,
    modelo_titulo: modelo.titulo,
    modelo_versao: modelo.versao,
    tipo: modelo.tipo,
    frequencia: modelo.frequencia,
    unidade_id: autor.unidadeId ?? '',
    unidade_nome: autor.unidade ?? '',
    respostas: limpas,
    total_itens: totais.totalItens,
    qtd_ok: totais.qtdOk,
    qtd_nao_ok: totais.qtdNaoOk,
    qtd_na: totais.qtdNa,
    pontos_obtidos: totais.pontosObtidos,
    pontos_possiveis: totais.pontosPossiveis,
    score: totais.score,
    obs_geral: obsGeral.trim().slice(0, 2000),
  })
}

export async function salvarObsProprietarioSb(id: string, textoObs: string): Promise<void> {
  await gravarLinha('checklist_execucoes', id, { obs_proprietario: textoObs.trim().slice(0, 2000) })
}
