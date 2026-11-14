import type { Categoria } from '../types'

export function cadeiaCategoria(categorias: Categoria[], id: string): Categoria[] {
  const mapa = new Map(categorias.map((categoria) => [categoria.id, categoria]))
  const cadeia: Categoria[] = []
  const vistos = new Set<string>()
  let atual = mapa.get(id)
  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id)
    cadeia.unshift(atual)
    atual = atual.parentId ? mapa.get(atual.parentId) : undefined
  }
  return cadeia
}

export function filhosDe(categorias: Categoria[], parentId: string | null): Categoria[] {
  return categorias
    .filter((categoria) => (categoria.parentId || null) === parentId)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function documentosDaCategoria<T extends { categoriaId: string; titulo: string }>(itens: T[], categoriaId: string): T[] {
  return itens
    .filter((item) => item.categoriaId === categoriaId)
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
}
