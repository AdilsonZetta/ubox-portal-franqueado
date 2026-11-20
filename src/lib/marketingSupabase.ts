// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import type { Usuario } from '../types'
import { dataDoInput, mesclarMateriais, type MaterialForm, type PedidoForm } from './marketing'
import { mapCampanha, mapMaterial, mapPedido, type AndamentoPedido, type CampanhaForm } from './marketingApi'
import { requireSupabase } from './supabase'

type Linha = Record<string, unknown> & { id: string }
type Tabela = 'marketing_materiais' | 'marketing_campanhas' | 'marketing_solicitacoes'
type Consulta = ReturnType<ReturnType<ReturnType<typeof requireSupabase>['from']>['select']>

function dataSb(valor: unknown): number {
  const ms = typeof valor === 'string' ? Date.parse(valor) : NaN
  return Number.isFinite(ms) ? ms : 0
}

export function mapMaterialSb(linha: Linha) {
  return mapMaterial(linha.id, {
    ...linha,
    campanhaId: linha.campanha_id,
    previaUrl: linha.previa_url,
    regrasUso: linha.regras_uso,
    validoDe: dataSb(linha.valido_de),
    validoAte: dataSb(linha.valido_ate),
    geradoPorIA: linha.gerado_por_ia,
    iaModelo: linha.ia_modelo,
    atualizadoPorNome: linha.atualizado_por_nome,
    atualizadoEm: dataSb(linha.atualizado_em),
  })
}

export function mapCampanhaSb(linha: Linha) {
  return mapCampanha(linha.id, {
    ...linha,
    inicio: dataSb(linha.inicio),
    fim: dataSb(linha.fim),
    geradoPorIA: linha.gerado_por_ia,
    iaModelo: linha.ia_modelo,
  })
}

export function mapPedidoSb(linha: Linha) {
  return mapPedido(linha.id, {
    ...linha,
    unidadeId: linha.unidade_id,
    unidadeNome: linha.unidade_nome,
    tipoPeca: linha.tipo_peca,
    prazoDesejado: dataSb(linha.prazo_desejado),
    referenciaUrl: linha.referencia_url,
    campanhaId: linha.campanha_id,
    entregaUrl: linha.entrega_url,
    geradoPorIA: linha.gerado_por_ia,
    iaModelo: linha.ia_modelo,
    responsavelNome: linha.responsavel_nome,
    criadoEm: dataSb(linha.criado_em),
    atualizadoEm: dataSb(linha.atualizado_em),
    entregueEm: dataSb(linha.entregue_em),
  })
}

async function listarLinhas(tabela: Tabela, filtrar: (consulta: Consulta) => Consulta = (consulta) => consulta): Promise<Linha[]> {
  const tamanho = 500
  const linhas: Linha[] = []
  const banco = requireSupabase()
  for (let inicio = 0; ; inicio += tamanho) {
    const consulta = filtrar(banco.from(tabela).select('*'))
    const { data, error } = await consulta.order('id').range(inicio, inicio + tamanho - 1).overrideTypes<Linha[], { merge: false }>()
    if (error) throw error
    linhas.push(...data)
    if (data.length < tamanho) return linhas
  }
}

async function gravarLinha(tabela: Tabela, id: string | null, campos: Record<string, unknown>): Promise<string> {
  const tabelaSb = requireSupabase().from(tabela)
  const gravacao = id ? tabelaSb.update(campos).eq('id', id) : tabelaSb.insert(campos)
  const { data, error } = await gravacao.select('id').single()
  if (error) throw error
  return data.id
}

export async function listarMateriaisSb(usuario: Usuario, gestor: boolean) {
  if (gestor) return (await listarLinhas('marketing_materiais')).map(mapMaterialSb)
  const unidade = usuario.unidadeId
  const [rede, direcionados] = await Promise.all([
    listarLinhas('marketing_materiais', (q) => q.eq('ativo', true).eq('publico', true)),
    unidade ? listarLinhas('marketing_materiais', (q) => q.eq('ativo', true).contains('unidades', [unidade])) : [],
  ])
  return mesclarMateriais(rede.map(mapMaterialSb), direcionados.map(mapMaterialSb))
}

export function salvarMaterialSb(id: string | null, f: MaterialForm): Promise<string> {
  return gravarLinha('marketing_materiais', id, {
    titulo: f.titulo.trim().slice(0, 120),
    descricao: f.descricao.trim().slice(0, 1000),
    tipo: f.tipo,
    categoria: f.categoria.trim().slice(0, 60),
    campanha_id: f.campanhaId,
    url: f.url.trim(),
    previa_url: f.previaUrl.trim(),
    formato: f.formato.trim().slice(0, 40),
    regras_uso: f.regrasUso.trim().slice(0, 1000),
    valido_de: dataDoInput(f.validoDe),
    valido_ate: dataDoInput(f.validoAte),
    publico: f.publico,
    unidades: f.publico ? [] : f.unidades.slice(0, 30),
    ativo: f.ativo,
    gerado_por_ia: f.geradoPorIA,
    ia_modelo: f.geradoPorIA ? f.iaModelo.trim().slice(0, 80) : '',
  })
}

export async function listarCampanhasSb(gestor: boolean) {
  const linhas = await listarLinhas('marketing_campanhas', (q) => gestor ? q : q.eq('ativo', true))
  return linhas.map(mapCampanhaSb)
}

export async function salvarCampanhaSb(id: string | null, f: CampanhaForm): Promise<string> {
  const inicio = dataDoInput(f.inicio)
  const fim = dataDoInput(f.fim)
  if (!inicio || !fim) throw new Error('Informe o início e o fim da campanha.')
  if (fim < inicio) throw new Error('A campanha termina antes de começar.')
  if (f.geradoPorIA && f.iaModelo.trim().length < 2) throw new Error('Informe qual IA ou modelo participou.')
  const campos = {
    titulo: f.titulo.trim().slice(0, 120),
    descricao: f.descricao.trim().slice(0, 1000),
    tipo: f.tipo,
    inicio,
    fim,
    ativo: f.ativo,
    gerado_por_ia: f.geradoPorIA,
    ia_modelo: f.geradoPorIA ? f.iaModelo.trim().slice(0, 80) : '',
  }
  if (!id) return gravarLinha('marketing_campanhas', null, campos)
  const { data, error } = await requireSupabase().from('marketing_campanhas').upsert({ id, ...campos }).select('id').single()
  if (error) throw error
  return data.id
}

export async function listarPedidosSb(usuario: Usuario, gestor: boolean) {
  const linhas = await listarLinhas('marketing_solicitacoes', (q) => {
    if (gestor) return q
    if (usuario.papel === 'franqueado' && usuario.unidadeId) return q.eq('unidade_id', usuario.unidadeId)
    return q.eq('uid', usuario.uid)
  })
  return linhas.map(mapPedidoSb).sort((a, b) => b.criadoEmMs - a.criadoEmMs)
}

export function criarPedidoSb(f: PedidoForm): Promise<string> {
  return gravarLinha('marketing_solicitacoes', null, {
    titulo: f.titulo.trim().slice(0, 120),
    tipo_peca: f.tipoPeca,
    descricao: f.descricao.trim().slice(0, 2000),
    medidas: f.medidas.trim().slice(0, 120),
    prazo_desejado: dataDoInput(f.prazoDesejado),
    referencia_url: f.referenciaUrl.trim(),
    campanha_id: f.campanhaId,
  })
}

export async function cancelarPedidoSb(id: string): Promise<void> {
  await gravarLinha('marketing_solicitacoes', id, { status: 'cancelada' })
}

export async function responderPedidoSb(id: string, complemento: string): Promise<void> {
  await gravarLinha('marketing_solicitacoes', id, {
    status: 'aberta',
    complemento: complemento.trim().slice(0, 2000),
  })
}

export async function andamentoPedidoSb(id: string, a: AndamentoPedido): Promise<void> {
  const entregue = a.status === 'entregue'
  await gravarLinha('marketing_solicitacoes', id, {
    status: a.status,
    resposta: a.resposta.trim().slice(0, 2000),
    entrega_url: entregue ? a.entregaUrl.trim() : '',
    gerado_por_ia: entregue && a.geradoPorIA,
    ia_modelo: entregue && a.geradoPorIA ? a.iaModelo.trim().slice(0, 80) : '',
  })
}
