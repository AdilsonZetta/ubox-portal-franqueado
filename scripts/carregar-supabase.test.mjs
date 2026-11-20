// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'
import { aplicar, aplicarEsquema } from './migrar-usuarios.mjs'
import { carregar } from './carregar-supabase.mjs'

const executarNode = promisify(execFile)

it('ensaia a exportação completa, reverte a simulação e retoma um módulo interrompido', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ubox-carga-'))
  const db = new PGlite()
  try {
    await cp(new URL('./migracao/exemplo-carga/', import.meta.url), dir, { recursive: true })
    await aplicarEsquema(db)
    await aplicar({
      dir, db, abrirBanco: async () => db, log() {},
      env: { SUPABASE_URL: 'https://example.com', SUPABASE_SECRET_KEY: 'sb_secret_simulada', SUPABASE_DB_URL: 'postgres://example.com' },
      criarCliente: () => ({ auth: { admin: {
        listUsers: async () => ({ data: { users: [] } }),
        createUser: async ({ email }) => {
          const id = crypto.randomUUID()
          await db.query('insert into auth.users values ($1, $2)', [id, email])
          return { data: { user: { id } } }
        },
      } } }),
    })
    const mensagens = []
    const carga = { db, dir, log: mensagem => mensagens.push(mensagem) }
    const simulado = await carregar({ ...carga, simular: true, zerar: true })
    expect(simulado.verificacao.documentos.banco).toBe(1)
    expect((await db.query('select * from documentos')).rows).toEqual([])
    await expect(carregar({ ...carga, depoisDeInserir: tabela => {
      if (tabela === 'chamados') throw Error('interrupção injetada')
    } })).rejects.toThrow(/chamados/)
    expect((await db.query('select * from documentos')).rows).toHaveLength(1)
    expect((await db.query('select * from chamados')).rows).toHaveLength(0)

    await expect(carregar(carga)).rejects.toThrow(/saldo negativo/)
    expect((await db.query('select item_id, saldo from estoque_saldos')).rows).toEqual([{ item_id: 'item', saldo: '3' }])
    const relatorio = JSON.parse(await readFile(join(dir, 'relatorio-carga.json'), 'utf8'))
    expect(relatorio.saldosNegativos).toEqual([{ unidade_id: 'unidade', item_id: 'negativo', saldo: '-2', zerado: false }])
    const final = await carregar({ ...carga, zerar: true })
    expect(final.pendencias).toEqual([])
    expect(final.camposDesconhecidos).toEqual([])
    for (const [tabela, esperado] of Object.entries({
      ...Object.fromEntries(Object.keys(final.verificacao).map(nome => [nome, 1])),
      estoque_movimentos: 5, estoque_saldos: 2, criar_conta_tentativas: 0,
    })) expect(final.verificacao[tabela].banco, tabela).toBe(esperado)
    expect((await db.query("select saldo from estoque_saldos where item_id = 'negativo'")).rows).toEqual([{ saldo: '0' }])
    const retomado = await carregar({ ...carga, zerar: true })
    expect(retomado.modulos.chamados).toBe('ignorado')
    expect(Object.values(retomado.inseridas).every(total => total === 0)).toBe(true)
    expect(Object.keys(final.verificacao)).toHaveLength(58)
    const refeito = await carregar({ ...carga, refazer: 'chamados', zerar: true })
    expect(Object.values(refeito.inseridas).reduce((total, n) => total + n, 0)).toBe(0)
    expect((await db.query(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'crm_leads'
        and column_name in ('nome', 'telefone', 'email', 'interesse_uso', 'interesse_tamanho', 'interesse_periodo')
    `)).rows).toEqual([])
    expect((await db.query(`select to_jsonb(l)::text as lead from crm_leads l`)).rows[0].lead)
      .not.toMatch(/telefone|email|example\.com|99123/)
    expect((await db.query('select email from crm_contatos')).rows).toEqual([{ email: 'cliente@example.com' }])
    expect((await db.query('select email from clientes')).rows).toEqual([{ email: 'cliente@example.com' }])
    expect((await db.query("select to_char(criado_em, 'US') as micros from chamados")).rows).toEqual([{ micros: '123456' }])
    const { stderr } = await executarNode(process.execPath, [
      fileURLToPath(new URL('./carregar-supabase.mjs', import.meta.url)),
      '--dir', dir, '--contra-pglite', join(dir, 'pglite'), '--simular', '--saldo-negativo=zerar',
    ], { env: {} })
    expect(stderr).toBe('')
    expect(await stat(join(dir, 'pglite', 'PG_VERSION'))).toBeDefined()
    const relatorioCli = JSON.parse(await readFile(join(dir, 'relatorio-carga.json'), 'utf8'))
    expect(relatorioCli.inseridas.documentos).toBe(1)
    expect(mensagens).toContain('documentos — banco 1, exportados 1, gravados nesta execução 1.')
    expect(mensagens.some(msg => msg.startsWith('0 pendências, 0 campos desconhecidos e 1 saldos negativos'))).toBe(true)
    expect(JSON.stringify(mensagens)).not.toMatch(/cliente@example\.com|99123/)
    expect((await stat(join(dir, 'relatorio-carga.json'))).mode & 0o777).toBe(0o600)
  } finally {
    await db.close()
    await rm(dir, { recursive: true, force: true })
  }
}, 60000)
