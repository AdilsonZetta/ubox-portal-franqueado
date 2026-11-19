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

/** Tipo usado na tela: separa o checklist interativo do manual interativo. */
export type TipoExibicao = 'pop' | 'manual' | 'processo' | 'politica' | 'checklist' | 'checklist_interativo' | 'html'

export const ORDEM_TIPOS_EXIBICAO: TipoExibicao[] = ['pop', 'manual', 'processo', 'politica', 'checklist', 'checklist_interativo', 'html']

const ROTULO_EXIBICAO: Record<TipoExibicao, { rotulo: string; selo: string }> = {
  pop: { rotulo: 'POP', selo: 'POP' },
  manual: { rotulo: 'Manual', selo: 'MAN' },
  processo: { rotulo: 'Processo', selo: 'PRO' },
  politica: { rotulo: 'Política', selo: 'POL' },
  checklist: { rotulo: 'Checklist', selo: 'CHK' },
  checklist_interativo: { rotulo: 'Checklist interativo', selo: 'CHK' },
  html: { rotulo: 'Manual interativo', selo: 'INT' },
}

interface DocumentoTipado {
  tipo: string
  formato?: string
  titulo?: string
  htmlConteudo?: string
  conteudoHtml?: string
}

export function tipoExibicao(documento: DocumentoTipado): TipoExibicao {
  const interativo = documento.formato === 'html' || documento.tipo === 'html'
  if (interativo) {
    const html = `${documento.htmlConteudo ?? ''}${documento.conteudoHtml ?? ''}`
    const caixas = (html.match(/type\s*=\s*["']?checkbox/gi) ?? []).length
    if (documento.tipo === 'checklist' || /checklist/i.test(documento.titulo ?? '') || caixas >= 3) return 'checklist_interativo'
    return 'html'
  }
  return (ORDEM_TIPOS_EXIBICAO as string[]).includes(documento.tipo) ? (documento.tipo as TipoExibicao) : 'manual'
}

export function rotuloExibicao(tipo: TipoExibicao): string {
  return ROTULO_EXIBICAO[tipo].rotulo
}

export function seloExibicao(tipo: TipoExibicao): string {
  return ROTULO_EXIBICAO[tipo].selo
}

/** Filtros de uma pasta: só os tipos que existem nos documentos dela, na ordem fixa. */
export function tiposPresentes(documentos: DocumentoTipado[]): TipoExibicao[] {
  const presentes = new Set(documentos.map(tipoExibicao))
  return ORDEM_TIPOS_EXIBICAO.filter((tipo) => presentes.has(tipo))
}
