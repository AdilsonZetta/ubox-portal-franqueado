// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import {
  centavosDe, divergencias, recalcularContagem,
  type Contagem, type ItemEstoque, type ItemForm, type LinhaContagem, type LinhaPedido,
  type Movimento, type Pedido, type TipoManual,
} from './estoque'
import { mapContagem, mapItem, mapMovimento, mapPedido, type DadosEstoque } from './estoqueApi'
import { requireSupabase } from './supabase'
import type { Usuario } from '../types'

type Linha = Record<string, unknown> & { id: string }
type Tabela = 'estoque_itens' | 'estoque_movimentos' | 'estoque_contagens' | 'estoque_pedidos'

function dataSb(valor: unknown): number {
  const ms = typeof valor === 'string' ? Date.parse(valor) : NaN
  return Number.isFinite(ms) ? ms : 0
}

export function mapItemSb(linha: Linha): ItemEstoque {
  return mapItem(linha.id, {
    ...linha,
    unidadeMedida: linha.unidade_medida,
    estoqueMinimo: linha.estoque_minimo,
    precoSugeridoCentavos: linha.preco_sugerido_centavos,
    geradoPorIA: linha.gerado_por_ia,
    iaModelo: linha.ia_modelo,
    atualizadoPorNome: linha.atualizado_por_nome,
    atualizadoEm: dataSb(linha.atualizado_em),
  })
}

export function mapMovimentoSb(linha: Linha): Movimento {
  return mapMovimento(linha.id, {
    ...linha,
    unidadeId: linha.unidade_id,
    unidadeNome: linha.unidade_nome,
    itemId: linha.item_id,
    itemNome: linha.item_nome,
    unidadeMedida: linha.unidade_medida,
    origemId: linha.origem_id,
    criadoEm: dataSb(linha.criado_em),
  })
}

export function mapContagemSb(linha: Linha): Contagem {
  return mapContagem(linha.id, {
    ...linha,
    unidadeId: linha.unidade_id,
    unidadeNome: linha.unidade_nome,
    totalDivergencias: linha.total_divergencias,
    criadoPorNome: linha.criado_por_nome,
    criadoEm: dataSb(linha.criado_em),
    confirmadoNome: linha.confirmado_nome,
    confirmadoEm: dataSb(linha.confirmado_em),
    atualizadoPorNome: linha.atualizado_por_nome,
    atualizadoEm: dataSb(linha.atualizado_em),
  })
}

export function mapPedidoSb(linha: Linha): Pedido {
  return mapPedido(linha.id, {
    ...linha,
    unidadeId: linha.unidade_id,
    unidadeNome: linha.unidade_nome,
    obsUnidade: linha.obs_unidade,
    obsFranqueadora: linha.obs_franqueadora,
    solicitanteNome: linha.solicitante_nome,
    criadoEm: dataSb(linha.criado_em),
    aprovadoEm: dataSb(linha.aprovado_em),
    enviadoEm: dataSb(linha.enviado_em),
    recebidoEm: dataSb(linha.recebido_em),
    canceladoEm: dataSb(linha.cancelado_em),
    atualizadoPorNome: linha.atualizado_por_nome,
    atualizadoEm: dataSb(linha.atualizado_em),
  })
}

async function listar(tabela: Tabela, unidadeId: string | null = null): Promise<Linha[]> {
  const linhas: Linha[] = []
  const pagina = 500
  const banco = requireSupabase()
  for (;;) {
    const consulta = banco.from(tabela).select('*').order('id').range(linhas.length, linhas.length + pagina - 1)
    if (unidadeId) consulta.eq('unidade_id', unidadeId)
    const { data, error } = await consulta.overrideTypes<Linha[], { merge: false }>()
    if (error) throw error
    linhas.push(...data)
    if (data.length < pagina) return linhas
  }
}

const recentes = (a: { criadoEmMs: number }, b: { criadoEmMs: number }) => b.criadoEmMs - a.criadoEmMs

export async function carregarEstoqueSb(unidadeId: string | null): Promise<DadosEstoque> {
  const [itens, movimentos, contagens, pedidos] = await Promise.all([
    listar('estoque_itens'), listar('estoque_movimentos', unidadeId),
    listar('estoque_contagens', unidadeId), listar('estoque_pedidos', unidadeId),
  ])
  return {
    itens: itens.map(mapItemSb).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    movimentos: movimentos.map(mapMovimentoSb).sort(recentes),
    contagens: contagens.map(mapContagemSb).sort(recentes),
    pedidos: pedidos.map(mapPedidoSb).sort(recentes),
  }
}

async function gravar(tabela: Tabela, id: string | null, campos: Record<string, unknown>): Promise<string> {
  const destino = requireSupabase().from(tabela)
  const consulta = id === null ? destino.insert(campos) : destino.update(campos).eq('id', id)
  const { data, error } = await consulta.select('id').single()
  if (error) throw error
  return data.id
}

export function salvarItemSb(existente: ItemEstoque | null, f: ItemForm): Promise<string> {
  return gravar('estoque_itens', existente?.id ?? null, {
    nome: f.nome.trim().slice(0, 120),
    codigo: f.codigo.trim().slice(0, 40),
    categoria: f.categoria,
    unidade_medida: f.unidadeMedida,
    estoque_minimo: Math.trunc(f.estoqueMinimo),
    preco_sugerido_centavos: centavosDe(f.preco) ?? 0,
    descricao: f.descricao.trim().slice(0, 500),
    ativo: f.ativo,
    gerado_por_ia: f.geradoPorIA,
    ia_modelo: f.geradoPorIA ? f.iaModelo.trim().slice(0, 80) : '',
  })
}

export async function registrarMovimentoSb(item: ItemEstoque, tipo: TipoManual, quantidade: number, motivo: string): Promise<void> {
  const { error } = await requireSupabase().rpc('registrar_movimento_estoque', {
    p_item_id: item.id, p_item_nome: item.nome, p_unidade_medida: item.unidadeMedida,
    p_tipo: tipo, p_quantidade: quantidade, p_motivo: motivo.trim().slice(0, 300),
  })
  if (error) throw error
}

const unidade = (autor: Usuario) => ({ unidade_id: autor.unidadeId ?? '', unidade_nome: autor.unidade ?? '' })
const nota = (obs: string) => obs.trim().slice(0, 1000)

export async function salvarContagemSb(autor: Usuario, existente: Pick<Contagem, 'id'> | null, linhas: LinhaContagem[], obs: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc('salvar_contagem_aberta_estoque', {
    p_id: existente?.id ?? null, p_itens: linhas, p_obs: nota(obs),
  })
  if (!error) return data
  if (error.code !== 'PGRST202') throw error
  return gravar('estoque_contagens', existente?.id ?? null, {
    ...(existente ? {} : unidade(autor)),
    itens: linhas, total_itens: linhas.length, total_divergencias: divergencias(linhas), obs: nota(obs),
  })
}

export async function confirmarContagemSb(contagem: Pick<Contagem, 'id' | 'itens'>, saldoAtual: Map<string, number>, obs: string): Promise<number> {
  const { data, error } = await requireSupabase().rpc('confirmar_contagem_estoque', {
    p_id: contagem.id, p_itens: recalcularContagem(contagem.itens, saldoAtual), p_obs: nota(obs),
  })
  if (error) throw error
  return data
}

export async function cancelarContagemSb(contagem: Pick<Contagem, 'id'>): Promise<void> {
  await gravar('estoque_contagens', contagem.id, { status: 'cancelada' })
}

export function criarPedidoSb(autor: Usuario, linhas: LinhaPedido[], obs: string): Promise<string> {
  return gravar('estoque_pedidos', null, {
    ...unidade(autor), itens: linhas.map((linha) => ({ ...linha, quantidadeEnviada: 0 })),
    total_itens: linhas.length, obs_unidade: nota(obs),
  })
}

export async function cancelarPedidoUnidadeSb(pedido: Pedido, obs: string): Promise<void> {
  await gravar('estoque_pedidos', pedido.id, { status: 'cancelado', obs_unidade: nota(obs) })
}

export async function receberPedidoSb(pedido: Pedido, obs: string): Promise<number> {
  const { data, error } = await requireSupabase().rpc('receber_pedido_estoque', { p_id: pedido.id, p_obs: nota(obs) })
  if (error) throw error
  return data
}

export async function aprovarPedidoSb(pedido: Pedido, obs: string): Promise<void> {
  await gravar('estoque_pedidos', pedido.id, { status: 'aprovado', obs_franqueadora: nota(obs) })
}

export async function enviarPedidoSb(pedido: Pedido, enviadas: number[], obs: string): Promise<void> {
  const itens = pedido.itens.map((linha, i) => ({
    ...linha, quantidadeEnviada: Math.max(0, Math.min(100_000, Math.trunc(enviadas[i] ?? linha.quantidade))),
  }))
  await gravar('estoque_pedidos', pedido.id, { status: 'enviado', itens, obs_franqueadora: nota(obs) })
}

export async function cancelarPedidoRedeSb(pedido: Pedido, obs: string): Promise<void> {
  await gravar('estoque_pedidos', pedido.id, { status: 'cancelado', obs_franqueadora: nota(obs) })
}
