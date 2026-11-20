// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export class ErroMigracao extends Error {}

export function mascararEmails(texto) {
  return texto.replace(/([^\s@"<>(),;]+)@([\p{L}\p{N}.-]+)/gu, (_, nome, dominio) =>
    `${Array.from(nome)[0]}***@${dominio}`)
}

const raiz = fileURLToPath(new URL('../../', import.meta.url))

async function resolverDestino(caminho) {
  try {
    return await realpath(caminho)
  } catch (erro) {
    if (erro.code !== 'ENOENT') throw erro
    // Um link pendente deve falhar em vez de ser tratado como diretório novo.
    const entrada = await lstat(caminho).catch(falha => {
      if (falha.code !== 'ENOENT') throw falha
    })
    if (entrada) throw new ErroMigracao('Não foi possível resolver o diretório local.')
    return join(await resolverDestino(dirname(caminho)), basename(caminho))
  }
}

export async function diretorioExterno(dir) {
  if (!dir) throw new ErroMigracao('Informe o diretório com --dir.')
  const destino = await resolverDestino(resolve(dir))
  const interno = relative(await realpath(raiz), destino)
  if (interno !== '..' && !interno.startsWith(`..${sep}`) && !isAbsolute(interno)) {
    throw new ErroMigracao('Escolha um diretório fora do repositório.')
  }
  return destino
}

export async function prepararDiretorio(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  if (((await stat(dir)).mode & 0o777) !== 0o700) {
    throw new ErroMigracao('Use um diretório privado de exportação com permissão 0700.')
  }
}

export async function gravarAtomico(dir, nome, gravar) {
  const pasta = await mkdtemp(join(dir, '.gravacao-'))
  const temporario = join(pasta, `${nome}.tmp`)
  try {
    const arquivo = await open(temporario, 'wx', 0o600)
    let resultado
    try {
      resultado = await gravar(arquivo)
      await arquivo.sync()
    } finally {
      await arquivo.close()
    }
    await rename(temporario, join(dir, nome))
    return resultado
  } finally {
    await rm(pasta, { recursive: true, force: true })
  }
}

export function gravarJson(dir, nome, dados) {
  return gravarAtomico(dir, nome, arquivo => arquivo.writeFile(`${JSON.stringify(dados, null, 2)}\n`))
}

export async function lerJson(dir, nome, padrao) {
  try {
    return JSON.parse(await readFile(join(dir, nome), 'utf8'))
  } catch (erro) {
    if (erro.code === 'ENOENT' && padrao !== undefined) return padrao
    throw erro
  }
}

export function lerOpcoes(args, permitidas) {
  const opcoes = {}
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]
    const nome = flag.slice(2)
    if (!flag.startsWith('--') || !Object.hasOwn(permitidas, nome) || Object.hasOwn(opcoes, nome)) {
      throw new ErroMigracao('Opção inválida ou repetida.')
    }
    const tipo = permitidas[nome]
    if (tipo === 'flag') {
      opcoes[nome] = true
      continue
    }
    const valor = args[++i]
    if (!valor || valor.startsWith('--')) throw new ErroMigracao(`Informe um valor para ${flag}.`)
    opcoes[nome] = tipo === 'numero' ? Number(valor) : valor
  }
  return opcoes
}
