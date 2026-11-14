import type { Audiencia, Papel, Usuario } from '../types'

export interface PessoaAcesso {
  uid: string
  ativo: boolean
  recusado?: boolean
  papel: Papel | string
  unidade: string
}

export function calcularUids(
  audiencia: Pick<Audiencia, 'publico' | 'unidades' | 'papeis' | 'uidsExtra'>,
  usuarios: PessoaAcesso[],
): string[] {
  if (audiencia.publico) return []
  const ids = new Set(audiencia.uidsExtra.map((id) => id.trim()).filter(Boolean))
  const unidades = new Set(audiencia.unidades.map((unidade) => unidade.trim()).filter(Boolean))
  const papeis = new Set(audiencia.papeis)
  for (const usuario of usuarios) {
    if (!usuario.ativo || usuario.recusado) continue
    if (papeis.has(usuario.papel as Papel) || (usuario.unidade && unidades.has(usuario.unidade))) {
      ids.add(usuario.uid)
    }
  }
  return [...ids]
}

export function usuarioVe(
  item: Pick<Audiencia, 'publico' | 'uids'>,
  usuario: Pick<Usuario, 'uid' | 'papel'>,
): boolean {
  if (usuario.papel === 'admin') return true
  if (item.publico) return true
  return item.uids.includes(usuario.uid)
}
