import type { Usuario } from '../types'

export type StatusPerfil = 'incomplete' | 'pending' | 'rejected' | 'ready'

/**
 * Mesma decisão que o app já fazia com o Firestore, agora compartilhada pelos dois backends.
 * unidadeAtiva: null quando a unidade não foi consultada (perfil sem unidade ou da franqueadora).
 */
export function statusDoPerfil(perfil: Usuario | null, unidadeAtiva: boolean | null): StatusPerfil {
  if (!perfil) return 'incomplete'
  if (perfil.recusado) return 'rejected'
  if (!perfil.ativo) return 'pending'
  if (perfil.papel === 'franqueado' || perfil.papel === 'equipe_franqueado') {
    if (!perfil.unidadeId) return 'pending'
    return unidadeAtiva ? 'ready' : 'pending'
  }
  return 'ready'
}

export function precisaDaUnidade(perfil: Usuario | null): boolean {
  return Boolean(perfil && !perfil.recusado && perfil.ativo && (perfil.papel === 'franqueado' || perfil.papel === 'equipe_franqueado') && perfil.unidadeId)
}
