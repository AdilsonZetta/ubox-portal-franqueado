// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import arquivo from '../../content/pacotes/exemplo-minimo.json?raw'
import app from '../App.tsx?raw'
import pagina from '../pages/admin/ImportarConteudo.tsx?raw'
import { expect, it } from 'vitest'
import { importarPacote, planejarImportacao, validarPacote, type DependenciasImportacao, type ExistentesImportacao, type PacoteConteudo } from './pacoteConteudo'

const exemplo = (): PacoteConteudo => JSON.parse(arquivo)
const existentes = (): ExistentesImportacao => ({ categorias: [], documentos: [], trilha: [], cursos: [], provas: [], checklists: [] })

it('valida o exemplo publicado e preserva o conteúdo', () => {
  expect(validarPacote(exemplo())).toEqual({ ok: true, pacote: exemplo() })
})

it.each<[string, (p: PacoteConteudo) => void]>([
  ['campo desconhecido', (p) => Object.assign(p.cursos[0].prova!.perguntas[0], { extra: true })],
  ['tipo errado', (p) => Object.assign(p, { versao: '1' })],
  ['audiência restrita', (p) => Object.assign(p.documentos[0], { publico: false, unidades: [] })],
  ['chave inválida', (p) => { p.documentos[0].chave = 'A' }],
  ['chave repetida', (p) => { p.documentos[1].chave = p.documentos[0].chave }],
  ['referência inexistente', (p) => { p.documentos[0].categoria = 'ausente' }],
  ['retorno inexistente', (p) => { p.cursos[0].prova!.manualRetorno = 'ausente' }],
  ['ciclo de categoria', (p) => { p.categorias[0].parent = p.categorias[0].chave }],
  ['link HTTP', (p) => { p.documentos[2].htmlUrl = 'http://example.com' }],
  ['anexo HTTP', (p) => { p.documentos[0].anexos = [{ nome: 'Anexo', url: 'http://example.com', tipo: 'link' }] }],
  ['HTML acima do limite em bytes', (p) => { p.documentos[2].htmlConteudo = 'é'.repeat(160000) }],
  ['pacote acima de 5 MB', (p) => {
    p.documentos = Array.from({ length: 18 }, (_, i) => ({
      ...p.documentos[2], chave: 'doc-' + i, titulo: 'Interativo ' + i, htmlConteudo: 'a'.repeat(300 * 1024),
    }))
    p.trilha = []
    p.cursos = []
  }],
  ['duas alternativas corretas', (p) => Object.assign(p.cursos[0].prova!.perguntas[0], { correta: [0, 1] })],
  ['índice fora das opções', (p) => { p.cursos[0].prova!.perguntas[0].correta = 2 }],
  ['poucas opções', (p) => { p.cursos[0].prova!.perguntas[0].opcoes = ['Única'] }],
  ['nota inválida', (p) => { p.cursos[0].prova!.notaMinima = 101 }],
  ['tempo inválido', (p) => { p.trilha[0].tempoMinimoSeg = 29 }],
  ['peso inválido', (p) => { p.checklists[0].itens[0].peso = 11 }],
  ['itens demais', (p) => { p.checklists[0].itens = Array.from({ length: 61 }, (_, i) => ({ ...p.checklists[0].itens[0], id: 'i' + i })) }],
  ['título longo', (p) => { p.documentos[0].titulo = 'x'.repeat(121) }],
])('rejeita %s', (_, alterar) => {
  const pacote = exemplo()
  alterar(pacote)
  expect(validarPacote(pacote).ok).toBe(false)
})

it.each(['__proto__', 'constructor', 'prototype'])('rejeita a propriedade %s em JSON', (chave) => {
  expect(validarPacote(JSON.parse(arquivo.replace('"id":"p1"', `"id":"p1","${chave}":{}`))).ok).toBe(false)
})

it('localiza título e tipo exatos e só atualiza por opção', () => {
  const pacote = exemplo()
  const base = existentes()
  base.documentos.push({ id: 'manual', titulo: pacote.documentos[0].titulo, tipo: 'manual' })
  expect(planejarImportacao(pacote, base).documentos.map((i) => i.acao)).toEqual(['ja-existe', 'criar', 'criar'])
  expect(planejarImportacao(pacote, base, { atualizarExistentes: true }).documentos[0]).toMatchObject({ acao: 'atualizar', existente: { id: 'manual' } })
})

it('resolve referências, segue após falha e usa a base atualizada para retomar', async () => {
  const pacote = exemplo()
  const base = existentes()
  const ordem: string[] = []
  let falhar = true
  const deps: DependenciasImportacao = {
    salvarCategoria: async (f) => { ordem.push('categoria'); base.categorias.push({ ...f, id: 'cat' }); return 'cat' },
    salvarDocumento: async (f) => {
      ordem.push(f.tipo)
      expect(f.categoriaId).toBe('cat')
      expect(f.status).toBe('rascunho')
      base.documentos.push({ ...f, id: f.tipo })
      return f.tipo
    },
    salvarTrilha: async (itens) => {
      ordem.push('trilha')
      expect(itens[0].documentoId).toBe('manual')
      base.trilha = itens.map((i, ordem) => ({ ...i, ordem, anteriorId: '' }))
    },
    salvarCurso: async (f) => {
      ordem.push('curso')
      expect(f.aulas).toEqual(['manual'])
      base.cursos.push({ id: f.id, titulo: f.titulo })
    },
    salvarProva: async (f, versao) => {
      ordem.push('prova')
      expect(f.manualRetornoId).toBe('manual')
      expect(f.perguntas[0].correta).toBe(0)
      expect(versao).toBe(0)
      if (falhar) throw new Error('Falha simulada')
      base.provas.push({ cursoId: f.cursoId, versao: 1 })
    },
    salvarModelo: async (_, f) => {
      ordem.push('checklist')
      base.checklists.push({ ...f, id: 'modelo', versao: 1, totalItens: 1, pesoTotal: 1, criadoEmMs: 0, atualizadoPorNome: 'Admin', atualizadoEmMs: 0 })
      return 'modelo'
    },
  }
  const progresso: number[] = []
  const primeiro = await importarPacote(planejarImportacao(pacote, base, { comoRascunho: true }), deps, (feito) => progresso.push(feito))
  expect(ordem).toEqual(['categoria', 'manual', 'pop', 'html', 'trilha', 'curso', 'prova', 'checklist'])
  expect(primeiro).toMatchObject({ criados: 7, ignorados: 0, erros: [{ chave: 'prova-demo' }] })
  expect(progresso).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  falhar = false
  ordem.length = 0
  expect(await importarPacote(planejarImportacao(pacote, base), deps)).toMatchObject({ criados: 1, ignorados: 7, erros: [] })
  expect(ordem).toEqual(['prova'])
})

it('protege a rota administrativa e não injeta HTML na importação', () => {
  expect(app).toMatch(/path="\/admin\/importar"\s+element=\{<Admin><ImportarConteudo\s*\/><\/Admin>\}/)
  expect(pagina).not.toMatch(/dangerouslySetInnerHTML|srcDoc/)
})

it('valida o tamanho do registro contando o HTML e o texto indexado', () => {
  const pacote = exemplo()
  pacote.documentos[0].conteudoHtml = 'a'.repeat(600000)
  expect(validarPacote(pacote)).toMatchObject({ ok: false, erros: [expect.stringContaining('tamanho do documento')] })
})

it('retoma a ordem do pacote quando um item anterior da trilha falhou', async () => {
  const pacote = exemplo()
  pacote.trilha.push({ ...pacote.trilha[0], chave: 'trilha-pop', documento: 'doc-pop' })
  const base = existentes()
  base.documentos = pacote.documentos.map((d) => ({ ...d, id: d.chave }))
  base.categorias = pacote.categorias.map((c) => ({ ...c, id: c.chave, parentId: null }))
  let falhar = true
  const deps: DependenciasImportacao = {
    salvarCategoria: async () => { throw new Error('Categoria já existe') },
    salvarDocumento: async () => { throw new Error('Documento já existe') },
    salvarTrilha: async (itens) => {
      if (falhar && itens.some((i) => i.documentoId === 'doc-manual')) throw new Error('Falha simulada')
      base.trilha = itens.map((i, index) => ({ ...i, ordem: index + 1, anteriorId: '' }))
    },
    salvarCurso: async () => undefined,
    salvarProva: async () => undefined,
    salvarModelo: async () => 'checklist',
  }
  expect(await importarPacote(planejarImportacao(pacote, base), deps)).toMatchObject({ erros: [{ chave: 'trilha-demo' }] })
  expect(base.trilha.map((t) => t.documentoId)).toEqual(['doc-pop'])
  falhar = false
  await importarPacote(planejarImportacao(pacote, base), deps)
  expect(base.trilha.map((t) => t.documentoId)).toEqual(['doc-manual', 'doc-pop'])
})

it('calcula somente as gravações necessárias para preservar a corrente existente', async () => {
  const { encadearTrilha, alteracoesNaTrilha } = await import('./manuaisTrilha')
  const item = { titulo: 'Manual', etapa: '', tempoMinimoSeg: 30, videoMinutos: 0, ativo: true }
  const antes = encadearTrilha([{ ...item, documentoId: 'a' }, { ...item, documentoId: 'b' }])
  const depois = encadearTrilha([...antes, { ...item, documentoId: 'c' }])
  expect(alteracoesNaTrilha(depois, antes).map((i) => i.documentoId)).toEqual(['c'])
  const meio = encadearTrilha([antes[0], depois[2], antes[1]])
  expect(alteracoesNaTrilha(meio, antes).map((i) => i.documentoId)).toEqual(['c', 'b'])
})
