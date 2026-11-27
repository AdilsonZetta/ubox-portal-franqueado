import type { Papel } from '../types'

export function destinoPortal(papel: Papel | undefined, caminho: string): string | null {
  if (/^\/painel\/[^/]+\/?$/i.test(caminho)) return null
  const portal = /^\/portal\/?$/i.test(caminho)
  if (papel === 'cliente') return portal ? null : '/portal'
  return papel && portal ? '/' : null
}
