// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { juntarLinks, LIMITES, normalizarTags, tagsParaCampo, type LinkForm, type LinkNuvem } from './nuvem'
import { mapLink } from './nuvemApi'
import { requireSupabase } from './supabase'
import type { Usuario } from '../types'

type Linha = Record<string, unknown> & { id: string }

function dataSb(valor: unknown): number {
  const ms = typeof valor === 'string' ? Date.parse(valor) : NaN
  return Number.isFinite(ms) ? ms : 0
}

export function mapLinkSb(linha: Linha): LinkNuvem {
  return mapLink(linha.id, {
    ...linha,
    geradoPorIA: linha.gerado_por_ia,
    iaModelo: linha.ia_modelo,
    criadoPorNome: linha.criado_por_nome,
    criadoEm: dataSb(linha.criado_em),
    atualizadoPorNome: linha.atualizado_por_nome,
    atualizadoEm: dataSb(linha.atualizado_em),
  })
}

const tabela = () => requireSupabase().from('nuvem_links')
const selecionar = () => tabela().select('*')
type Consulta = ReturnType<typeof selecionar>

async function listar(filtrar: (consulta: Consulta) => Consulta): Promise<LinkNuvem[]> {
  const links: LinkNuvem[] = []
  const tamanho = 500
  for (;;) {
    const consulta = filtrar(selecionar()).order('id').range(links.length, links.length + tamanho - 1)
    const { data, error } = await consulta.overrideTypes<Linha[], { merge: false }>()
    if (error) throw error
    links.push(...data.map(mapLinkSb))
    if (data.length < tamanho) return links
  }
}

export function carregarLinksRedeSb(): Promise<LinkNuvem[]> {
  return listar((q) => q.eq('dono', ''))
}

export async function carregarLinksUnidadeSb(unidadeId: string): Promise<LinkNuvem[]> {
  // Cita o ID no literal de array do PostgREST, inclusive quando contém vírgula.
  const unidade = '{"' + unidadeId.replace(/["\\]/g, '\\$&') + '"}'
  const [rede, minhas, privada] = await Promise.all([
    listar((q) => q.eq('dono', '').eq('visibilidade', 'rede')),
    listar((q) => q.eq('dono', '').contains('unidades', unidade)),
    listar((q) => q.eq('dono', unidadeId)),
  ])
  return juntarLinks(rede, minhas, privada)
}

function campos(f: LinkForm) {
  return {
    titulo: f.titulo.trim().slice(0, LIMITES.titulo),
    descricao: f.descricao.trim().slice(0, LIMITES.descricao),
    url: f.url.trim(),
    pasta: f.pasta.trim().slice(0, LIMITES.pasta),
    tags: tagsParaCampo(normalizarTags(f.tags)),
    visibilidade: f.visibilidade,
    unidades: f.visibilidade === 'unidades' ? [...new Set(f.unidades)].slice(0, LIMITES.unidades) : [],
    gerado_por_ia: f.geradoPorIA,
    ia_modelo: f.geradoPorIA ? f.iaModelo.trim().slice(0, LIMITES.iaModelo) : '',
  }
}

export async function criarLinkSb(autor: Usuario, papel: 'rede' | 'unidade', f: LinkForm): Promise<string> {
  const dono = papel === 'rede' ? '' : autor.unidadeId ?? ''
  const { data, error } = await tabela().insert({ ...campos(f), dono }).select('id').single()
  if (error) throw error
  return data.id
}

export async function salvarLinkSb(id: string, f: LinkForm): Promise<void> {
  const { error } = await tabela().update(campos(f)).eq('id', id).select('id').single()
  if (error) throw error
}

export async function removerLinkSb(id: string): Promise<void> {
  const { error } = await tabela().delete().eq('id', id).select('id').single()
  if (error) throw error
}
