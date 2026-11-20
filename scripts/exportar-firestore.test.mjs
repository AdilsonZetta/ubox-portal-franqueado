// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { mkdtemp, readFile, readdir, rm, stat, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { exportarFirestore } from './exportar-firestore.mjs'
import { resumirArquivo } from './migracao/formatoExportacao.mjs'

let pasta
afterEach(async () => {
  if (pasta) await rm(pasta, { recursive: true, force: true })
})

async function preparar() {
  pasta = await mkdtemp(join(tmpdir(), 'ubox-exportacao-'))
  const dir = join(pasta, 'saida')
  const listarColecoes = async (pai) => ({
    '': ['chamados', 'usuarios'],
    'chamados/a': ['eventos'],
    'chamados/b': ['eventos'],
    'chamados/ausente': ['eventos'],
  })[pai] ?? []
  const listarDocumentos = async (path) => path === 'chamados'
    ? ['a', 'b', 'ausente']
    : ['x']
  const lerDocumento = vi.fn(async path => path === 'chamados/ausente' ? undefined : { texto: path })
  const listarUsuarios = vi.fn(async () => ({
    users: [{ uid: 'x', email: 'x@ubox.test', metadata: { creationTime: 'data' }, passwordHash: 'excluir' }],
  }))
  return { dir, fonte: { listarColecoes, listarDocumentos, lerDocumento, listarUsuarios }, log: vi.fn() }
}

it('exporta subcoleções agrupadas, inclui filhos de pais ausentes e retoma arquivos concluídos', async () => {
  const opcoes = await preparar()
  const { dir, fonte } = opcoes
  await exportarFirestore(opcoes)
  const bytes = await readFile(join(dir, 'chamados__eventos.jsonl'), 'utf8')
  expect(bytes.trim().split('\n').map(JSON.parse)).toEqual(['a', 'b', 'ausente'].map(id => ({
    path: `chamados/${id}/eventos/x`, pai: `chamados/${id}`, id: 'x',
    data: { texto: `chamados/${id}/eventos/x` },
  })))
  const { arquivos } = JSON.parse(await readFile(join(dir, 'manifest.json')))
  expect(arquivos['chamados__eventos.jsonl']).toEqual(resumirArquivo(bytes, 3))
  const [auth] = JSON.parse(await readFile(join(dir, 'auth.json')))
  expect(auth).toEqual({ uid: 'x', email: 'x@ubox.test', metadata: { creationTime: 'data' } })
  expect((await stat(dir)).mode & 0o777).toBe(0o700)
  for (const nome of await readdir(dir)) expect((await stat(join(dir, nome))).mode & 0o777).toBe(0o600)
  fonte.lerDocumento.mockClear()
  await exportarFirestore(opcoes)
  expect(fonte.lerDocumento).not.toHaveBeenCalled()
  await exportarFirestore({ ...opcoes, refazer: true })
  expect(fonte.lerDocumento).toHaveBeenCalled()
})

it('simula sem criar arquivos e recusa caminhos internos, inclusive por link simbólico', async () => {
  const opcoes = await preparar()
  await exportarFirestore({ ...opcoes, simular: true })
  expect(await readdir(pasta)).toEqual([])
  await expect(exportarFirestore({ ...opcoes, dir: 'saida-interna' })).rejects.toThrow(/fora do repositório/)
  await symlink(process.cwd(), join(pasta, 'atalho'))
  await expect(exportarFirestore({ ...opcoes, dir: join(pasta, 'atalho', 'saida-interna') }))
    .rejects.toThrow(/fora do repositório/)
})

it('mantém o arquivo incompleto fora da saída e retoma o restante após uma falha', async () => {
  const opcoes = await preparar()
  const { dir, fonte } = opcoes
  const ler = fonte.lerDocumento.getMockImplementation()
  fonte.lerDocumento.mockImplementation(async path => {
    if (path === 'chamados/b/eventos/x') throw new Error('Interrupção de teste')
    return ler(path)
  })
  await expect(exportarFirestore(opcoes)).rejects.toThrow('Interrupção de teste')
  expect(await readdir(dir)).toEqual(['chamados.jsonl', 'estado.json'])
  const { arquivos } = JSON.parse(await readFile(join(dir, 'estado.json')))
  expect(Object.keys(arquivos)).toEqual(['chamados.jsonl'])

  fonte.lerDocumento.mockClear().mockImplementation(ler)
  await exportarFirestore(opcoes)
  expect(fonte.lerDocumento).not.toHaveBeenCalledWith('chamados/a')
  expect(fonte.lerDocumento).toHaveBeenCalledWith('chamados/b/eventos/x')
})

it('registra no manifesto o padrão de um nome longo demais para o sistema de arquivos', async () => {
  const opcoes = await preparar()
  const colecao = 'á'.repeat(100)
  opcoes.fonte.listarColecoes = async pai => pai ? [] : [colecao]
  await exportarFirestore(opcoes)
  const { colecoes } = JSON.parse(await readFile(join(opcoes.dir, 'manifest.json')))
  const [[nome, padrao]] = Object.entries(colecoes)
  expect(padrao).toEqual([colecao])
  const linha = JSON.parse(await readFile(join(opcoes.dir, nome)))
  expect(linha.path).toBe(`${colecao}/x`)
})
