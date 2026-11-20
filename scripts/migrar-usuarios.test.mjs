// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, expect, it, vi } from 'vitest'
import { aplicar, aplicarEsquema, enviarSenha } from './migrar-usuarios.mjs'

let pasta, db
afterEach(async () => {
  if (db) await db.close()
  if (pasta) await rm(pasta, { recursive: true, force: true })
  db = undefined
})

const env = {
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_SECRET_KEY: 'sb_secret_ficticia',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ficticia',
  SUPABASE_DB_URL: 'postgres://ficticio.test',
}

async function preparar() {
  pasta = await mkdtemp(join(tmpdir(), 'ubox-usuarios-'))
  const dir = join(pasta, 'exportacao')
  await cp(new URL('./migracao/exemplo/', import.meta.url), dir, { recursive: true })
  return { dir, env, log: vi.fn() }
}

it('reutiliza conta paginada, retoma depois de interrupção e mantém a carga SQL idempotente', async () => {
  const opcoes = await preparar()
  db = new PGlite()
  await aplicarEsquema(db)
  const existente = { id: crypto.randomUUID(), email: 'ana@ubox.test' }
  await db.query('insert into auth.users values ($1, $2)', [existente.id, existente.email])
  const usuarios = [existente]
  let interromper = true
  const createUser = vi.fn(async ({ email, ...dados }) => {
    expect(dados).toEqual({ email_confirm: true, user_metadata: { firebase_uid: email.split('@')[0] } })
    const user = { id: crypto.randomUUID(), email }
    await db.query('insert into auth.users values ($1, $2)', [user.id, email])
    usuarios.push(user)
    if (interromper && usuarios.length === 3) throw new Error(`Falha em ${email}`)
    return { data: { user } }
  })
  const listUsers = vi.fn(async ({ page }) => ({
    data: { users: usuarios.slice(page - 1, page), nextPage: page < usuarios.length ? page + 1 : null },
  }))
  Object.assign(opcoes, {
    criarCliente: () => ({ auth: { admin: { createUser, listUsers } } }),
    abrirBanco: async () => db,
  })
  await expect(aplicar(opcoes)).rejects.toThrow('c***@ubox.test')
  const mapaParcial = JSON.parse(await readFile(join(opcoes.dir, 'mapa-usuarios.json')))
  expect(mapaParcial.ana).toBe(existente.id)
  expect(Object.keys(mapaParcial)).toHaveLength(2)
  expect((await db.query('select * from public.usuarios')).rows).toHaveLength(0)
  interromper = false
  await aplicar(opcoes)
  await aplicar(opcoes)
  expect(createUser).toHaveBeenCalledTimes(6)
  expect(listUsers).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }))
  const { rows: [total] } = await db.query(`select
    (select count(*)::int from auth.users) as auth,
    (select count(*)::int from public.usuarios) as perfis,
    (select count(*)::int from public.unidades) as unidades,
    (select count(*)::int from public.admin_lock) as trava`)
  expect(total).toEqual({ auth: 7, perfis: 6, unidades: 2, trava: 1 })
  expect((await stat(join(opcoes.dir, 'mapa-usuarios.json'))).mode & 0o777).toBe(0o600)
  expect(JSON.stringify(opcoes.log.mock.calls)).not.toMatch(/(?:ana|bruno|carla)@/)
}, 30000)

it('recusa chave publicável e HTTP, e simula sem inicializar clientes', async () => {
  const opcoes = await preparar()
  const criarCliente = vi.fn()
  await expect(aplicar({ ...opcoes, criarCliente, env: { ...env, SUPABASE_SECRET_KEY: env.SUPABASE_PUBLISHABLE_KEY } }))
    .rejects.toThrow(/chave secreta/)
  await expect(aplicar({ ...opcoes, criarCliente, env: { ...env, SUPABASE_URL: 'http://supabase.test' } }))
    .rejects.toThrow(/HTTPS/)
  await aplicar({ ...opcoes, criarCliente, env: {}, simular: true })
  expect(criarCliente).not.toHaveBeenCalled()
  expect(opcoes.log).toHaveBeenCalledWith(expect.stringMatching(/Perfis ignorados/))
})

it('envia em lotes com chave publicável, mascara endereços e retoma', async () => {
  const opcoes = await preparar()
  const resetPasswordForEmail = vi.fn(async () => ({}))
  const criarCliente = vi.fn(() => ({ auth: { resetPasswordForEmail } }))
  const esperar = vi.fn(async () => {})
  Object.assign(opcoes, { criarCliente, esperar, lote: 3, intervalo: 7 })
  await enviarSenha({ ...opcoes, simular: true })
  expect(criarCliente).not.toHaveBeenCalled()
  resetPasswordForEmail.mockResolvedValueOnce({}).mockResolvedValueOnce({ error: new Error('bruno@ubox.test') })
  await expect(enviarSenha(opcoes)).rejects.toThrow('b***@ubox.test')
  expect((await enviarSenha(opcoes)).enviados).toBe(6)
  expect((await enviarSenha(opcoes)).enviados).toBe(0)
  expect(resetPasswordForEmail.mock.calls.filter(([email]) => email === 'ana@ubox.test')).toEqual([['ana@ubox.test']])
  expect(esperar.mock.calls).toEqual([[7000], [7000]])
  expect(criarCliente.mock.calls.every(([, chave]) => chave === env.SUPABASE_PUBLISHABLE_KEY)).toBe(true)
  expect(JSON.stringify(opcoes.log.mock.calls)).not.toMatch(/(?:ana|bruno|carla)@/)
})
