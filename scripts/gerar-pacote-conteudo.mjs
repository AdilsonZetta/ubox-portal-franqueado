// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { randomInt } from 'node:crypto'
import { lstat, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { Marked } from 'marked'
import { createServer } from 'vite'
import { embaralharPergunta } from './lib/embaralhar-pergunta.mjs'

const etapas = ['Boas-vindas', 'Implantação', 'Operação', 'Equipe', 'Marketing local', 'Gestão financeira', 'Marca']
const etapaPorNumero = new Map(etapas.map((etapa, indice) => [`0${indice + 1}`, etapa]))
const raizRepo = fileURLToPath(new URL('../', import.meta.url))
const slug = (arquivo) => basename(arquivo).replace(/\.[^.]+$/, '').normalize('NFD')
  .replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const status = (texto) => texto.includes('[A DEFINIR') ? 'rascunho' : 'publicado'
const escaparHtml = (texto) => texto.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const atributoId = /\s+\{#([\w-]+)\}\s*$/
const categoria = (chave, nome, ordem, parent = null) => ({ chave, nome, descricao: '', ordem, parent, publico: true })

const markdown = new Marked({
  renderer: {
    heading({ depth, text, tokens }) {
      const atributo = text.match(atributoId)
      if (!atributo) return false
      const conteudo = this.parser.parseInline(tokens).replace(atributoId, '')
      return `<h${depth} id="${atributo[1]}">${conteudo}</h${depth}>\n`
    },
    html({ text }) {
      return escaparHtml(text)
    },
  },
})

async function lerMateriais(diretorio, filtro) {
  const entradas = await readdir(diretorio, { withFileTypes: true })
  const arquivos = entradas.filter((entrada) => entrada.isFile() && filtro.test(entrada.name))
    .map((entrada) => entrada.name).sort()
  if (!arquivos.length) throw new Error(`Nenhum material encontrado em ${diretorio}.`)
  return Promise.all(arquivos.map(async (nome) => ({
    nome,
    chave: slug(nome),
    texto: await readFile(join(diretorio, nome), 'utf8'),
  })))
}

function lerJson({ nome, texto }) {
  try {
    return JSON.parse(texto)
  } catch (erro) {
    throw new Error(`${nome} — ${erro.message}`)
  }
}

function prepararMarkdown(texto) {
  return texto
    .replace(/<!--[\s\S]*?-->|<![A-Z][^>]*>|<\/?[a-z][\w:-]*(?=[\s/>])(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi, escaparHtml)
}

function documentoMarkdown(material, tipo, categoria, sanitizador, fragmento) {
  const tokens = markdown.lexer(prepararMarkdown(material.texto))
  const h1 = tokens.find((token) => token.type === 'heading' && token.depth === 1)
  if (!h1) throw new Error(`${material.nome} — H1 ausente.`)
  const titulo = fragmento(markdown.parser([{ ...h1, depth: 1 }])).textContent.trim()
  const conteudoHtml = sanitizador.sanitize(markdown.parser(tokens))
  return {
    chave: material.chave, titulo, categoria, tipo, formato: 'richtext',
    status: status(material.texto), publico: true,
    ...(tipo === 'manual' ? { leituraObrigatoria: true } : {}),
    conteudoHtml,
  }
}

function montarCursos(manuais, quizzes) {
  const provas = new Map()
  for (const arquivo of quizzes) {
    const { manual, perguntas } = lerJson(arquivo)
    if (!manuais.some(({ nome }) => nome === manual) || provas.has(manual)) {
      throw new Error(`${arquivo.nome} — Manual inexistente ou prova duplicada: ${manual}.`)
    }
    if (!Array.isArray(perguntas) || perguntas.some(({ opcoes }) => !Array.isArray(opcoes) || opcoes.length !== 4)) {
      throw new Error(`${arquivo.nome} — Cada pergunta deve ter quatro opções.`)
    }
    provas.set(manual, perguntas)
  }

  return manuais.map(({ nome, documento: manual }, indice) => {
    const perguntas = provas.get(nome)
    if (!perguntas) throw new Error(`${nome} — Prova ausente.`)
    const publicado = manual.status === 'publicado'
    return {
      chave: `curso-${manual.chave}`, titulo: `Curso — ${manual.titulo}`,
      descricao: `Estudo do material ${manual.titulo}.`,
      ordem: indice + 1, aulas: [manual.chave], publicado,
      prova: {
        chave: `prova-${manual.chave}`, titulo: `Prova — ${manual.titulo}`,
        notaMinima: 70, manualRetorno: manual.chave, tempoReestudoSeg: 300, publicado,
        perguntas: perguntas.map(({ enunciado, opcoes, correta }, i) => ({ id: `p${i + 1}`, enunciado, opcoes, correta })),
      },
    }
  })
}

async function gerarPacote(origem, geradoEm, { tempoSugeridoSeg, htmlParaTexto }, janela) {
  const [fontesManuais, fontesPops, fontesInterativos, quizzes, fontesChecklists] = await Promise.all([
    lerMateriais(origem, /^0[1-7]-.+\.md$/),
    lerMateriais(join(origem, 'pop'), /\.md$/),
    lerMateriais(join(origem, 'interativos'), /\.html$/),
    lerMateriais(join(origem, 'quiz'), /\.json$/),
    lerMateriais(join(origem, 'checklists'), /\.json$/),
  ])
  const sanitizador = createDOMPurify(janela)
  const manuais = fontesManuais.map((material) => ({
    nome: material.nome,
    documento: documentoMarkdown(material, 'manual', 'manuais', sanitizador, JSDOM.fragment),
    etapa: etapaPorNumero.get(material.nome.slice(0, 2)),
    categoriaPops: `pops-${material.chave}`,
  }))
  if (manuais.length !== etapas.length || new Set(manuais.map(({ etapa }) => etapa)).size !== etapas.length) {
    throw new Error('Informe um manual para cada etapa de 01 a 07.')
  }
  const categorias = [
    categoria('manuais', 'Manuais da Rede UBOX', 1),
    categoria('pops', 'POPs — Procedimentos Operacionais Padrão', 2),
    categoria('interativos', 'Interativos', 3),
    ...manuais.map((manual, indice) => categoria(
      manual.categoriaPops, `POPs — ${manual.documento.titulo.replace(/\s+—\s+UBOX Self Storage$/, "")}`, indice + 1, 'pops',
    )),
  ]
  const pops = fontesPops.map((material) => {
    const manual = manuais.find(({ documento }) => material.chave.startsWith(`${documento.chave}-`))
    if (!manual) throw new Error(`${material.nome} — Manual de origem não identificado.`)
    return documentoMarkdown(material, 'pop', manual.categoriaPops, sanitizador, JSDOM.fragment)
  })
  const interativos = fontesInterativos.map(({ nome, chave, texto }) => {
    const titulo = JSDOM.fragment(texto).querySelector('h1')?.textContent.trim()
    if (!titulo) throw new Error(`${nome} — H1 ausente.`)
    if (/fetch\(|XMLHttpRequest|eval\(|https?:\/\//i.test(texto)) throw new Error(`${nome} — Interativo deve ser autocontido.`)
    return { chave, titulo, categoria: 'interativos', tipo: 'html', formato: 'html', status: status(texto), publico: true, htmlConteudo: texto }
  })
  const trilha = manuais.map(({ documento, etapa }) => ({
    chave: `trilha-${documento.chave}`, documento: documento.chave, etapa,
    tempoMinimoSeg: tempoSugeridoSeg(htmlParaTexto(documento.conteudoHtml), 0),
    videoMinutos: 0, ativo: documento.status === 'publicado',
  }))
  const checklists = fontesChecklists.map((material) => {
    const { titulo, descricao, tipo, frequencia, itens } = lerJson(material)
    if (!Array.isArray(itens)) throw new Error(`${material.nome} — Lista de itens ausente.`)
    return {
      chave: `checklist-${material.chave}`, titulo, descricao, tipo, frequencia,
      publico: true, ativo: true, geradoPorIA: true, iaModelo: 'codex (revisão Grok Bot)',
      itens: itens.map(({ texto, secao, peso, exigeEvidencia, exigeObs }, i) => ({
        id: `i${i + 1}`, texto, secao, peso, exigeEvidencia, exigeObs,
      })),
    }
  })
  return {
    formato: 'ubox-pacote-conteudo', versao: 1, titulo: 'Conteúdo da Rede UBOX — revisão 2026-11', geradoEm,
    categorias, documentos: [...manuais.map(({ documento }) => documento), ...pops, ...interativos],
    trilha, cursos: montarCursos(manuais, quizzes), checklists,
  }
}

async function main() {
  const { positionals: [origem, saida, ...extras], values } = parseArgs({
    allowPositionals: true, options: {
      'gerado-em': { type: 'string' },
      embaralhar: { type: 'boolean', default: true },
    },
    allowNegative: true,
  })
  if (!origem || !saida || extras.length) {
    throw new Error('Uso: node scripts/gerar-pacote-conteudo.mjs <dirOrigem> <saida.json> [--gerado-em <ISO>] [--embaralhar | --no-embaralhar]')
  }

  const raiz = await realpath(raizRepo)
  const pasta = await realpath(dirname(saida))
  const destino = join(pasta, basename(saida))
  const caminhoLocal = relative(raiz, destino)
  const dentroDoRepo = !isAbsolute(caminhoLocal) && caminhoLocal !== '..' && !caminhoLocal.startsWith(`..${sep}`)
  if (dentroDoRepo && !caminhoLocal.startsWith(`pacotes-gerados${sep}`) &&
      !(pasta === join(raiz, 'content', 'pacotes') && basename(destino).endsWith('.real.json'))) {
    throw new Error('Grave o pacote fora do repositório, em pacotes-gerados/ ou com o sufixo .real.json em content/pacotes/.')
  }
  const anterior = await lstat(destino).catch((erro) => {
    if (erro.code !== 'ENOENT') throw erro
    return null
  })
  if (anterior && (!anterior.isFile() || anterior.nlink !== 1)) {
    throw new Error('Informe um arquivo de saída regular, sem links.')
  }

  // Executa os módulos TypeScript do portal localmente, sem abrir um servidor HTTP.
  const vite = await createServer({ root: raizRepo, configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, ws: false, watch: null } })
  const { window } = new JSDOM()
  try {
    const { validarPacote, MAX_BYTES_PACOTE } = await vite.ssrLoadModule('/src/lib/pacoteConteudo.ts')
    const { tempoSugeridoSeg } = await vite.ssrLoadModule('/src/lib/manuaisTrilha.ts')
    const { htmlParaTexto } = await vite.ssrLoadModule('/src/lib/text.ts')
    const pacote = await gerarPacote(origem, values['gerado-em'] ?? new Date().toISOString(), { tempoSugeridoSeg, htmlParaTexto }, window)
    const resultado = validarPacote(pacote)
    if (!resultado.ok) {
      throw new Error(resultado.erros.map((erro) => erro.replace(/pacote\.(\w+)\[(\d+)\]/, (caminho, lista, indice) =>
        `${caminho} (${pacote[lista]?.[indice]?.chave ?? 'sem chave'})`,
      )).join('\n'))
    }
    if (values.embaralhar) {
      for (const curso of pacote.cursos) {
        if (curso.prova) curso.prova.perguntas = curso.prova.perguntas.map((pergunta) => embaralharPergunta(pergunta, randomInt))
      }
    }
    const json = `${JSON.stringify(pacote, null, 2)}\n`
    if (Buffer.byteLength(json) > MAX_BYTES_PACOTE) throw new Error('O arquivo JSON excede o limite de 5 MB.')
    const temporario = await mkdtemp(join(pasta, '.pacote-'))
    try {
      const arquivo = join(temporario, 'pacote.json')
      await writeFile(arquivo, json, { mode: 0o600 })
      await rename(arquivo, destino)
    } finally {
      await rm(temporario, { recursive: true, force: true })
    }
    for (const tipo of ['manual', 'pop', 'html']) {
      const documentos = pacote.documentos.filter((documento) => documento.tipo === tipo)
      const publicados = documentos.filter((documento) => documento.status === 'publicado').length
      console.log(`${tipo}: ${documentos.length} (${documentos.length - publicados} rascunho, ${publicados} publicado)`)
    }
    console.log(`${pacote.categorias.length} categorias, ${pacote.trilha.length} etapas, ${pacote.cursos.length} cursos e provas, ${pacote.checklists.length} checklists.`)
  } finally {
    window.close()
    await vite.close()
  }
}

main().catch((erro) => {
  console.error(erro.message)
  process.exitCode = 1
})
