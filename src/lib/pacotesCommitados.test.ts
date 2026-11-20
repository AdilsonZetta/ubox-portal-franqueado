/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

function arquivosJson(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(pasta, entrada.name)
    if (entrada.isDirectory()) return arquivosJson(caminho)
    return entrada.name.endsWith('.json') ? [caminho] : []
  })
}

function temGabarito(valor: unknown): boolean {
  return valor !== null && typeof valor === 'object' &&
    Object.entries(valor).some(([chave, campo]) => chave === 'correta' || temGabarito(campo))
}

it('mantém os JSONs de conteúdo sem gabaritos', () => {
  const arquivosComGabarito = arquivosJson('content').filter((arquivo) => {
    const texto = readFileSync(arquivo, 'utf8')
    return temGabarito(JSON.parse(texto)) || texto.includes('"correta"')
  })
  expect(arquivosComGabarito).toEqual([])
})
