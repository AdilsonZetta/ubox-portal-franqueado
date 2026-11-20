// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as aguardar } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { PGlite } from '@electric-sql/pglite'
import { exportarFirestore } from './exportar-firestore.mjs'
import { diretorioExterno, ErroMigracao, gravarJson, lerJson, lerOpcoes, mascararEmails } from './migracao/arquivosLocais.mjs'
import { planejarImportacao } from './migracao/mapearUsuarios.mjs'

const raiz = fileURLToPath(new URL('../', import.meta.url))
const supabase = join(raiz, 'supabase')
const tabelas = {
  'auth.users': 'authUsers',
  'public.unidades': 'unidades',
  'public.usuarios': 'usuarios',
  'public.admin_lock': 'adminLock',
}

export async function lerExportacao(dir) {
  const arquivos = ['auth', 'usuarios', 'unidades', 'config']
  const entradas = await Promise.all(arquivos.map(async (nome) => [
    nome,
    JSON.parse(await readFile(join(dir, `${nome}.json`), 'utf8')),
  ]))
  return Object.fromEntries(entradas)
}

export async function aplicarEsquema(db) {
  await db.exec(await readFile(join(supabase, 'tests/local/auth_stub.sql'), 'utf8'))
  const pasta = join(supabase, 'migrations')
  const arquivos = (await readdir(pasta)).filter((nome) => nome.endsWith('.sql')).sort()
  for (const arquivo of arquivos) {
    await db.exec(await readFile(join(pasta, arquivo), 'utf8'))
  }
}

async function inserir(tx, tabela, linha, ignorarConflito = false) {
  // As tabelas e colunas vêm do script e do mapeador. Os dados entram exclusivamente como parâmetros.
  const colunas = Object.keys(linha)
  const parametros = colunas.map((coluna, i) => {
    const parametro = `$${i + 1}`
    return coluna === 'criado_em' || coluna === 'atualizado_em'
      ? `coalesce(${parametro}::timestamptz, now())`
      : parametro
  })
  const conflito = ignorarConflito ? ' on conflict (id) do nothing returning id' : ''
  return tx.query(
    `insert into ${tabela} (${colunas.join(', ')}) values (${parametros.join(', ')})${conflito}`,
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
  for (const aviso of plano.avisos) console.log(mascararEmails(`- ${aviso}`))
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

const opcoesAuth = { auth: { persistSession: false, autoRefreshToken: false } }

function validarUrl(url) {
  let endereco
  try {
    endereco = new URL(url)
  } catch {
    throw new ErroMigracao('Informe SUPABASE_URL com HTTPS.')
  }
  if (endereco.protocol !== 'https:' || endereco.username || endereco.password || endereco.search || endereco.hash) {
    throw new ErroMigracao('Informe SUPABASE_URL com HTTPS e sem credenciais ou parâmetros.')
  }
}

function papelChave(chave) {
  const partes = chave?.split('.') ?? []
  if (partes.length !== 3) return undefined
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')).role
  } catch {
    return undefined
  }
}

async function abrirPostgres(connectionString) {
  const { Client } = await import('pg').catch(erro => {
    if (erro.code === 'ERR_MODULE_NOT_FOUND') throw new ErroMigracao('Instale o PostgreSQL com npm i --no-save pg.')
    throw erro
  })
  const cliente = new Client({ connectionString })
  try {
    await cliente.connect()
  } catch {
    await cliente.end().catch(() => {})
    throw new ErroMigracao('Falha ao conectar ao PostgreSQL.')
  }
  return cliente
}

async function listarContas(admin) {
  const contas = new Map()
  const perPage = 1000
  let page = 1
  let lidas = 0
  try {
    for (;;) {
      const { data, error } = await admin.listUsers({ page, perPage })
      if (error) throw error
      for (const conta of data.users) {
        if (conta.email) contas.set(conta.email.trim().toLowerCase(), conta.id)
      }
      lidas += data.users.length
      // O SDK fornece a indicação de próxima página. A numeração é controlada localmente.
      if (!data.users.length || (!data.nextPage && !(data.total > lidas) && data.users.length < perPage)) {
        return contas
      }
      page++
    }
  } catch {
    throw new ErroMigracao('Falha ao listar as contas do Supabase.')
  }
}

function imprimirPlano(plano, dados, log) {
  const c = plano.contagens
  log(`Plano — ${c.authUsers} contas, ${c.usuarios} perfis, ${c.unidades} unidades, ${c.adminLock} trava de admin.`)
  log(`Perfis ignorados — ${c.perfisIgnorados}. Contas sem perfil — ${c.contasSemPerfil}.`)
  log(`Contas ignoradas — ${c.contasDuplicadas} duplicadas, ${c.contasSemEmail} sem e-mail.`)
  const uidsImportados = new Set(plano.usuarios.map(perfil => perfil.firebase_uid))
  const linhas = [...dados.usuarios.filter(({ id }) => uidsImportados.has(id)), ...dados.unidades]
  const semAutor = linhas.filter(({ data }) => data.criadoPor != null && !Object.hasOwn(plano.mapaUids, data.criadoPor))
  log(`Referências de autoria sem correspondência — ${semAutor.length}.`)
  for (const aviso of plano.avisos) log(mascararEmails(aviso))
}

async function vincularContas(dir, admin, preliminar) {
  const existentes = await listarContas(admin)
  const arquivo = 'mapa-usuarios.json'
  const anterior = await lerJson(dir, arquivo, {})
  const mapa = new Map(Object.entries(anterior))
  const uidPorId = new Map(Object.entries(preliminar.mapaUids).map(([uid, id]) => [id, uid]))
  let criadas = 0
  for (const { id, email } of preliminar.authUsers) {
    const uid = uidPorId.get(id)
    let destino = existentes.get(email)
    if (!destino) {
      try {
        const { data, error } = await admin.createUser({ email, email_confirm: true, user_metadata: { firebase_uid: uid } })
        if (error || !data?.user?.id) throw error
        destino = data.user.id
        criadas++
      } catch {
        throw new ErroMigracao(`Falha ao criar a conta ${mascararEmails(email)}.`)
      }
    }
    if (mapa.get(uid) !== destino) {
      mapa.set(uid, destino)
      await gravarJson(dir, arquivo, Object.fromEntries(mapa))
    }
  }
  // O mapa final reflete somente as contas selecionadas desta exportação.
  const atual = Object.fromEntries([...uidPorId.values()].map(uid => [uid, mapa.get(uid)]))
  if (mapa.size !== uidPorId.size || uidPorId.size === 0) await gravarJson(dir, arquivo, atual)
  return { mapa: atual, criadas }
}

export async function carregarPerfis(db, plano) {
  async function carregar(tx) {
    const novas = []
    for (const unidade of plano.unidades) {
      const { rows } = await inserir(tx, 'public.unidades', { ...unidade, uid: null }, true)
      if (rows.length && unidade.uid !== null) novas.push(unidade)
    }
    for (const usuario of plano.usuarios) await inserir(tx, 'public.usuarios', usuario, true)
    for (const { id, uid } of novas) {
      await tx.query('update public.unidades set uid = $1 where id = $2', [uid, id])
    }
    if (plano.adminLock) await inserir(tx, 'public.admin_lock', plano.adminLock, true)
  }

  try {
    if (typeof db.transaction === 'function') return await db.transaction(carregar)
    await db.query('begin')
    try {
      await carregar(db)
      await db.query('commit')
    } catch (erro) {
      await db.query('rollback')
      throw erro
    }
  } catch (erro) {
    const codigo = typeof erro.code === 'string' && /^[A-Z0-9]{5}$/.test(erro.code) ? ` (${erro.code})` : ''
    throw new ErroMigracao(`Falha na transação de unidades e usuários${codigo}.`)
  }
}

export async function aplicar({
  dir, simular = false, env = process.env, criarCliente = createClient, abrirBanco = abrirPostgres, log = console.log,
}) {
  if (!dir) throw new ErroMigracao('Informe o diretório com --dir.')
  const { SUPABASE_URL: url, SUPABASE_SECRET_KEY: chave, SUPABASE_DB_URL: conexao } = env
  if (!simular) {
    validarUrl(url)
    if (!chave?.startsWith('sb_secret_') && papelChave(chave) !== 'service_role') {
      throw new ErroMigracao('Informe uma chave secreta em SUPABASE_SECRET_KEY.')
    }
    if (!conexao) throw new ErroMigracao('Informe SUPABASE_DB_URL.')
    dir = await diretorioExterno(dir)
  }
  const dados = await lerExportacao(dir)
  const preliminar = planejarImportacao(dados)
  imprimirPlano(preliminar, dados, log)
  if (simular) return preliminar

  const db = await abrirBanco(conexao)
  try {
    const cliente = criarCliente(url, chave, opcoesAuth)
    const { mapa, criadas } = await vincularContas(dir, cliente.auth.admin, preliminar)
    const plano = planejarImportacao(dados, { gerarId: uid => mapa[uid] })
    await carregarPerfis(db, plano)
    log(`Carga concluída — ${criadas} contas criadas, ${plano.authUsers.length - criadas} reutilizadas.`)
    return { ...plano.contagens, criadas }
  } finally {
    if (abrirBanco === abrirPostgres) await db.end()
  }
}

export async function enviarSenha({
  dir, simular = false, lote = 20, intervalo = 3600, env = process.env,
  criarCliente = createClient, esperar = aguardar, log = console.log,
}) {
  if (!dir) throw new ErroMigracao('Informe o diretório com --dir.')
  if (!Number.isSafeInteger(lote) || lote < 1 || !Number.isSafeInteger(intervalo)
    || intervalo < 0 || intervalo * 1000 > 2 ** 31 - 1) {
    throw new ErroMigracao('Informe --lote inteiro positivo e --intervalo inteiro em segundos entre 0 e 2147483.')
  }
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: chave } = env
  if (!simular) {
    validarUrl(url)
    if (!chave?.startsWith('sb_publishable_') && papelChave(chave) !== 'anon') {
      throw new ErroMigracao('Informe uma chave publicável em SUPABASE_PUBLISHABLE_KEY.')
    }
    dir = await diretorioExterno(dir)
  }
  const arquivo = 'envios.json'
  const enviados = new Set(await lerJson(dir, arquivo, []))
  const auth = await lerJson(dir, 'auth.json')
  const enderecos = new Set(auth.map(({ email }) => email?.trim().toLowerCase()).filter(Boolean))
  const pendentes = [...enderecos].filter(email => !enviados.has(email))
  log(`E-mails pendentes — ${pendentes.length}. Lotes previstos — ${Math.ceil(pendentes.length / lote)}.`)
  if (simular || pendentes.length === 0) return { enviados: 0, pendentes: pendentes.length }

  const cliente = criarCliente(url, chave, opcoesAuth)
  let concluidos = enderecos.size - pendentes.length
  for (const email of pendentes) {
    if (concluidos > 0 && concluidos % lote === 0) await esperar(intervalo * 1000)
    const mascarado = mascararEmails(email)
    try {
      const { error } = await cliente.auth.resetPasswordForEmail(email)
      if (error) throw error
    } catch {
      throw new ErroMigracao(`Falha ao enviar o e-mail de senha para ${mascarado}.`)
    }
    enviados.add(email)
    await gravarJson(dir, arquivo, [...enviados])
    concluidos++
    log(`E-mail de senha enviado para ${mascarado}.`)
  }
  return { enviados: pendentes.length, pendentes: 0 }
}

async function executar([comando, ...args]) {
  const dir = { dir: 'texto' }
  const simulacao = { ...dir, simular: 'flag' }
  switch (comando) {
    case 'ensaio': return ensaiar(lerOpcoes(args, dir).dir)
    case 'exportar':
      await exportarFirestore({ ...lerOpcoes(args, { ...simulacao, refazer: 'flag' }), somenteUsuarios: true })
      return 0
    case 'aplicar':
      await aplicar(lerOpcoes(args, simulacao))
      return 0
    case 'enviar-senha':
      await enviarSenha(lerOpcoes(args, { ...simulacao, lote: 'numero', intervalo: 'numero' }))
      return 0
    default:
      console.error('Uso — node scripts/migrar-usuarios.mjs ensaio [--dir <diretório>] | {exportar|aplicar|enviar-senha} --dir <diretório> [--simular]')
      return 2
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await executar(process.argv.slice(2))
  } catch (erro) {
    console.error(erro instanceof ErroMigracao ? erro.message : 'Falha ao executar a migração de usuários.')
    process.exitCode = 1
  }
}
