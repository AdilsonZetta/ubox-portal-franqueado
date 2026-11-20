// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ErroMigracao, lerJson } from './arquivosLocais.mjs'
import { resumirArquivo } from './formatoExportacao.mjs'

export async function lerCarga(dir, arquivoMapa = 'mapa-usuarios.json') {
  const { colecoes, arquivos } = await lerJson(dir, 'manifest.json')
  const mapa = await lerJson(dir, arquivoMapa)
  if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) throw new ErroMigracao('Mapa de usuários inválido.')
  for (const nome of Object.keys(arquivos)) {
    if (nome.endsWith('.jsonl') && !Object.hasOwn(colecoes, nome)) {
      throw new ErroMigracao('O manifesto contém um JSONL sem padrão de coleção.')
    }
  }
  const porColecao = new Map()
  const caminhos = new Set()
  for (const [nome, segmentos] of Object.entries(colecoes)) {
    if (!/^[^/\\]+\.jsonl$/.test(nome) || !Array.isArray(segmentos) || !segmentos.length ||
        segmentos.some(s => typeof s !== 'string' || !s || s.includes('/'))) {
      throw new ErroMigracao('Nome de coleção inválido no manifesto.')
    }
    const colecao = segmentos.join('/')
    if (porColecao.has(colecao)) throw new ErroMigracao('Coleção duplicada no manifesto.')
    const bytes = await readFile(join(dir, nome))
    const linhas = bytes.toString('utf8').split('\n')
    if (linhas.at(-1) === '') linhas.pop()
    const { documentos, sha256 } = resumirArquivo(bytes, linhas.length)
    if (documentos !== arquivos[nome]?.documentos || sha256 !== arquivos[nome]?.sha256) {
      throw new ErroMigracao('Um JSONL diverge da contagem ou do SHA-256 do manifesto.')
    }
    const docs = linhas.map(linha => {
      const doc = JSON.parse(linha)
      const partes = typeof doc?.path === 'string' ? doc.path.split('/') : []
      if (partes.length !== 2 * segmentos.length || partes.some(p => !p) ||
          !segmentos.every((s, i) => s === partes[2 * i]) ||
          doc.id !== partes.at(-1) ||
          doc.pai !== (partes.slice(0, -2).join('/') || null) ||
          !doc.data || Array.isArray(doc.data) || typeof doc.data !== 'object' || caminhos.has(doc.path)) {
        throw new ErroMigracao('Documento inválido ou duplicado na exportação.')
      }
      caminhos.add(doc.path)
      return doc
    })
    porColecao.set(colecao, { docs, documentos, sha256 })
  }
  return { arquivos, mapa, porColecao, caminhos }
}
