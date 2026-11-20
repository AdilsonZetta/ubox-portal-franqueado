// Roda os testes pgTAP de supabase/tests num Postgres local em memória (PGlite), sem Docker.
// Carrega: imitação do auth do Supabase -> migrações em ordem -> pgTAP -> cada *.test.sql.
// Feito por Grok Bot no Cursor (Antigravity sem cota).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const raiz = new URL('../', import.meta.url)
const ler = (rel) => readFileSync(new URL(rel, raiz), 'utf8')

async function pgtap() {
  const cache = new URL('node_modules/.cache/pgtap-1.3.3.sql', raiz)
  if (existsSync(cache)) return readFileSync(cache, 'utf8')
  const { execSync } = await import('node:child_process')
  const tmp = '/tmp/pgtap-1.3.3'
  execSync(`mkdir -p ${tmp} && curl -sfL -o ${tmp}/pgtap.zip https://api.pgxn.org/dist/pgtap/1.3.3/pgtap-1.3.3.zip && unzip -qo ${tmp}/pgtap.zip -d ${tmp}`)
  const sql = readFileSync(`${tmp}/pgtap-1.3.3/sql/pgtap.sql.in`, 'utf8').replace('__OS__', 'linux').replace('__VERSION__', '1.3')
  mkdirSync(new URL('node_modules/.cache/', raiz), { recursive: true })
  writeFileSync(cache, sql)
  return sql
}

const migracoes = readdirSync(new URL('supabase/migrations/', raiz)).filter((f) => f.endsWith('.sql')).sort()
const testes = readdirSync(new URL('supabase/tests/', raiz)).filter((f) => f.endsWith('.test.sql')).sort()
const tap = await pgtap()
let falhas = 0
let total = 0
for (const teste of testes) {
  const db = new PGlite()
  await db.exec(ler('supabase/tests/local/auth_stub.sql'))
  for (const m of migracoes) await db.exec(ler(`supabase/migrations/${m}`))
  await db.exec(tap)
  const linhas = []
  try {
    const res = await db.exec(ler(`supabase/tests/${teste}`))
    for (const r of res) for (const row of r.rows) for (const v of Object.values(row)) if (typeof v === 'string' && v) linhas.push(...v.split('\n'))
  } catch (erro) {
    console.error(`${teste}: erro ao rodar: ${erro.message}`)
    falhas++
  }
  const plano = linhas.find((l) => /^1\.\.\d+/.test(l))
  const oks = linhas.filter((l) => /^ok \d+/.test(l)).length
  const nao = linhas.filter((l) => /^not ok \d+/.test(l))
  for (const l of linhas) if (/^(not ok|#)/.test(l)) console.error(l)
  total += oks
  if (nao.length || !plano || Number(plano.split('..')[1]) !== oks + nao.length) falhas++
  console.log(`${teste}: ${oks} ok, ${nao.length} falha(s) (plano ${plano ?? '?'})`)
  await db.close()
}
console.log(falhas ? `\nsupabase: ${falhas} arquivo(s) com falha` : `\nsupabase: ${total} casos ok`)
process.exit(falhas ? 1 : 0)
