// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import type { Anexo, Audiencia, Usuario, Categoria, Documento } from '../types'
import type { RascunhoCategoria, RascunhoDocumento } from './api'
import { FREQUENCIAS, MAX_ITENS, PESO_MAX, TIPOS_CHECKLIST, validarModelo, type ModeloChecklist, type ModeloForm } from './checklist'
import type { ItemTrilhaEdicao } from './manuaisApi'
import { encadearTrilha, ordenarTrilha, TEMPO_MINIMO_PISO_SEG, TEMPO_MINIMO_TETO_SEG, type ItemTrilhaManual } from './manuaisTrilha'
import { linkHttpsValido } from './marketing'
import { htmlParaTexto } from './text'
import { MAX_AULAS, MAX_OPCOES, MAX_PERGUNTAS, MIN_OPCOES, REESTUDO_PISO_SEG, REESTUDO_TETO_SEG, slugCurso, validarProva, type Curso, type Prova } from './universidade'
import type { CursoEdicao, ProvaEdicao } from './universidadeApi'
import { idChavePacote, type VinculoPacote } from './pacoteChaves'

export const MAX_BYTES_PACOTE = 5 * 1024 * 1024
const MAX_BYTES_INTERATIVO = 300 * 1024
const MAX_TRILHA = 450
// Reserva para campos, carimbos e identificadores que a API acrescenta ao documento.
const MAX_BYTES_DADOS_DOCUMENTO = 1024 * 1024 - 2048
const chaveValida = /^[a-z0-9][a-z0-9-]{1,79}$/
const codificador = new TextEncoder()
const bytes = (valor: string) => codificador.encode(valor).byteLength

interface CategoriaPacote {
  chave: string
  nome: string
  descricao: string
  ordem: number
  parent?: string | null
  publico: true
}

interface DocumentoPacote {
  chave: string
  titulo: string
  categoria: string
  tipo: 'manual' | 'pop' | 'html'
  formato: 'richtext' | 'html'
  status: 'rascunho' | 'publicado'
  publico: true
  leituraObrigatoria?: boolean
  conteudoHtml?: string
  htmlConteudo?: string
  htmlUrl?: string
  anexos?: Anexo[]
}

type TrilhaPacote = Omit<ItemTrilhaEdicao, 'documentoId' | 'titulo'> & { chave: string; documento: string }
type ProvaPacote = Omit<ProvaEdicao, 'cursoId' | 'manualRetornoId'> & { chave: string; manualRetorno: string }
type CursoPacote = Omit<CursoEdicao, 'id'> & { chave: string; prova?: ProvaPacote }
type ChecklistPacote = Omit<ModeloForm, 'unidades' | 'geradoPorIA' | 'iaModelo' | 'publico'> & {
  chave: string
  publico: true
  geradoPorIA?: boolean
  iaModelo?: string
}

export interface PacoteConteudo {
  formato: 'ubox-pacote-conteudo'
  versao: 1
  titulo: string
  geradoEm: string
  categorias: CategoriaPacote[]
  documentos: DocumentoPacote[]
  trilha: TrilhaPacote[]
  cursos: CursoPacote[]
  checklists: ChecklistPacote[]
}

type Regra = (valor: unknown, caminho: string, erros: string[]) => void
type Campo = { validar: Regra; opcional?: boolean }

function regra(teste: (valor: unknown) => boolean, mensagem: string): Regra {
  return (valor, caminho, erros) => { if (!teste(valor)) erros.push(`${caminho} — ${mensagem}`) }
}

const texto = (max: number, min = 0) => regra(
  (v) => typeof v === 'string' && v.length <= max && v.trim().length >= min,
  min ? `Informe de ${min} a ${max} caracteres.` : `Use texto de até ${max} caracteres.`,
)
const numero = (min: number, max: number) => regra(
  (v) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max,
  `Informe um inteiro entre ${min} e ${max}.`,
)
const opcoes = (...valores: unknown[]) => regra((v) => valores.includes(v), `Use um destes valores: ${valores.join(', ')}.`)
const booleano = opcoes(true, false)
const publico = opcoes(true)
const chave = regra((v) => typeof v === 'string' && chaveValida.test(v), 'Use uma chave de 2 a 80 caracteres com letras minúsculas, números e hífens.')
const link = regra((v) => typeof v === 'string' && linkHttpsValido(v), 'Informe um link HTTPS válido de até 600 caracteres.')
const opcional = (validar: Regra): Campo => ({ validar, opcional: true })

function objeto(campos: Record<string, Regra | Campo>): Regra {
  return (valor, caminho, erros) => {
    if (!valor || typeof valor !== 'object' || Object.getPrototypeOf(valor) !== Object.prototype) {
      erros.push(`${caminho} — Informe um objeto JSON.`)
      return
    }
    const dados = valor as Record<string, unknown>
    for (const nome of Object.keys(dados)) {
      if (!Object.hasOwn(campos, nome)) erros.push(`${caminho}.${nome} — Campo não permitido.`)
    }
    for (const [nome, campo] of Object.entries(campos)) {
      if (typeof campo !== 'function' && campo.opcional && !Object.hasOwn(dados, nome)) continue
      const validar = typeof campo === 'function' ? campo : campo.validar
      validar(Object.hasOwn(dados, nome) ? dados[nome] : undefined, `${caminho}.${nome}`, erros)
    }
  }
}

function lista(item: Regra, min = 0, max = Infinity): Regra {
  return (valor, caminho, erros) => {
    if (!Array.isArray(valor) || valor.length < min || valor.length > max) {
      erros.push(`${caminho} — Informe uma lista com ${max === Infinity ? 'zero ou mais itens' : `${min} a ${max} itens`}.`)
      return
    }
    for (let indice = 0; indice < valor.length; indice++) item(valor[indice], `${caminho}[${indice}]`, erros)
  }
}

const categoria = objeto({
  chave, nome: texto(120, 2), descricao: texto(600), ordem: regra(Number.isFinite, 'Informe um número finito.'),
  parent: opcional((v, c, e) => { if (v !== null) chave(v, c, e) }), publico,
})
const anexo = objeto({
  nome: regra((v) => typeof v === 'string' && !!v.trim(), 'Informe o nome do anexo.'),
  url: link, tipo: opcoes('link', 'drive', 'video'),
})
const documento = objeto({
  chave, titulo: texto(120, 2), categoria: chave, tipo: opcoes('manual', 'pop', 'html'), formato: opcoes('richtext', 'html'),
  status: opcoes('rascunho', 'publicado'), publico, leituraObrigatoria: opcional(booleano),
  conteudoHtml: opcional(texto(800000)), htmlConteudo: opcional(texto(800000)),
  htmlUrl: opcional((v, c, e) => { if (v !== '') link(v, c, e) }), anexos: opcional(lista(anexo, 0, 30)),
})
const trilha = objeto({
  chave, documento: chave, etapa: texto(80), tempoMinimoSeg: numero(TEMPO_MINIMO_PISO_SEG, TEMPO_MINIMO_TETO_SEG),
  videoMinutos: numero(0, 600), ativo: booleano,
})
const pergunta = objeto({
  id: texto(40, 1), enunciado: texto(600, 1), opcoes: lista(texto(300, 1), MIN_OPCOES, MAX_OPCOES),
  correta: numero(0, MAX_OPCOES - 1),
})
const prova = objeto({
  chave, titulo: texto(120, 2), notaMinima: numero(1, 100), manualRetorno: chave,
  tempoReestudoSeg: numero(REESTUDO_PISO_SEG, REESTUDO_TETO_SEG), publicado: booleano,
  perguntas: lista(pergunta, 1, MAX_PERGUNTAS),
})
const curso = objeto({
  chave, titulo: texto(120, 2), descricao: texto(1000, 1), ordem: numero(1, 999),
  aulas: lista(chave, 0, MAX_AULAS), publicado: booleano, prova: opcional(prova),
})
const itemModelo = objeto({
  id: texto(80, 1), texto: texto(300, 2), secao: texto(60),
  peso: numero(1, PESO_MAX), exigeEvidencia: booleano, exigeObs: booleano,
})
const checklist = objeto({
  chave, titulo: texto(120, 2), descricao: texto(1000), tipo: opcoes(...TIPOS_CHECKLIST), frequencia: opcoes(...FREQUENCIAS),
  publico, ativo: booleano, itens: lista(itemModelo, 1, MAX_ITENS),
  geradoPorIA: opcional(booleano), iaModelo: opcional(texto(80)),
})
const estrutura = objeto({
  formato: opcoes('ubox-pacote-conteudo'), versao: opcoes(1), titulo: texto(120, 1),
  geradoEm: regra((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)),
    'Informe data e hora ISO 8601 com fuso.'),
  categorias: lista(categoria), documentos: lista(documento), trilha: lista(trilha, 0, MAX_TRILHA),
  cursos: lista(curso), checklists: lista(checklist),
})

function ordenarCategorias(categorias: CategoriaPacote[]): CategoriaPacote[] {
  const ordem: CategoriaPacote[] = []
  const filhas = new Map<string, CategoriaPacote[]>()
  for (const categoria of categorias) {
    if (!categoria.parent) ordem.push(categoria)
    else {
      const grupo = filhas.get(categoria.parent) ?? []
      grupo.push(categoria)
      filhas.set(categoria.parent, grupo)
    }
  }
  for (let i = 0; i < ordem.length; i++) {
    for (const filha of filhas.get(ordem[i].chave) ?? []) ordem.push(filha)
  }
  return ordem
}

const identidadeCategoria = (nome: string, parent: string | null | undefined) => JSON.stringify([nome, parent || null])
const identidadeDocumento = (titulo: string, tipo: string) => JSON.stringify([titulo, tipo])
const identidadeReferencia = (id: string, titulo: string) => JSON.stringify([id, titulo])
const repetidos = <T>(itens: T[]) => new Set(itens).size !== itens.length

function formularioModelo(item: ChecklistPacote): ModeloForm {
  return {
    titulo: item.titulo, descricao: item.descricao, tipo: item.tipo, frequencia: item.frequencia,
    itens: item.itens, ativo: item.ativo, publico: true, unidades: [],
    geradoPorIA: item.geradoPorIA ?? false, iaModelo: item.iaModelo ?? '',
  }
}

export function validarPacote(json: unknown): { ok: true; pacote: PacoteConteudo } | { ok: false; erros: string[] } {
  const erros: string[] = []
  estrutura(json, 'pacote', erros)
  if (erros.length) return { ok: false, erros }
  if (bytes(JSON.stringify(json)) > MAX_BYTES_PACOTE) return { ok: false, erros: ['O pacote aceita até 5 MB.'] }
  const pacote = json as PacoteConteudo
  const { categorias, documentos, trilha, cursos, checklists } = pacote
  const chaves = new Set<string>()
  for (const item of [...categorias, ...documentos, ...trilha, ...cursos, ...checklists, ...cursos.flatMap((c) => c.prova ? [c.prova] : [])]) {
    if (chaves.has(item.chave)) erros.push(`Chave repetida: ${item.chave}.`)
    chaves.add(item.chave)
  }
  const categoriasValidas = new Set(categorias.map((c) => c.chave))
  const documentosValidos = new Set(documentos.map((d) => d.chave))
  for (const c of categorias) {
    if (c.parent && !categoriasValidas.has(c.parent)) erros.push(`${c.chave} — Categoria pai inexistente.`)
  }
  if (categoriasValidas.size === categorias.length &&
      categorias.every((c) => !c.parent || categoriasValidas.has(c.parent)) && ordenarCategorias(categorias).length !== categorias.length) {
    erros.push('A hierarquia de categorias contém um ciclo.')
  }
  if (repetidos(categorias.map((c) => identidadeCategoria(c.nome.trim(), c.parent)))) erros.push('Há categorias com o mesmo nome e pai.')
  if (repetidos(documentos.map((d) => identidadeDocumento(d.titulo.trim(), d.tipo)))) erros.push('Há documentos com o mesmo título e tipo.')
  if (repetidos(cursos.map((c) => c.titulo.trim()))) erros.push('Há cursos com o mesmo título.')
  if (repetidos(checklists.map((c) => c.titulo.trim()))) erros.push('Há checklists com o mesmo título.')
  if (repetidos(trilha.map((t) => t.documento))) erros.push('Há documentos repetidos na trilha.')

  for (const d of documentos) {
    if (!categoriasValidas.has(d.categoria)) erros.push(`${d.chave} — Categoria inexistente.`)
    if (d.tipo === 'html') {
      if (d.formato !== 'html' || d.conteudoHtml || (!d.htmlConteudo?.trim() && !d.htmlUrl)) {
        erros.push(`${d.chave} — Use formato html e informe htmlConteudo ou htmlUrl.`)
      }
    } else if (d.formato !== 'richtext' || d.htmlConteudo || d.htmlUrl) {
      erros.push(`${d.chave} — Use formato richtext e o campo conteudoHtml.`)
    }
    const html = d.htmlConteudo || d.conteudoHtml || ''
    const tamanhoHtml = bytes(html)
    if (d.tipo === 'html' && tamanhoHtml > MAX_BYTES_INTERATIVO) {
      erros.push(`${d.chave} — O HTML interativo aceita até 300 KB.`)
    } else if (tamanhoHtml + bytes(htmlParaTexto(html)) + bytes(JSON.stringify(d.anexos ?? [])) + bytes(d.htmlUrl ?? '') > MAX_BYTES_DADOS_DOCUMENTO) {
      erros.push(`${d.chave} — Reduza o tamanho do documento, incluindo HTML, texto pesquisável e anexos.`)
    }
  }
  for (const t of trilha) {
    if (!documentosValidos.has(t.documento)) erros.push(`${t.chave} — Documento da trilha inexistente.`)
  }
  for (const c of cursos) {
    if (repetidos(c.aulas)) erros.push(`${c.chave} — Há aulas repetidas.`)
    for (const aula of c.aulas) {
      if (!documentosValidos.has(aula)) erros.push(`${c.chave} — Aula inexistente: ${aula}.`)
    }
    if (c.prova) {
      const p = c.prova
      if (!documentosValidos.has(p.manualRetorno)) erros.push(`${p.chave} — Manual de retorno inexistente.`)
      if (repetidos(p.perguntas.map((q) => q.id))) erros.push(`${p.chave} — Há identificadores de perguntas repetidos.`)
      erros.push(...validarProva({ ...p, manualRetornoId: p.manualRetorno }).map((e) => `${p.chave} — ${e}`))
    }
  }
  for (const c of checklists) erros.push(...validarModelo(formularioModelo(c)).map((e) => `${c.chave} — ${e}`))
  return erros.length ? { ok: false, erros } : { ok: true, pacote }
}

type AudienciaExistente = Partial<Audiencia>

export interface ExistentesImportacao {
  categorias: (Pick<Categoria, 'id' | 'nome' | 'parentId'> & AudienciaExistente)[]
  documentos: (Pick<Documento, 'id' | 'titulo' | 'tipo'> & AudienciaExistente)[]
  trilha: (ItemTrilhaManual & AudienciaExistente)[]
  cursos: (Pick<Curso, 'id' | 'titulo'> & AudienciaExistente)[]
  provas: (Pick<Prova, 'cursoId' | 'versao' | 'titulo'> & AudienciaExistente)[]
  checklists: ModeloChecklist[]
  chaves: VinculoPacote[]
}

export type AcaoImportacao = 'criar' | 'ja-existe' | 'atualizar' | 'restrito' | 'conflito'
type Passo<T, E> = {
  item: T
  tipo: VinculoPacote['tipo']
  acao: AcaoImportacao
  existente?: E
  alvoId?: string
  correspondencia?: 'chave' | 'título'
  restrito: boolean
}

interface OpcoesImportacao {
  atualizarExistentes?: boolean
  atualizarRestritos?: boolean
  comoRascunho?: boolean
}

export function planejarImportacao(pacote: PacoteConteudo, existentes: ExistentesImportacao, opcoes: OpcoesImportacao = {}) {
  const vinculos = new Map(existentes.chaves.map((v) => [idChavePacote(v.tipo, v.chave), v]))

  function prepararCorrespondencia<E extends AudienciaExistente>(
    tipo: VinculoPacote['tipo'], itens: E[], obterId: (item: E) => string, identidade: (item: E) => string,
  ) {
    const porId = new Map(itens.map((item) => [obterId(item), item]))
    const reservados = new Set(existentes.chaves.filter((v) => v.tipo === tipo).map((v) => v.alvoId))
    const porIdentidade = new Map<string, E>()
    for (const item of itens) {
      if (reservados.has(obterId(item))) continue
      const chave = identidade(item)
      const anterior = porIdentidade.get(chave)
      if (!anterior || obterId(item) < obterId(anterior)) porIdentidade.set(chave, item)
    }

    return <T extends { chave: string }>(item: T, chaveLegada?: string): Passo<T, E> => {
      const vinculo = vinculos.get(idChavePacote(tipo, item.chave))
      const existente = vinculo ? porId.get(vinculo.alvoId) : chaveLegada !== undefined ? porIdentidade.get(chaveLegada) : undefined
      const alvoId = existente && obterId(existente)
      if (existente) porIdentidade.delete(identidade(existente))
      // Cursos, provas e trilha não têm audiência própria; só categorias, documentos e checklists podem ser restritos.
      const temAudiencia = tipo === 'categoria' || tipo === 'documento' || tipo === 'checklist'
      const restrito = existente !== undefined && temAudiencia && existente.publico !== true
      const acao = !existente ? 'criar' : !opcoes.atualizarExistentes ? 'ja-existe'
        : restrito && !opcoes.atualizarRestritos ? 'restrito' : 'atualizar'
      return { item, tipo, acao, existente, alvoId, restrito, correspondencia: existente ? (vinculo ? 'chave' : 'título') : undefined }
    }
  }

  const categoria = prepararCorrespondencia('categoria', existentes.categorias, (c) => c.id, (c) => identidadeCategoria(c.nome, c.parentId))
  const documento = prepararCorrespondencia('documento', existentes.documentos, (d) => d.id, (d) => identidadeDocumento(d.titulo, d.tipo))
  const curso = prepararCorrespondencia('curso', existentes.cursos, (c) => c.id, (c) => c.titulo)
  const checklist = prepararCorrespondencia('checklist', existentes.checklists, (c) => c.id, (c) => c.titulo)
  const itemTrilha = prepararCorrespondencia('trilha', existentes.trilha, (t) => t.documentoId, (t) => identidadeReferencia(t.documentoId, t.titulo))
  const prova = prepararCorrespondencia('prova', existentes.provas, (p) => p.cursoId, (p) => identidadeReferencia(p.cursoId, p.titulo))
  const idsCategorias = new Map<string, string>()
  const categorias = ordenarCategorias(pacote.categorias).map((c) => {
    const pai = c.parent ? idsCategorias.get(c.parent) : null
    const passo = categoria(c, pai === undefined ? undefined : identidadeCategoria(c.nome.trim(), pai))
    if (passo.alvoId) idsCategorias.set(c.chave, passo.alvoId)
    return passo
  })
  const documentos = pacote.documentos.map((d) => documento(d, identidadeDocumento(d.titulo.trim(), d.tipo)))
  const documentosPorChave = new Map(documentos.map((d) => [d.item.chave, d]))
  const idsTrilha = new Set(existentes.trilha.map((t) => t.documentoId))
  const chavesTrilha = new Map(existentes.chaves.filter((v) => v.tipo === 'trilha').map((v) => [v.alvoId, v.chave]))
  const trilha = pacote.trilha.map((t) => {
    const doc = documentosPorChave.get(t.documento)
    const id = doc?.alvoId
    const passo = itemTrilha(t, id && doc?.existente ? identidadeReferencia(id, doc.existente.titulo) : undefined)
    // A trilha é gravada no ID do documento. Uma divergência não pode sobrescrever outro vínculo.
    const chaveReservada = id ? chavesTrilha.get(id) : undefined
    if (passo.alvoId ? passo.alvoId !== id
      : id && (idsTrilha.has(id) || (chaveReservada && chaveReservada !== t.chave))) passo.acao = 'conflito'
    return passo
  })

  const idsCursos = new Set([
    ...existentes.cursos.map((c) => c.id), ...existentes.provas.map((p) => p.cursoId),
    ...existentes.chaves.filter((v) => v.tipo === 'curso' || v.tipo === 'prova').map((v) => v.alvoId),
  ])
  const cursos = pacote.cursos.map((c) => {
    const passo = curso(c, c.titulo.trim())
    if (passo.alvoId) return { ...passo, id: passo.alvoId }
    const base = slugCurso(c.titulo) || c.chave.slice(0, 48)
    let id = base
    for (let sufixo = 2; idsCursos.has(id); sufixo++) id = `${base}-${sufixo}`
    idsCursos.add(id)
    return { ...passo, id }
  })
  const idsProvas = new Set(existentes.provas.map((p) => p.cursoId))
  const chavesProvas = new Map(existentes.chaves.filter((v) => v.tipo === 'prova').map((v) => [v.alvoId, v.chave]))
  const provas = cursos.flatMap(({ item, id }) => {
    if (!item.prova) return []
    const passo = prova(item.prova, identidadeReferencia(id, item.prova.titulo.trim()))
    const chaveReservada = chavesProvas.get(id)
    if (passo.alvoId ? passo.alvoId !== id
      : idsProvas.has(id) || (chaveReservada && chaveReservada !== item.prova.chave)) passo.acao = 'conflito'
    return [{ ...passo, curso: item.chave }]
  })
  const checklists = pacote.checklists.map((c) => checklist(c, c.titulo.trim()))
  return {
    categorias, documentos, trilha, cursos, provas, checklists,
    trilhaExistente: ordenarTrilha(existentes.trilha),
    comoRascunho: opcoes.comoRascunho ?? false,
  }
}

export type PlanoImportacao = ReturnType<typeof planejarImportacao>

export interface DependenciasImportacao {
  salvarCategoria: (form: RascunhoCategoria, id: string | undefined, usuarios: Usuario[] | null) => Promise<string>
  salvarDocumento: (form: RascunhoDocumento, id: string | undefined, usuarios: Usuario[] | null) => Promise<string>
  salvarChave: (vinculo: VinculoPacote) => Promise<void>
  salvarTrilha: (itens: ItemTrilhaEdicao[], anteriores: ItemTrilhaManual[]) => Promise<void>
  salvarCurso: (form: CursoEdicao) => Promise<void>
  salvarProva: (form: ProvaEdicao, versao: number) => Promise<unknown>
  salvarModelo: (existente: ModeloChecklist | null, form: ModeloForm) => Promise<string>
}

export interface RelatorioImportacao {
  criados: number
  ignorados: number
  atualizados: number
  erros: { chave: string; mensagem: string }[]
}

function inserirNaSequencia(sequencia: ItemTrilhaEdicao[], item: ItemTrilhaEdicao, ordemPacote: Map<string, number>): ItemTrilhaEdicao[] {
  const copia = [...sequencia]
  const atual = copia.findIndex((i) => i.documentoId === item.documentoId)
  if (atual >= 0) {
    copia[atual] = item
  } else {
    // Se um item posterior já tiver sido gravado, use sua posição para retomar a ordem do pacote.
    const ordem = ordemPacote.get(item.documentoId) ?? Infinity
    const posterior = copia.findIndex((i) => (ordemPacote.get(i.documentoId) ?? -1) > ordem)
    copia.splice(posterior >= 0 ? posterior : copia.length, 0, item)
  }
  return copia
}

function idResolvido(ids: Map<string, string>, chave: string): string {
  const id = ids.get(chave)
  if (!id) throw new Error(`A dependência ${chave} não foi gravada nem localizada.`)
  return id
}

function audienciaParaGravar(existente?: AudienciaExistente): Audiencia {
  return {
    publico: existente ? existente.publico === true : true,
    unidades: existente?.unidades ?? [],
    papeis: existente?.papeis ?? [],
    uidsExtra: existente?.uidsExtra ?? [],
    uids: existente?.uids ?? [],
  }
}

const gravaItem = (acao: AcaoImportacao) => acao === 'criar' || acao === 'atualizar'

export async function importarPacote(
  plano: PlanoImportacao,
  deps: DependenciasImportacao,
  onProgresso?: (concluidos: number, chave: string) => void,
): Promise<RelatorioImportacao> {
  const relatorio: RelatorioImportacao = { criados: 0, ignorados: 0, atualizados: 0, erros: [] }
  const categorias = new Map<string, string>()
  const documentos = new Map<string, string>()
  const titulos = new Map(plano.documentos.map(({ item, acao, existente }) =>
    [item.chave, gravaItem(acao) ? item.titulo.trim() : existente?.titulo ?? item.titulo.trim()],
  ))
  const cursos = new Map<string, string>()
  let concluidos = 0

  async function executar(passo: Passo<{ chave: string }, unknown>, gravar: () => Promise<string | undefined>) {
    const { acao, item: { chave } } = passo
    try {
      if (acao === 'conflito') throw new Error('O vínculo não coincide com a referência do pacote ou o destino já está ocupado.')
      const alvoId = await gravar()
      if (gravaItem(acao)) {
        if (!alvoId) throw new Error('O item foi gravado sem um ID de destino.')
        await deps.salvarChave({ tipo: passo.tipo, chave, alvoId })
      }
      if (acao === 'criar') relatorio.criados++
      else if (acao === 'atualizar') relatorio.atualizados++
      else relatorio.ignorados++
    } catch (falha) {
      relatorio.erros.push({ chave, mensagem: falha instanceof Error ? falha.message : 'Não foi possível gravar o item.' })
    }
    onProgresso?.(++concluidos, chave)
  }

  for (const passo of plano.categorias) {
    const { item, acao, existente } = passo
    await executar(passo, async () => {
      const id = !gravaItem(acao) ? existente!.id : await deps.salvarCategoria({
        nome: item.nome.trim(), descricao: item.descricao, ordem: item.ordem,
        parentId: item.parent ? idResolvido(categorias, item.parent) : null, ...audienciaParaGravar(existente),
      }, existente?.id, existente ? null : [])
      categorias.set(item.chave, id)
      return id
    })
  }
  for (const passo of plano.documentos) {
    const { item, acao, existente } = passo
    await executar(passo, async () => {
      const id = !gravaItem(acao) ? existente!.id : await deps.salvarDocumento({
        titulo: item.titulo.trim(), tipo: item.tipo, formato: item.formato,
        categoriaId: idResolvido(categorias, item.categoria),
        status: plano.comoRascunho ? 'rascunho' : item.status,
        leituraObrigatoria: item.leituraObrigatoria ?? false, conteudoHtml: item.conteudoHtml ?? '',
        htmlConteudo: item.htmlConteudo ?? '', htmlUrl: item.htmlUrl ?? '', anexos: item.anexos ?? [], ...audienciaParaGravar(existente),
      }, existente?.id, existente ? null : [])
      documentos.set(item.chave, id)
      return id
    })
  }

  // A API recalcula os predecessores com a sequência inteira. Mantemos a posição dos itens existentes.
  let sequencia = plano.trilhaExistente
  const ordemPacote = new Map<string, number>()
  plano.trilha.forEach(({ item }, indice) => {
    const id = documentos.get(item.documento)
    if (id) ordemPacote.set(id, indice)
  })
  const trilhaPorDocumento = new Map(sequencia.map((item) => [item.documentoId, item]))
  const alteracoes = new Map<string, ItemTrilhaEdicao>()
  for (const { item, acao } of plano.trilha) {
    const documentoId = documentos.get(item.documento)
    if (!gravaItem(acao) || !documentoId) continue
    alteracoes.set(item.chave, {
      documentoId, titulo: titulos.get(item.documento)!, etapa: item.etapa.trim(), tempoMinimoSeg: item.tempoMinimoSeg,
      videoMinutos: item.videoMinutos, ativo: item.ativo,
      consultaLivre: trilhaPorDocumento.get(documentoId)?.consultaLivre ?? false,
    })
  }

  let trilhaGravada = false
  if (alteracoes.size > 1) {
    const candidata = [...alteracoes.values()].reduce<ItemTrilhaEdicao[]>((atual, item) => inserirNaSequencia(atual, item, ordemPacote), sequencia)
    try {
      await deps.salvarTrilha(candidata, sequencia)
      trilhaGravada = true
    } catch {
      // O lote é atômico. A tentativa por item permite recuperar as gravações independentes.
    }
  }
  for (const passo of plano.trilha) {
    await executar(passo, async () => {
      if (!gravaItem(passo.acao)) return
      const item = alteracoes.get(passo.item.chave)
      if (!item) throw new Error(`O documento ${passo.item.documento} não foi gravado nem localizado.`)
      if (!trilhaGravada) {
        const candidata = inserirNaSequencia(sequencia, item, ordemPacote)
        await deps.salvarTrilha(candidata, sequencia)
        sequencia = encadearTrilha(candidata)
      }
      return item.documentoId
    })
  }

  for (const passo of plano.cursos) {
    const { item, id } = passo
    await executar(passo, async () => {
      if (gravaItem(passo.acao)) {
        await deps.salvarCurso({
          id, titulo: item.titulo.trim(), descricao: item.descricao, ordem: item.ordem, publicado: item.publicado,
          aulas: item.aulas.map((chave) => idResolvido(documentos, chave)),
        })
      }
      cursos.set(item.chave, id)
      return id
    })
  }
  for (const passo of plano.provas) {
    const { item, acao, existente } = passo
    await executar(passo, async () => {
      if (!gravaItem(acao)) return
      const cursoId = idResolvido(cursos, passo.curso)
      await deps.salvarProva({
        cursoId, manualRetornoId: idResolvido(documentos, item.manualRetorno),
        titulo: item.titulo.trim(), notaMinima: item.notaMinima, tempoReestudoSeg: item.tempoReestudoSeg,
        publicado: item.publicado, perguntas: item.perguntas,
      }, existente?.versao ?? 0)
      return cursoId
    })
  }
  for (const passo of plano.checklists) {
    await executar(passo, async () => {
      if (!gravaItem(passo.acao)) return
      const existente = passo.existente ?? null
      const form = formularioModelo(passo.item)
      if (existente) {
        form.publico = existente.publico
        form.unidades = existente.unidades
      }
      return deps.salvarModelo(existente, form)
    })
  }
  return relatorio
}
