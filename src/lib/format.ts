export function paraMillis(valor: unknown): number {
  if (!valor) return 0
  if (typeof valor === 'number') return valor
  if (valor instanceof Date) return valor.getTime()
  if (typeof valor === 'object' && 'toMillis' in valor && typeof valor.toMillis === 'function') {
    return valor.toMillis()
  }
  if (typeof valor === 'object' && valor && 'seconds' in valor && typeof valor.seconds === 'number') {
    return valor.seconds * 1000
  }
  return 0
}

export function formatarData(valor: unknown): string {
  const ms = paraMillis(valor)
  if (!ms) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms))
}

export function formatarDia(valor: unknown): string {
  const ms = paraMillis(valor)
  if (!ms) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(ms))
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome
}

export function rotuloTipo(tipo: string): string {
  const mapa: Record<string, string> = {
    pop: 'POP',
    manual: 'Manual',
    processo: 'Processo',
    politica: 'Política',
    checklist: 'Checklist',
    html: 'Manual interativo',
  }
  return mapa[tipo] ?? tipo
}

export function codigoCertificado(trilhaId: string): string {
  const sufixo = Date.now().toString(36).toUpperCase()
  const prefixo = trilhaId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'UBX'
  return `UBX-${prefixo}-${sufixo}`
}
