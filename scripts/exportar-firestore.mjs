// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { createHash } from 'node:crypto'
import { lstat, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codificar, criarResumoArquivo, resumirArquivo } from './migracao/formatoExportacao.mjs'
import {
  diretorioExterno, ErroMigracao, gravarAtomico, gravarJson, lerJson, lerOpcoes, mascararEmails, prepararDiretorio,
} from './migracao/arquivosLocais.mjs'

async function abrirFirebase() {
  const appMod = await import('firebase-admin/app').catch(erro => {
    if (erro.code === 'ERR_MODULE_NOT_FOUND') {
      throw new ErroMigracao('Instale o Firebase Admin com npm i --no-save firebase-admin.')
    }
    throw erro
  })
  const { initializeApp, applicationDefault, deleteApp } = appMod
  const { getFirestore, FieldValue, DocumentReference, GeoPoint, Timestamp } = await import('firebase-admin/firestore')
  const { getAuth } = await import('firebase-admin/auth')
  const app = initializeApp({ credential: applicationDefault() })
  const firestore = getFirestore(app)
  firestore.settings({ useBigInt: true })
  return {
    tipos: { DocumentReference, GeoPoint, Timestamp, VectorValue: FieldValue.vector?.()?.constructor },
    async listarColecoes(pai) {
      const raiz = pai ? firestore.doc(pai) : firestore
      return (await raiz.listCollections()).map(ref => ref.id)
    },
    async listarDocumentos(path) {
      return (await firestore.collection(path).listDocuments()).map(ref => ref.id)
    },
    async lerDocumento(path) {
      return (await firestore.doc(path).get()).data()
    },
    listarUsuarios: pagina => getAuth(app).listUsers(1000, pagina),
    obterHashSenhas: () => baixarHashSenhas(app),
    fechar: () => deleteApp(app),
  }
}

async function baixarHashSenhas(app) {
  let GoogleAuth
  try {
    ({ GoogleAuth } = await import('google-auth-library'))
  } catch (erro) {
    if (erro.code === 'ERR_MODULE_NOT_FOUND') return { params: { completo: false }, users: [] }
    throw erro
  }
  const projectId = app.options?.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
    || 'ubox-portal-franqueado'
  const client = await new GoogleAuth({
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/identitytoolkit',
      'https://www.googleapis.com/auth/firebase',
    ],
  }).getClient()
  const { lerHashConfig } = await import('./migracao/senhaFirebase.mjs')
  let params = { completo: false }
  try {
    const res = await client.request({
      url: `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`,
    })
    params = lerHashConfig(res.data)
  } catch {
    params = { completo: false }
  }
  const users = []
  let pageToken
  try {
    do {
      const body = { maxResults: 1000, targetProjectId: projectId }
      if (pageToken) body.nextPageToken = pageToken
      const res = await client.request({
        url: `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchDownload`,
        method: 'POST',
        data: body,
      })
      for (const u of res.data?.users ?? []) {
        users.push({
          uid: u.localId,
          email: u.email ?? null,
          passwordHash: u.passwordHash ?? null,
          salt: u.salt ?? null,
        })
      }
      pageToken = res.data?.nextPageToken
    } while (pageToken)
  } catch {
    return { params, users: [] }
  }
  return { params, users }
}

function nomeColecao(segmentos) {
  const nome = segmentos.map(nome => {
    const codificado = encodeURIComponent(nome)
    // Mantém o separador inequívoco mesmo se o ID tiver sublinhados nas bordas.
    return /^_|_$|__/.test(nome) ? codificado.replaceAll('_', '%5F') : codificado
  }).join('__') + '.jsonl'
  if (Buffer.byteLength(nome) <= 251) return nome
  return `@${createHash('sha256').update(nome).digest('hex')}.jsonl`
}

async function descobrirColecoes(fonte) {
  const colecoes = new Map()
  async function visitar(pai, segmentos) {
    for (const colecao of await fonte.listarColecoes(pai)) {
      const padrao = [...segmentos, colecao]
      const nome = nomeColecao(padrao)
      const caminho = pai ? `${pai}/${colecao}` : colecao
      const ids = await fonte.listarDocumentos(caminho)
      if (!colecoes.has(nome)) colecoes.set(nome, { padrao, documentos: [] })
      for (const id of ids) {
        const path = `${caminho}/${id}`
        colecoes.get(nome).documentos.push({ path, id, pai: pai || null })
        // Um documento ausente ainda pode ter subcoleções.
        await visitar(path, padrao)
      }
    }
  }
  await visitar('', [])
  return colecoes
}

async function* lerColecao(fonte, documentos) {
  for (const documento of documentos) {
    const data = await fonte.lerDocumento(documento.path)
    if (data !== undefined) yield { ...documento, data }
  }
}

async function gravarColecao(dir, nome, fonte, documentos) {
  return gravarAtomico(dir, nome, async arquivo => {
    const resumo = criarResumoArquivo()
    let total = 0
    for await (const { data, ...documento } of lerColecao(fonte, documentos)) {
      const linha = `${JSON.stringify({ ...documento, data: codificar(data, fonte.tipos) })}\n`
      await arquivo.writeFile(linha)
      resumo.adicionar(linha)
      total++
    }
    return resumo.finalizar(total)
  })
}

async function lerAuth(fonte) {
  const contas = []
  let pagina
  do {
    const { users, pageToken } = await fonte.listarUsuarios(pagina)
    for (const { uid, email, emailVerified, disabled, displayName, metadata } of users) {
      const { creationTime, lastSignInTime } = metadata ?? {}
      // listUsers pode trazer um hash redigido; as senhas reais vêm em obterHashSenhas.
      contas.push({ uid, email, emailVerified, disabled, displayName, metadata: { creationTime, lastSignInTime } })
    }
    pagina = pageToken
  } while (pagina)
  return contas
}

const arquivosUsuarios = {
  'auth.json': async fonte => {
    const data = await lerAuth(fonte)
    return { data, total: data.length }
  },
  ...Object.fromEntries(['usuarios', 'unidades'].map(colecao => [`${colecao}.json`, async fonte => {
    const data = []
    for (const id of await fonte.listarDocumentos(colecao)) {
      const valor = await fonte.lerDocumento(`${colecao}/${id}`)
      if (valor !== undefined) data.push({ id, data: codificar(valor, fonte.tipos, { datasLegadas: true }) })
    }
    return { data, total: data.length }
  }])),
  'config.json': async fonte => {
    const trava = await fonte.lerDocumento('config/adminCriado')
    if (trava === undefined) return { data: {}, total: 0 }
    const adminCriado = codificar(trava, fonte.tipos, { datasLegadas: true })
    return { data: { adminCriado }, total: 1 }
  },
}

export async function exportarFirestore({
  dir, fonte, simular = false, refazer = false, somenteUsuarios = false, log = console.log,
}) {
  dir = await diretorioExterno(dir)
  const propria = !fonte
  fonte ??= await abrirFirebase()
  try {
    const colecoes = somenteUsuarios ? new Map() : await descobrirColecoes(fonte)
    const estado = simular ? { arquivos: {} } : await lerJson(dir, 'estado.json', { arquivos: {} })
    const { arquivos } = estado
    const padroes = { ...estado.colecoes, ...Object.fromEntries(
      [...colecoes].map(([nome, { padrao }]) => [nome, padrao]),
    ) }
    const salvarEstado = () => gravarJson(dir, 'estado.json', { arquivos, colecoes: padroes })
    if (!simular) {
      await prepararDiretorio(dir)
      if (refazer) {
        for (const nome of Object.keys(arquivos)) {
          if (Object.hasOwn(arquivosUsuarios, nome) || (!somenteUsuarios && nome.endsWith('.jsonl'))) {
            delete arquivos[nome]
            if (!colecoes.has(nome)) delete padroes[nome]
          }
        }
        await salvarEstado()
      }
    }

    async function processar(nome, contar, gravar) {
      if (!simular && Object.hasOwn(arquivos, nome)) {
        const info = await lstat(join(dir, nome)).catch(erro => {
          if (erro.code !== 'ENOENT') throw erro
        })
        if (info?.isFile()) {
          log(mascararEmails(`${nome} — ${arquivos[nome].documentos} registros já exportados.`))
          return
        }
      }
      let documentos
      if (simular) {
        documentos = await contar()
      } else {
        arquivos[nome] = await gravar()
        await salvarEstado()
        documentos = arquivos[nome].documentos
      }
      log(mascararEmails(`${nome} — ${documentos} registros.`))
    }

    for (const [nome, { documentos }] of colecoes) {
      await processar(nome, async () => {
        let total = 0
        for await (const _ of lerColecao(fonte, documentos)) total++
        return total
      }, () => gravarColecao(dir, nome, fonte, documentos))
    }

    for (const [nome, ler] of Object.entries(arquivosUsuarios)) {
      await processar(nome, async () => (await ler(fonte)).total, async () => {
        const { data, total } = await ler(fonte)
        const bytes = `${JSON.stringify(data, null, 2)}\n`
        await gravarAtomico(dir, nome, arquivo => arquivo.writeFile(bytes))
        return resumirArquivo(bytes, total)
      })
    }
    if (!simular && typeof fonte.obterHashSenhas === 'function') {
      const { hashRedigido, resumoHashes } = await import('./migracao/senhaFirebase.mjs')
      const { params, users } = await fonte.obterHashSenhas()
      const contas = users.map(u => ({
        uid: u.uid || u.localId,
        email: u.email ?? null,
        passwordHash: hashRedigido(u.passwordHash) ? null : u.passwordHash,
        salt: hashRedigido(u.salt) || !u.salt ? null : u.salt,
      }))
      const resumo = resumoHashes(contas, params)
      const paramsArquivo = params.completo
        ? {
            algorithm: params.algorithm,
            rounds: params.rounds,
            memoryCost: params.memoryCost,
            signerKey: params.signerKey,
            saltSeparator: params.saltSeparator,
          }
        : null
      if (paramsArquivo) {
        await gravarJson(dir, 'hash-params.json', paramsArquivo)
      }
      await gravarJson(dir, 'auth-hashes.json', { paramsCompletos: Boolean(paramsArquivo), users: contas })
      await gravarJson(dir, 'auth-hashes-resumo.json', {
        total: resumo.total,
        comHash: resumo.comHash,
        semHash: resumo.semHash,
        paramsCompletos: resumo.paramsCompletos,
        uidsSemHash: resumo.uidsSemHash,
      })
      arquivos['auth-hashes.json'] = { documentos: contas.length }
      log(`Hashes de senha — ${resumo.comHash} com hash, ${resumo.semHash} sem hash, parâmetros ${resumo.paramsCompletos ? 'completos' : 'indisponíveis'}.`)
    }
    if (!simular) {
      if (refazer && !somenteUsuarios) {
        // Remove do manifesto os padrões que desapareceram da fonte.
        const anterior = await lerJson(dir, 'manifest.json', { arquivos: {} })
        for (const nome of Object.keys(anterior.arquivos)) {
          if (nome === join(nome) && !nome.includes('/') && !nome.includes('\\') && nome.endsWith('.jsonl') && !colecoes.has(nome)) {
            await unlink(join(dir, nome)).catch(erro => {
              if (erro.code !== 'ENOENT') throw erro
            })
          }
        }
      }
      await gravarJson(dir, 'manifest.json', { arquivos, colecoes: padroes })
    }
    return { arquivos }
  } finally {
    if (propria) await fonte.fechar()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await exportarFirestore(lerOpcoes(process.argv.slice(2), { dir: 'texto', simular: 'flag', refazer: 'flag' }))
  } catch (erro) {
    console.error(erro instanceof ErroMigracao ? erro.message : 'Falha ao exportar os dados do Firebase.')
    process.exitCode = 1
  }
}
