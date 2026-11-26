// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { STATUS_PENDENTES } from '../data/chamados'
import type { PassoAc, RegistroAc, RegistroForm } from './acompanhamento'
import { mapPasso, mapRegistro, type DadosAcompanhamento } from './acompanhamentoApi'
import { mapAcaoSb, mapAuditoriaSb } from './auditoriaSupabase'
import { mapChamadoSb } from './chamadosSupabase'
import { entradaPrazoChamado } from './chamados'
import { inicioHistoricoVigencias } from './checklist'
import { listarVigenciasSb, mapExecucaoSb, mapModeloSb } from './checklistSupabase'
import { mapProgressoSb } from './manuaisSupabase'
import { mapPedidoSb } from './marketingSupabase'
import { requireSupabase } from './supabase'
import { mapTentativaSb } from './universidadeSupabase'

type Linha = Record<string, unknown> & { id: string }
type Consulta = ReturnType<ReturnType<ReturnType<typeof requireSupabase>['from']>['select']>

function dataSb(valor: unknown): number {
  const ms = typeof valor === 'string' ? Date.parse(valor) : NaN
  return Number.isFinite(ms) ? ms : 0
}

export function mapRegistroSb(linha: Linha): RegistroAc {
  return mapRegistro(linha.id, {
    ...linha,
    unidadeId: linha.unidade_id,
    unidadeNome: linha.unidade_nome,
    data: dataSb(linha.data),
    geradoPorIA: linha.gerado_por_ia,
    iaModelo: linha.ia_modelo,
    autorUid: linha.autor_uid,
    autorNome: linha.autor_nome,
    criadoEm: dataSb(linha.criado_em),
    atualizadoPorNome: linha.atualizado_por_nome,
    atualizadoEm: dataSb(linha.atualizado_em),
  })
}

export function mapPassoSb(linha: Linha): PassoAc {
  return mapPasso(linha.id, {
    ...linha,
    registroId: linha.registro_id,
    unidadeId: linha.unidade_id,
    prazo: dataSb(linha.prazo),
    comentarioUnidade: linha.comentario_unidade,
    comentarioFranqueadora: linha.comentario_franqueadora,
    criadoEm: dataSb(linha.criado_em),
    atualizadoPorNome: linha.atualizado_por_nome,
    atualizadoEm: dataSb(linha.atualizado_em),
  })
}

async function listarLinhas<T = Linha>(
  tabela: string,
  filtrar: (consulta: Consulta) => Consulta = (consulta) => consulta,
  maximo = Infinity,
): Promise<T[]> {
  const banco = requireSupabase()
  const linhas: T[] = []
  while (linhas.length < maximo) {
    const tamanho = Math.min(500, maximo - linhas.length)
    const { data, error } = await filtrar(banco.from(tabela).select('*')).order('id')
      .range(linhas.length, linhas.length + tamanho - 1).overrideTypes<T[], { merge: false }>()
    if (error) throw error
    linhas.push(...data as T[])
    if (data.length < tamanho) break
  }
  return linhas
}

async function contar(tabela: string, coluna: string): Promise<number> {
  const { count, error } = await requireSupabase().from(tabela).select('id', { count: 'exact', head: true }).eq(coluna, true)
  if (error) throw error
  return count ?? 0
}

async function seguro<T>(consulta: Promise<T>): Promise<T | null> {
  try {
    return await consulta
  } catch {
    return null
  }
}

function ordenarListas(registros: RegistroAc[], passos: PassoAc[]) {
  return {
    registros: registros.sort((a, b) => b.dataMs - a.dataMs),
    passos: passos.sort((a, b) => a.prazoMs - b.prazoMs),
  }
}

export async function carregarAcompanhamentoSb(unidadeId?: string): Promise<DadosAcompanhamento> {
  const unidade = (q: Consulta) => unidadeId ? q.eq('unidade_id', unidadeId) : q
  const agora = Date.now()
  const modelosVisiveis = seguro(listarLinhas('checklist_modelos').then((linhas) => linhas.map(mapModeloSb)))
  const vigenciasVisiveis = seguro(listarVigenciasSb(unidadeId))
  const [modelosChecklist, vigenciasChecklist, execucoes, auditorias, acoes, chamados, tentativas, cursosPublicados, progresso, trilhaManuais, pedidos, registros, passos] = await Promise.all([
    modelosVisiveis,
    vigenciasVisiveis,
    seguro(Promise.all([modelosVisiveis, vigenciasVisiveis]).then(([modelos, vigencias]) => {
      if (!vigencias) return null
      const desde = inicioHistoricoVigencias(vigencias, modelos ?? [], agora, agora - 62 * 86_400_000)
      return listarLinhas('checklist_execucoes', (q) => unidade(q).gte('criado_em', new Date(desde).toISOString()).order('criado_em', { ascending: false }), vigencias.length ? Infinity : 3000)
        .then((linhas) => linhas.map(mapExecucaoSb))
    })),
    seguro(listarLinhas('auditorias', (q) => unidade(q).in('status', ['aguardando_ciencia', 'concluida']))
      .then((linhas) => linhas.map(mapAuditoriaSb))),
    seguro(listarLinhas('auditoria_acoes', unidade).then((linhas) => linhas.map(mapAcaoSb))),
    seguro(listarLinhas('chamados', (q) => unidadeId ? unidade(q) : q.in('status', STATUS_PENDENTES))
      .then((linhas) => linhas.map(mapChamadoSb).filter((c) => c !== null)
        .map((c) => ({ id: c.id, titulo: c.titulo, unidadeId: c.unidadeId, ...entradaPrazoChamado(c) })))),
    seguro(listarLinhas<Parameters<typeof mapTentativaSb>[0]>('tentativas_prova', unidade)
      .then((linhas) => linhas.map(mapTentativaSb))),
    seguro(contar('cursos', 'publicado')),
    seguro(listarLinhas('progresso_manuais', unidade).then((linhas) => linhas.map(mapProgressoSb))),
    seguro(contar('manuais_trilha', 'ativo')),
    seguro(listarLinhas('marketing_solicitacoes', unidade).then((linhas) => linhas.map(mapPedidoSb))),
    seguro(listarLinhas('acompanhamento_registros', unidade).then((linhas) => linhas.map(mapRegistroSb))),
    seguro(listarLinhas('acompanhamento_passos', unidade).then((linhas) => linhas.map(mapPassoSb))),
  ])

  return {
    vigenciasChecklist: vigenciasChecklist ?? [],
    fontes: { modelosChecklist, execucoes, auditorias, acoes, chamados, tentativas, cursosPublicados, progresso, trilhaManuais, pedidos, registros, passos },
    ...ordenarListas(registros ?? [], passos ?? []),
  }
}

function deInputData(valor: string): string {
  const [ano, mes, dia] = valor.split('-').map(Number)
  return new Date(ano, (mes || 1) - 1, dia || 1, 12).toISOString()
}

export async function salvarRegistroSb(
  unidade: { id: string; nome: string },
  existente: RegistroAc | null,
  f: RegistroForm,
): Promise<string> {
  const { data, error } = await requireSupabase().rpc('salvar_acompanhamento', {
    p_registro: {
      id: existente?.id,
      unidade_id: unidade.id,
      unidade_nome: unidade.nome.trim().slice(0, 120),
      data: deInputData(f.data),
      tipo: f.tipo,
      notas: f.notas.trim().slice(0, 4000),
      compartilhado: f.compartilhado,
      gerado_por_ia: f.geradoPorIA,
      ia_modelo: f.geradoPorIA ? f.iaModelo.trim().slice(0, 80) : '',
    },
    p_editar: existente !== null,
    p_passos: f.passos.map((passo) => ({
      descricao: passo.descricao.trim().slice(0, 1000),
      responsavel: passo.responsavel.trim().slice(0, 120),
      prazo: deInputData(passo.prazo),
    })),
  })
  if (error) throw error
  if (typeof data !== 'string') throw new Error('O servidor não retornou o identificador do registro.')
  return data
}

async function atualizarPasso(id: string, campos: Record<string, string>): Promise<void> {
  const { error } = await requireSupabase().from('acompanhamento_passos').update(campos).eq('id', id).select('id').single()
  if (error) throw error
}

export function decidirPassoSb(passo: PassoAc, status: 'validado' | 'reaberto', comentario: string): Promise<void> {
  return atualizarPasso(passo.id, { status, comentario_franqueadora: comentario.trim().slice(0, 1000) })
}

export async function listarCompartilhadosSb(unidadeId: string): Promise<{ registros: RegistroAc[]; passos: PassoAc[] }> {
  const filtrar = (q: Consulta) => q.eq('unidade_id', unidadeId).eq('compartilhado', true)
  const [registros, passos] = await Promise.all([
    listarLinhas('acompanhamento_registros', filtrar).then((linhas) => linhas.map(mapRegistroSb)),
    listarLinhas('acompanhamento_passos', filtrar).then((linhas) => linhas.map(mapPassoSb)),
  ])
  const registrosVisiveis = new Set(registros.map((r) => r.id))
  return ordenarListas(registros, passos.filter((p) => registrosVisiveis.has(p.registroId)))
}

export function concluirPassoUnidadeSb(id: string, comentario: string): Promise<void> {
  return atualizarPasso(id, { status: 'concluido_unidade', comentario_unidade: comentario.trim().slice(0, 1000) })
}
