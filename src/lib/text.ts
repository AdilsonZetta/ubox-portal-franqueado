export function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

export function termos(consulta: string): string[] {
  return normalizar(consulta)
    .split(/[^a-z0-9]+/)
    .filter((termo) => termo.length > 1)
}

export function htmlParaTexto(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Texto curto para busca e IA, sem as figuras embutidas dos manuais. */
export function textoParaIndice(htmlOuTexto: string, max = 12000): string {
  return limitar(htmlParaTexto(htmlOuTexto), max)
}

export function limitar(valor: string, max: number): string {
  return valor.length > max ? valor.slice(0, max) : valor
}

export function pontuarBusca(consulta: string, titulo: string, corpo: string): number {
  const lista = termos(consulta)
  if (!lista.length) return 0
  const tituloN = normalizar(titulo)
  const corpoN = normalizar(corpo)
  let pontos = 0
  for (const termo of lista) {
    if (tituloN.includes(termo)) pontos += 5
    const ocorrencias = corpoN.split(termo).length - 1
    pontos += Math.min(ocorrencias, 5)
  }
  return pontos
}

export function trecho(texto: string, consulta: string, tamanho = 240): string {
  const lista = termos(consulta)
  const base = normalizar(texto)
  let indice = -1
  for (const termo of lista) {
    const achado = base.indexOf(termo)
    if (achado >= 0) {
      indice = achado
      break
    }
  }
  if (indice < 0) return texto.slice(0, tamanho).trim()
  const inicio = Math.max(0, indice - 70)
  const fatia = texto.slice(inicio, inicio + tamanho).trim()
  const prefixo = inicio > 0 ? '…' : ''
  const sufixo = inicio + tamanho < texto.length ? '…' : ''
  return `${prefixo}${fatia}${sufixo}`
}
