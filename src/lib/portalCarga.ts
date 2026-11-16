import type { Usuario } from '../types'

/** null no admin significa todos os módulos. Lista ausente não libera nada. */
export function deveCarregar(usuario: Usuario, slug: 'manuais' | 'universidade'): boolean {
  if (usuario.papel === 'admin') return true
  return (usuario.modulosLiberados ?? []).includes(slug)
}
