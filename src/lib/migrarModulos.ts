export interface PessoaMigracao {
  papel?: string
  ativo?: boolean
  modulosLiberados?: unknown
}

/** Lista a gravar, ou null quando a conta não entra na migração. */
export function modulosDaMigracao(pessoa: PessoaMigracao, catalogo: readonly string[]): string[] | null {
  if (pessoa.papel !== 'franqueado' || pessoa.ativo !== true) return null
  if (Array.isArray(pessoa.modulosLiberados)) return null
  return [...catalogo]
}

/** Lê os slugs de franqueado do catálogo, sem carregar os ícones da interface. */
export function slugsFranqueadoDaFonte(fonte: string): string[] {
  const slugs: string[] = []
  for (const bloco of fonte.split(/\n  \{/)) {
    const slug = bloco.match(/slug: '([^']+)'/)?.[1]
    const audiencia = bloco.match(/audiencia: '([^']+)'/)?.[1]
    if (slug && audiencia === 'franqueado') slugs.push(slug)
  }
  return slugs
}
