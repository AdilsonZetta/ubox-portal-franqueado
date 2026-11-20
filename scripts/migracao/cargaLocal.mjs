// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { aplicarEsquema, carregarPerfis, lerExportacao } from '../migrar-usuarios.mjs'
import { randomUUID } from 'node:crypto'
import { ErroMigracao, gravarJson, lerJson } from './arquivosLocais.mjs'
import { planejarImportacao } from './mapearUsuarios.mjs'

export async function prepararBancoLocal(db, dir, arquivoMapa = 'mapa-usuarios.json') {
  const dados = await lerExportacao(dir)
  const mapa = await lerJson(dir, arquivoMapa)
  const plano = planejarImportacao(dados, { gerarId: uid => Object.hasOwn(mapa, uid) ? mapa[uid] : null })
  if (plano.authUsers.some(conta => !conta.id)) throw new ErroMigracao('O mapa de usuários da exportação está incompleto.')
  // A API administrativa já gerou esses UUIDs no A1. Reconstitui as contas
  // apenas na tabela auth.users de teste, sem criar conexão de rede.
  await db.query('begin')
  try {
    await aplicarEsquema(db)
    for (const { id, email } of plano.authUsers) {
      await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email])
    }
    await carregarPerfis({ query: db.query.bind(db), transaction: executar => executar(db) }, plano)
    await db.query('commit')
  } catch (erro) {
    await db.query('rollback').catch(() => {})
    throw erro
  }
}

// Ensaio local sem `aplicar`: gera (uma vez) UUIDs de ensaio em arquivo próprio,
// sem tocar no mapa-usuarios.json real. Grok Bot.
export async function mapaDeEnsaio(dir) {
  const real = await lerJson(dir, 'mapa-usuarios.json', null)
  if (real) return 'mapa-usuarios.json'
  const arquivo = 'mapa-usuarios-ensaio.json'
  if (!await lerJson(dir, arquivo, null)) {
    const dados = await lerExportacao(dir)
    const plano = planejarImportacao(dados)
    const mapa = Object.fromEntries(Object.keys(plano.mapaUids).map(uid => [uid, randomUUID()]))
    await gravarJson(dir, arquivo, mapa)
  }
  return arquivo
}
