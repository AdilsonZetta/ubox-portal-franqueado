import type { Usuario } from '../types'

/** null significa todos os módulos (admin da franqueadora). Sem a lista, ninguém mais recebe módulo. */
export function modulosEfetivos(usuario: Usuario | null | undefined): string[] | null {
  if (!usuario) return []
  if (usuario.papel === 'admin') return null
  return usuario.modulosLiberados ?? []
}

export function podeModulo(usuario: Usuario | null | undefined, slug: string, simulando: boolean): boolean {
  if (!usuario) return false
  if (usuario.papel === 'admin' && !simulando) return true
  return modulosEfetivos(usuario)?.includes(slug) ?? false
}
