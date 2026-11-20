export interface VinculoPacote {
  tipo: 'categoria' | 'documento' | 'trilha' | 'curso' | 'prova' | 'checklist'
  chave: string
  alvoId: string
}

export function idChavePacote(tipo: VinculoPacote['tipo'], chave: string): string {
  // As chaves v1 só contêm letras minúsculas, dígitos e hífens.
  return `${tipo}:${chave}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 150)
}
