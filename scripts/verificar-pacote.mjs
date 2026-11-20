import { readFileSync } from 'node:fs'
import { verificarConteudoPacote } from './lib/verificar-pacote.mjs'

try {
  if (process.argv.length !== 3) throw new Error('Uso: node scripts/verificar-pacote.mjs <arquivo.json>')
  verificarConteudoPacote(JSON.parse(readFileSync(process.argv[2], 'utf8')))
} catch (erro) {
  console.error(erro.message)
  process.exitCode = 1
}
