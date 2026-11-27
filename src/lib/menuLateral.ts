/** Regras do menu lateral: no Painel os grupos começam fechados, mas o clique abre. */

/** Depois de navegar: abre o módulo da rota, ou fecha tudo no Painel. `undefined` mantém o estado atual. */
export function expandidoAposNavegar(pathname: string, donoDaRota: string | null): string | undefined {
  if (donoDaRota) return donoDaRota
  if (pathname === '/') return ''
  return undefined
}

export function moduloMenuAberto(expandido: string, slug: string): boolean {
  return expandido === slug
}

export function proximoModuloExpandido(atual: string, slug: string): string {
  return atual === slug ? '' : slug
}
