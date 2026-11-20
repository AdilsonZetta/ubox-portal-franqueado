import type { Usuario } from '../types'

/**
 * Módulo 13: Armazenamento em Nuvem.
 * O portal guarda só o link do Google Drive/Docs e os metadados (o Spark não tem Storage).
 * Quem pode abrir o arquivo continua sendo decidido pelo compartilhamento no próprio Drive.
 */
export type Visibilidade = 'rede' | 'unidades' | 'franqueadora' | 'privada'

export interface LinkNuvem {
  id: string
  titulo: string
  descricao: string
  url: string
  pasta: string
  tags: string[]
  visibilidade: Visibilidade
  unidades: string[]
  /** '' = da franqueadora; unidadeId = área privada da unidade. */
  dono: string
  geradoPorIA: boolean
  iaModelo: string
  criadoPorNome: string
  criadoEmMs: number
  atualizadoPorNome: string
  atualizadoEmMs: number
}

export interface LinkForm {
  titulo: string
  descricao: string
  url: string
  pasta: string
  tags: string
  visibilidade: Visibilidade
  unidades: string[]
  geradoPorIA: boolean
  iaModelo: string
}

export const LIMITES = { titulo: 120, descricao: 1000, url: 600, pasta: 60, tag: 30, tags: 10, unidades: 50, iaModelo: 80 } as const

export const ROTULO_VISIBILIDADE: Record<Visibilidade, string> = {
  rede: 'Rede toda',
  unidades: 'Unidades escolhidas',
  franqueadora: 'Só a franqueadora',
  privada: 'Área privada da unidade',
}

export const PASTAS_SUGERIDAS = ['Contratos', 'Financeiro', 'Marketing', 'Operação', 'Treinamentos', 'Jurídico', 'Fotos e vídeos']

/** Igual à regra do Firestore: https e host drive.google.com ou docs.google.com, sem espaços. */
const URL_DRIVE = /^https:\/\/(drive|docs)\.google\.com\/[^ ]*$/

export function urlDriveValida(url: string): boolean {
  return url.length <= LIMITES.url && URL_DRIVE.test(url)
}

export type TipoLink = 'pasta' | 'documento' | 'planilha' | 'apresentacao' | 'formulario' | 'arquivo'

export const ROTULO_TIPO: Record<TipoLink, string> = {
  pasta: 'Pasta',
  documento: 'Documento',
  planilha: 'Planilha',
  apresentacao: 'Apresentação',
  formulario: 'Formulário',
  arquivo: 'Arquivo',
}

export function tipoDoLink(url: string): TipoLink {
  if (/drive\.google\.com\/drive\/(u\/\d+\/)?folders\//.test(url)) return 'pasta'
  if (/docs\.google\.com\/document\//.test(url)) return 'documento'
  if (/docs\.google\.com\/spreadsheets\//.test(url)) return 'planilha'
  if (/docs\.google\.com\/presentation\//.test(url)) return 'apresentacao'
  if (/docs\.google\.com\/forms\//.test(url)) return 'formulario'
  return 'arquivo'
}

/** "Contrato, modelo ,contrato" -> ['contrato', 'modelo']: minúsculas, sem vírgula, sem repetição, até 10 de 30 caracteres. */
export function normalizarTags(texto: string): string[] {
  const vistas = new Set<string>()
  for (const parte of texto.split(',')) {
    const t = parte.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, LIMITES.tag)
    if (t) vistas.add(t)
  }
  return [...vistas].slice(0, LIMITES.tags)
}

export const tagsParaCampo = (tags: string[]) => tags.join(',')

export function tagsDoCampo(campo: string): string[] {
  return campo ? campo.split(',').filter(Boolean) : []
}

export function papelNuvem(usuario: Usuario | null | undefined): 'rede' | 'unidade' | null {
  if (!usuario || !usuario.ativo || usuario.recusado) return null
  const modulos = usuario.modulosLiberados ?? []
  if (usuario.papel === 'admin') return 'rede'
  if (usuario.papel === 'equipe_franqueadora' && modulos.includes('nuvem-rede')) return 'rede'
  if ((usuario.papel === 'franqueado' || usuario.papel === 'equipe_franqueado') && modulos.includes('nuvem') && usuario.unidadeId) return 'unidade'
  return null
}

export function formVazio(papel: 'rede' | 'unidade'): LinkForm {
  return { titulo: '', descricao: '', url: '', pasta: '', tags: '', visibilidade: papel === 'rede' ? 'rede' : 'privada', unidades: [], geradoPorIA: false, iaModelo: '' }
}

export function formDoLink(l: LinkNuvem): LinkForm {
  return { titulo: l.titulo, descricao: l.descricao, url: l.url, pasta: l.pasta, tags: l.tags.join(', '), visibilidade: l.visibilidade, unidades: l.unidades, geradoPorIA: l.geradoPorIA, iaModelo: l.iaModelo }
}

export function validarLink(f: LinkForm, papel: 'rede' | 'unidade'): string[] {
  const erros: string[] = []
  const titulo = f.titulo.trim()
  if (titulo.length < 2 || titulo.length > LIMITES.titulo) erros.push('Informe um título de 2 a 120 caracteres.')
  if (f.descricao.trim().length > LIMITES.descricao) erros.push('A descrição passa de 1000 caracteres.')
  if (!urlDriveValida(f.url.trim())) erros.push('Cole um link https do Google Drive ou Google Docs (drive.google.com ou docs.google.com).')
  const pasta = f.pasta.trim()
  if (!pasta || pasta.length > LIMITES.pasta || pasta.includes('/')) erros.push('Escolha a pasta (até 60 caracteres, sem "/").')
  const brutas = f.tags.split(',').map((t) => t.trim()).filter(Boolean)
  if (brutas.length > LIMITES.tags) erros.push('Use no máximo 10 etiquetas.')
  if (brutas.some((t) => t.length > LIMITES.tag)) erros.push('Cada etiqueta pode ter até 30 caracteres.')
  if (f.geradoPorIA && f.iaModelo.trim().length < 2) erros.push('Informe qual IA escreveu a descrição.')
  if (papel === 'unidade' && f.visibilidade !== 'privada') erros.push('A unidade guarda links só na própria área.')
  if (papel === 'rede') {
    if (f.visibilidade === 'privada') erros.push('A franqueadora não grava na área privada das unidades.')
    if (f.visibilidade === 'unidades' && (f.unidades.length < 1 || f.unidades.length > LIMITES.unidades)) erros.push('Escolha de 1 a 50 unidades.')
  }
  return erros
}

export function agruparPorPasta(links: LinkNuvem[]): Array<{ pasta: string; links: LinkNuvem[] }> {
  const mapa = new Map<string, LinkNuvem[]>()
  for (const l of links) mapa.set(l.pasta, [...(mapa.get(l.pasta) ?? []), l])
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([pasta, ls]) => ({ pasta, links: [...ls].sort((x, y) => x.titulo.localeCompare(y.titulo, 'pt-BR')) }))
}

function sem(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function filtrarLinks(links: LinkNuvem[], busca: string, tag: string): LinkNuvem[] {
  const termo = sem(busca.trim())
  return links.filter((l) => (!tag || l.tags.includes(tag)) && (!termo || sem(`${l.titulo} ${l.descricao} ${l.pasta} ${l.tags.join(' ')}`).includes(termo)))
}

export function todasAsTags(links: LinkNuvem[]): string[] {
  return [...new Set(links.flatMap((l) => l.tags))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function recentes(links: LinkNuvem[], n = 5): LinkNuvem[] {
  return [...links].sort((a, b) => b.criadoEmMs - a.criadoEmMs).slice(0, n)
}

/** Junta os resultados das consultas da unidade sem repetir. */
export function juntarLinks(...listas: LinkNuvem[][]): LinkNuvem[] {
  const mapa = new Map<string, LinkNuvem>()
  for (const l of listas.flat()) mapa.set(l.id, l)
  return [...mapa.values()]
}
