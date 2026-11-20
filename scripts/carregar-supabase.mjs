// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  diretorioExterno, ErroMigracao, gravarJson, lerJson, lerOpcoes, prepararDiretorio,
} from './migracao/arquivosLocais.mjs'
import { lerCarga } from './migracao/cargaExportacao.mjs'
import { modulos } from './migracao/transformacoes/index.mjs'
import { validarParesCrm } from './migracao/transformacoes/crm.mjs'

// Uso: node scripts/carregar-supabase.mjs aplicar --dir <exportação>
// Ensaio com rollback: acrescentar --simular (ou trocar aplicar por ensaio).
// --contra-pglite <diretório privado> grava em um destino local persistente.
// Ambos os destinos usam os UUIDs que migrar-usuarios aplicar gravou no mapa.
const saldos = 'estoque_saldos'
const fundacao = {
  'auth.users': 'auth.json',
  unidades: 'unidades',
  usuarios: 'usuarios',
  admin_lock: 'config.json',
  criar_conta_tentativas: null,
}
const hash = valor => createHash('sha256').update(JSON.stringify(valor)).digest('hex')
const somar = (objeto, chave, total = 1) => { objeto[chave] = (objeto[chave] ?? 0) + total }

function prepararRelatorio({ arquivos, porColecao }) {
  const exportadas = Object.fromEntries([...porColecao].map(([nome, { documentos }]) => [nome, documentos]))
  return {
    exportadas, previstas: {}, inseridas: {}, pendencias: [], camposDesconhecidos: [],
    saldosNegativos: [], verificacao: {}, modulos: {},
    fundamentos: Object.fromEntries(Object.entries(fundacao).map(([tabela, fonte]) => [
      tabela, exportadas[fonte] ?? arquivos[fonte]?.documentos ?? arquivos[fonte + '.json']?.documentos ?? 0,
    ])),
  }
}

function registrarDocumento(relatorio, entrada, doc, ctx) {
  const { linhas, pendencias, desconhecidos } = entrada.transformar(doc, ctx)
  for (const item of pendencias) relatorio.pendencias.push({ caminho: doc.path, ...item })
  for (const campo of desconhecidos) relatorio.camposDesconhecidos.push({ caminho: doc.path, tabela: entrada.nome, campo })
  return linhas.map(linha => ({ ...linha, caminho: doc.path }))
}

async function existe(db, { tabela, coluna, valor, unidade }) {
  // Identificadores internos das transformações. Valores da exportação são parâmetros.
  const filtroUnidade = unidade === undefined ? '' : ' and unidade_id = $2'
  const parametros = unidade === undefined ? [valor] : [valor, unidade]
  const { rows } = await db.query(`select 1 from public.${tabela} where ${coluna} = $1${filtroUnidade}`, parametros)
  return rows.length > 0
}

async function inserir(db, { tabela, linha, pk, json = [] }) {
  const colunas = Object.keys(linha)
  const valores = colunas.map(coluna => json.includes(coluna) && linha[coluna] !== null
    ? JSON.stringify(linha[coluna]) : linha[coluna])
  const parametros = colunas.map((_, indice) => '$' + (indice + 1))
  const { rows } = await db.query(
    `insert into public.${tabela} (${colunas.join(', ')})
     values (${parametros.join(', ')}) on conflict (${pk.join(', ')}) do nothing returning 1`, valores,
  )
  return rows.length
}

async function transacao(db, externa, executar) {
  await db.query(externa ? 'savepoint modulo' : 'begin')
  try {
    await db.query('set constraints all deferred')
    const resultado = await executar()
    // Força a conferência dos pares adiados mesmo na simulação com rollback global.
    await db.query('set constraints all immediate')
    await db.query(externa ? 'release savepoint modulo' : 'commit')
    return resultado
  } catch (erro) {
    await db.query(externa ? 'rollback to savepoint modulo' : 'rollback').catch(() => {})
    throw erro
  }
}

async function inicializarSaldos(db, relatorio, zerar) {
  // A fase 11 usa new.delta em cada movimento. A soma independe da ordem histórica.
  await db.query('lock table public.estoque_movimentos in share mode')
  const consulta = 'select unidade_id, item_id, sum(delta) as saldo from public.estoque_movimentos group by 1, 2'
  const { rows } = await db.query(`select unidade_id, item_id, saldo::text from (${consulta}) s
    where saldo < 0 order by unidade_id, item_id`)
  relatorio.saldosNegativos = rows.map(linha => ({ ...linha, zerado: zerar }))
  const { rows: [{ total }] } = await db.query(`select count(*)::integer as total from (${consulta}) s`)
  relatorio.previstas[saldos] = total
  const { rows: gravadas } = await db.query(`
    insert into public.estoque_saldos as destino (unidade_id, item_id, saldo)
    select unidade_id, item_id, greatest(saldo, 0) from (${consulta}) s
    where saldo >= 0 or $1::boolean
    on conflict (unidade_id, item_id) do update set saldo = excluded.saldo
      where destino.saldo is distinct from excluded.saldo
    returning 1
  `, [zerar])
  return gravadas.length
}

async function verificar(db, relatorio) {
  const fontes = new Map(Object.entries(relatorio.fundamentos))
  fontes.set(saldos, relatorio.previstas[saldos] ?? null)
  for (const entradas of Object.values(modulos)) {
    for (const [colecao, { nome }] of Object.entries(entradas)) fontes.set(nome, relatorio.exportadas[colecao] ?? 0)
  }
  for (const [tabela, exportados] of fontes) {
    const qualificada = tabela === 'auth.users' ? tabela : 'public.' + tabela
    const { rows: [{ banco }] } = await db.query(`select count(*)::integer as banco from ${qualificada}`)
    relatorio.verificacao[tabela] = { banco, exportados, previstas: relatorio.previstas[tabela] ?? null }
  }
}

function imprimir(relatorio, log) {
  if (relatorio.simulado) log('Simulação com rollback. As contagens abaixo mostram a carga antes da reversão.')
  // IDs, campos arbitrários e valores de origem ficam no relatório privado, inclusive tokens de painel.
  for (const [tabela, { banco, exportados }] of Object.entries(relatorio.verificacao)) {
    log(`${tabela} — banco ${banco}, exportados ${exportados ?? '—'}, gravados nesta execução ${relatorio.inseridas[tabela] ?? 0}.`)
  }
  const { pendencias, camposDesconhecidos, saldosNegativos } = relatorio
  const porMotivo = new Map()
  for (const { tabela, motivo } of pendencias) {
    const chave = tabela ? tabela + ' — ' + motivo : motivo
    porMotivo.set(chave, (porMotivo.get(chave) ?? 0) + 1)
  }
  for (const [motivo, n] of porMotivo) log(`Pendências (${n}) — ${motivo}.`)
  const campos = new Set(camposDesconhecidos.map(({ campo }) =>
    /^[a-z][a-z_]{0,59}$/i.test(campo) ? campo : '#' + hash(campo).slice(0, 12)))
  if (campos.size) log('Campos desconhecidos — ' + [...campos].sort().join(', ') + '.')
  for (const { unidade_id, item_id, saldo, zerado } of saldosNegativos) {
    log(`Saldo ${saldo} — unidade #${hash(unidade_id).slice(0, 12)}, item #${hash(item_id).slice(0, 12)} (${zerado ? 'zerado' : 'omitido'}).`)
  }
  log(`${pendencias.length} pendências, ${camposDesconhecidos.length} campos desconhecidos e ${saldosNegativos.length} saldos negativos. Detalhes em relatorio-carga.json.`)
}

const conhecidosFundacao = {
  unidades: new Set('nome cidade responsavel email uid modulosLiberados ativo criadoPor criadoEm atualizadoEm'.split(' ')),
  usuarios: new Set('uid nome email papel ativo recusado unidade cidade unidadeId modulosLiberados criadoPor criadoEm atualizadoEm'.split(' ')),
  config: new Set(['uid', 'email', 'criadoEm']),
}
function relatarColecoesSemDestino(relatorio, porColecao) {
  const rotas = new Set(Object.values(modulos).flatMap(Object.keys))
  for (const [colecao, { docs }] of porColecao) {
    if (rotas.has(colecao)) continue
    for (const doc of docs) {
      const campos = Object.hasOwn(conhecidosFundacao, colecao) && (colecao !== 'config' || doc.id === 'adminCriado')
        ? conhecidosFundacao[colecao] : null
      if (!campos) relatorio.pendencias.push({ caminho: doc.path, motivo: 'coleção ou documento sem tabela de destino' })
      const bruto = doc.data.__tipo === 'mapa' ? doc.data.campos : doc.data
      for (const campo of Object.keys(bruto)) {
        if (!campos?.has(campo)) relatorio.camposDesconhecidos.push({ caminho: doc.path, campo })
      }
    }
  }
}

function codigoSql(erro) {
  return typeof erro.code === 'string' && /^[A-Z0-9]{5}$/.test(erro.code) ? ` (${erro.code})` : ''
}

export async function carregar({
  dir, db, destino = 'local', simular = false, refazer, zerar = false, log = console.log, depoisDeInserir,
  arquivoMapa = 'mapa-usuarios.json',
}) {
  if (refazer && refazer !== saldos && !Object.hasOwn(modulos, refazer)) throw new ErroMigracao('Módulo inválido para --refazer.')
  dir = await diretorioExterno(dir)
  await prepararDiretorio(dir)
  const exportacao = await lerCarga(dir, arquivoMapa)
  const { mapa, porColecao, caminhos } = exportacao
  // app.da_api() na fase 1 só reconhece anon/authenticated. Como postgres,
  // os gatilhos de carimbo (inclusive os da fase 4) devolvem NEW sem alteração.
  const { rows: [sessao] } = await db.query('select current_user as papel, app.da_api() as api')
  if (sessao.papel !== 'postgres' || sessao.api) throw new ErroMigracao('A carga exige uma sessão postgres fora da API.')
  const { rows: perfis } = await db.query('select firebase_uid, id from public.usuarios where firebase_uid is not null')
  const existentes = new Map(perfis.map(({ firebase_uid, id }) => [firebase_uid, id]))
  if (Object.keys(mapa).length && !perfis.length) throw new ErroMigracao('Execute migrar-usuarios aplicar no destino antes da carga.')
  const ctx = {
    uid: uid => Object.hasOwn(mapa, uid) && existentes.get(uid) === mapa[uid] ? mapa[uid] : null,
    temDocumento: caminho => caminhos.has(caminho),
  }
  const relatorio = { ...prepararRelatorio(exportacao), simulado: simular }
  relatarColecoesSemDestino(relatorio, porColecao)
  const arquivoEstado = 'carga-estado.json'
  let modulo = 'verificação'
  let caminho
  let tabela
  let bloqueado = false
  if (simular) await db.query('begin')
  try {
    const estado = simular ? {} : await lerJson(dir, arquivoEstado, {})
    const concluidos = estado[destino] ?? {}
    const mapaHash = hash(Object.keys(mapa).sort().map(uid => [uid, ctx.uid(uid)]))
    const lotes = [...Object.entries(modulos), [saldos, null]]
    for (const [nome, entradas] of lotes) {
      modulo = nome
      caminho = tabela = undefined
      const assinatura = hash(entradas
        ? [mapaHash, ...Object.keys(entradas).map(colecao => porColecao.get(colecao)?.sha256)]
        : [concluidos.estoque, zerar])
      const candidatas = Object.entries(entradas ?? {}).flatMap(([colecao, entrada]) =>
        (porColecao.get(colecao)?.docs ?? []).flatMap(doc => registrarDocumento(relatorio, entrada, doc, ctx)))
      const linhas = nome === 'crm' ? validarParesCrm(candidatas, relatorio.pendencias) : candidatas
      for (const item of linhas) somar(relatorio.previstas, item.tabela)
      const anterior = concluidos[nome]
      if (entradas && !simular && refazer !== nome && anterior?.assinatura === assinatura) {
        relatorio.pendencias.push(...anterior.pendencias)
        relatorio.modulos[nome] = 'ignorado'
        continue
      }

      const inicioPendencias = relatorio.pendencias.length
      const inseridas = await transacao(db, simular, async () => {
        const contagem = {}
        if (!entradas) {
          contagem[saldos] = await inicializarSaldos(db, relatorio, zerar)
          return contagem
        }
        const chaves = new Map()
        for (const item of linhas) {
          caminho = item.caminho
          tabela = item.tabela
          if (item.depende && !await existe(db, item.depende)) {
            relatorio.pendencias.push({ caminho, tabela, motivo: 'documento pai ausente no destino' })
            continue
          }
          const chave = JSON.stringify([tabela, ...item.pk.map(coluna => item.linha[coluna] ?? null)])
          // IDs textuais de subcoleções podem coincidir entre pais distintos.
          // Chaves geradas no SQL já incluem os identificadores dos dois níveis.
          if (item.pk.every(coluna => Object.hasOwn(item.linha, coluna)) && chaves.has(chave)) {
            relatorio.pendencias.push({
              caminho, tabela, motivo: 'chave primária repetida na origem', anterior: chaves.get(chave),
            })
            continue
          }
          chaves.set(chave, caminho)
          somar(contagem, tabela, await inserir(db, item))
          await depoisDeInserir?.(tabela)
        }
        return contagem
      })
      Object.assign(relatorio.inseridas, inseridas)
      bloqueado = nome === saldos && relatorio.saldosNegativos.length > 0 && !zerar
      relatorio.modulos[nome] = bloqueado ? 'saldo negativo' : simular ? 'simulado' : 'concluído'
      if (!simular) {
        if (bloqueado) delete concluidos[nome]
        else concluidos[nome] = { assinatura, pendencias: relatorio.pendencias.slice(inicioPendencias) }
        await gravarJson(dir, arquivoEstado, { ...estado, [destino]: concluidos })
      }
    }
    modulo = 'verificação'
    await verificar(db, relatorio)
  } catch (erro) {
    relatorio.modulos[modulo] = 'falhou'
    relatorio.pendencias.push({ caminho, tabela, motivo: 'falha na etapa ' + modulo + codigoSql(erro) })
    throw new ErroMigracao(`Falha na etapa ${modulo}${codigoSql(erro)}. Consulte relatorio-carga.json.`)
  } finally {
    if (simular) await db.query('rollback')
    await gravarJson(dir, 'relatorio-carga.json', relatorio)
    imprimir(relatorio, log)
  }
  if (bloqueado) throw new ErroMigracao('Estoque com saldo negativo. Os pares negativos foram omitidos. Consulte relatorio-carga.json.')
  return relatorio
}

async function principal(args) {
  const comando = ['aplicar', 'ensaio'].includes(args[0]) ? args.shift() : null
  const op = lerOpcoes(args.map(arg => arg === '--saldo-negativo=zerar' ? '--zerar' : arg), {
    dir: 'texto', simular: 'flag', 'contra-pglite': 'texto', zerar: 'flag', refazer: 'texto',
  })
  const local = op['contra-pglite']
  const url = process.env.SUPABASE_DB_URL
  if (!local && !url) throw new ErroMigracao('Informe SUPABASE_DB_URL.')
  const dir = await diretorioExterno(op.dir)
  await prepararDiretorio(dir)
  let db
  let destino
  let arquivoMapa
  try {
    if (local) {
      const { mapaDeEnsaio } = await import('./migracao/cargaLocal.mjs')
      arquivoMapa = await mapaDeEnsaio(dir)
      const pasta = await diretorioExterno(local)
      await prepararDiretorio(pasta)
      destino = hash(await realpath(pasta))
      const { PGlite } = await import('@electric-sql/pglite')
      db = new PGlite(pasta)
      const { rows: [{ inicializado }] } = await db.query("select to_regclass('public.usuarios') is not null as inicializado")
      if (!inicializado) {
        const { prepararBancoLocal } = await import('./migracao/cargaLocal.mjs')
        await prepararBancoLocal(db, dir, arquivoMapa)
      }
    } else {
      const { Client } = await import('pg').catch(erro => {
        if (erro.code === 'ERR_MODULE_NOT_FOUND') throw new ErroMigracao('Instale o driver com npm i --no-save pg.')
        throw erro
      })
      const conexao = new URL(url)
      if (!['postgresql:', 'postgres:'].includes(conexao.protocol) ||
          !conexao.hostname || !conexao.username || conexao.pathname.length < 2) {
        throw new ErroMigracao('Informe uma URL PostgreSQL completa em SUPABASE_DB_URL.')
      }
      destino = hash([conexao.hostname, conexao.port, conexao.pathname, conexao.username])
      db = new Client({ connectionString: url })
      await db.connect()
      await db.query('select pg_advisory_lock(1502, 0)')
    }
    await carregar({
      dir, db, destino, simular: !local && (op.simular || comando === 'ensaio'), refazer: op.refazer, zerar: !!op.zerar, arquivoMapa,
    })
  } finally {
    if (local) await db?.close()
    else await db?.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await principal(process.argv.slice(2)).catch(erro => {
    // Só nome e código: mensagens do driver podem trazer dados pessoais da linha.
    console.error(erro instanceof ErroMigracao ? erro.message : `Não foi possível executar a carga (${erro?.name ?? 'Erro'}${erro?.code ? ' ' + erro.code : ''}).`)
    process.exitCode = 1
  })
}
