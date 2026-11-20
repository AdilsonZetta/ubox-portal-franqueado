// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { planejarImportacao } from './migracao/mapearUsuarios.mjs'

const raiz = fileURLToPath(new URL('../', import.meta.url))
const supabase = join(raiz, 'supabase')
const tabelas = {
  'auth.users': 'authUsers',
  'public.unidades': 'unidades',
  'public.usuarios': 'usuarios',
  'public.admin_lock': 'adminLock',
}

async function lerExportacao(dir) {
  const arquivos = ['auth', 'usuarios', 'unidades', 'config']
  const entradas = await Promise.all(arquivos.map(async (nome) => [
    nome,
    JSON.parse(await readFile(join(dir, `${nome}.json`), 'utf8')),
  ]))
  return Object.fromEntries(entradas)
}

async function aplicarEsquema(db) {
  await db.exec(await readFile(join(supabase, 'tests/local/auth_stub.sql'), 'utf8'))
  const pasta = join(supabase, 'migrations')
  const arquivos = (await readdir(pasta)).filter((nome) => nome.endsWith('.sql')).sort()
  for (const arquivo of arquivos) {
    await db.exec(await readFile(join(pasta, arquivo), 'utf8'))
  }
}

async function inserir(tx, tabela, linha) {
  // As tabelas e colunas vêm do script e do mapeador. Os dados entram exclusivamente como parâmetros.
  const colunas = Object.keys(linha)
  const parametros = colunas.map((coluna, i) => {
    const parametro = `$${i + 1}`
    return coluna === 'criado_em' || coluna === 'atualizado_em'
      ? `coalesce(${parametro}::timestamptz, now())`
      : parametro
  })
  await tx.query(
    `insert into ${tabela} (${colunas.join(', ')}) values (${parametros.join(', ')})`,
    Object.values(linha),
  )
}

async function carregarPlano(db, plano) {
  return db.transaction(async (tx) => {
    for (const conta of plano.authUsers) await inserir(tx, 'auth.users', conta)
    for (const unidade of plano.unidades) await inserir(tx, 'public.unidades', { ...unidade, uid: null })
    for (const usuario of plano.usuarios) await inserir(tx, 'public.usuarios', usuario)
    for (const { id, uid } of plano.unidades) {
      if (uid !== null) await tx.query('update public.unidades set uid = $1 where id = $2', [uid, id])
    }
    if (plano.adminLock) await inserir(tx, 'public.admin_lock', plano.adminLock)

    const relatorio = []
    for (const [tabela, chave] of Object.entries(tabelas)) {
      const { rows: [{ total }] } = await tx.query(`select count(*)::int as total from ${tabela}`)
      const previsto = plano.contagens[chave]
      relatorio.push({ tabela, previsto, total })
    }
    if (relatorio.some(({ previsto, total }) => previsto !== total)) {
      imprimirRelatorio(plano, relatorio)
      throw new Error('Contagens divergentes', { cause: 'contagens' })
    }
    return relatorio
  })
}

function imprimirRelatorio(plano, relatorio) {
  console.log('Ensaio de importação no PGlite em memória')
  for (const { tabela, total, previsto } of relatorio) {
    console.log(`- ${tabela} — ${total} no banco, ${previsto} no plano`)
  }
  console.log(`Contas sem perfil importado — ${plano.contagens.contasSemPerfil}`)
  console.log(`Perfis ignorados — ${plano.contagens.perfisIgnorados}`)
  console.log(`Contas ignoradas por e-mail duplicado — ${plano.contagens.contasDuplicadas}`)
  console.log(`Avisos — ${plano.avisos.length}`)
  for (const aviso of plano.avisos) console.log(`- ${aviso}`)
}

async function gravarMapa(dir, mapaUids) {
  const caminhoRelativo = relative(await realpath(raiz), dir)
  if (caminhoRelativo !== '..' && !caminhoRelativo.startsWith(`..${sep}`) && !isAbsolute(caminhoRelativo)) {
    return
  }

  // A renomeação substitui a entrada de destino sem seguir um eventual link para outro arquivo.
  const temporario = await mkdtemp(join(dir, '.mapa-uids-'))
  try {
    const arquivo = join(temporario, 'mapa-uids.json')
    await writeFile(arquivo, `${JSON.stringify(mapaUids, null, 2)}\n`, { mode: 0o600 })
    await rename(arquivo, join(dir, 'mapa-uids.json'))
  } finally {
    await rm(temporario, { recursive: true })
  }
  console.log('Mapa de UIDs gravado em mapa-uids.json no diretório da exportação.')
}

async function ensaiar(dirInformado) {
  let etapa = 'ler e mapear a exportação'
  try {
    const dir = await realpath(dirInformado ?? join(raiz, 'scripts/migracao/exemplo'))
    const plano = planejarImportacao(await lerExportacao(dir))
    etapa = 'preparar o esquema SQL local'
    const db = new PGlite()
    let relatorio
    try {
      await aplicarEsquema(db)
      etapa = 'carregar e conferir as tabelas'
      relatorio = await carregarPlano(db, plano)
    } finally {
      await db.close()
    }

    imprimirRelatorio(plano, relatorio)
    etapa = 'gravar o mapa de UIDs'
    if (dirInformado) await gravarMapa(dir, plano.mapaUids)
    console.log('Contagens conferidas. As pessoas definirão uma nova senha no primeiro acesso.')
    return 0
  } catch (erro) {
    // Mensagens de exceção podem trazer trechos dos arquivos ou parâmetros SQL.
    if (erro.cause === 'contagens') {
      console.error('As contagens do banco divergem do plano de importação.')
    } else {
      const codigo = typeof erro.code === 'string' && /^[A-Z0-9_]{2,20}$/.test(erro.code)
        ? ` (código ${erro.code})`
        : ''
      console.error(`Falha ao ${etapa}${codigo}.`)
    }
    return 1
  }
}

async function executar([comando, opcao, dir, ...extras]) {
  if (comando === 'aplicar') {
    console.log('A importação real só será executada no cutover (fase 15), com aprovação explícita.')
    return 2
  }
  if (comando === 'exportar') {
    console.log('Use o firebase-admin em um ambiente local com credenciais já configuradas.')
    console.log('Exporte UID, e-mail e metadados das contas para auth.json, os documentos de usuários e unidades para usuarios.json e unidades.json, e a trava de admin para config.json.')
    console.log('Grave os quatro arquivos em um diretório fora do repositório. Exclua senhas e hashes da exportação.')
    return 2
  }
  if (comando === 'ensaio' && (opcao === undefined || (opcao === '--dir' && dir && extras.length === 0))) {
    return ensaiar(dir)
  }

  console.error('Uso — node scripts/migrar-usuarios.mjs ensaio [--dir <diretório>] | aplicar | exportar')
  return 2
}

process.exitCode = await executar(process.argv.slice(2))
