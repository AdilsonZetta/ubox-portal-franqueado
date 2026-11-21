type Celula = string | number | null | undefined

function escapar(valor: Celula): string {
  let texto = String(valor ?? '')
  if (typeof valor === 'string' && /^(?:\s*[=+@-]|[\t\r\n])/.test(texto)) texto = "'" + texto
  return /[",;\r\n]/.test(texto) ? '"' + texto.replaceAll('"', '""') + '"' : texto
}

export function montarCsv(cabecalhos: string[], linhas: Celula[][]): string {
  return '\uFEFF' + [cabecalhos, ...linhas].map((linha) => linha.map(escapar).join(',')).join('\r\n')
}

export function exportarCsv(nomeArquivo: string, cabecalhos: string[], linhas: Celula[][]): void {
  const url = URL.createObjectURL(new Blob([montarCsv(cabecalhos, linhas)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo.endsWith('.csv') ? nomeArquivo : nomeArquivo + '.csv'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
