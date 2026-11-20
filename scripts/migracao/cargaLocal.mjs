// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { aplicarEsquema, carregarPerfis, lerExportacao } from '../migrar-usuarios.mjs'
import { ErroMigracao, lerJson } from './arquivosLocais.mjs'
import { planejarImportacao } from './mapearUsuarios.mjs'

export async function prepararBancoLocal(db, dir) {
  const dados = await lerExportacao(dir)
  const mapa = await lerJson(dir, 'mapa-usuarios.json')
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
