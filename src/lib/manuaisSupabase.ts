// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import type {
  Aceite, Anexo, Audiencia, Aviso, AvisoLeitura, Categoria, Certificado, Documento,
  FormatoDocumento, Leitura, Papel, Quiz, StatusDocumento, Tentativa, TipoAviso,
  TipoDocumento, Trilha, Usuario, VersaoDocumento,
} from '../types'
import { calcularUids } from './access'
import type { RascunhoCategoria, RascunhoDocumento, RascunhoQuiz, RascunhoTrilha } from './api'
import { listarUsuariosSb } from './gestaoSupabase'
import { idAvisoLeitura, idCertificado, idLeitura } from './ids'
import type { ItemTrilhaEdicao } from './manuaisApi'
import { encadearTrilha, idProgresso, limitarTempo, type ItemTrilhaManual, type ProgressoManual } from './manuaisTrilha'
import { deveCarregar } from './portalCarga'
import { aplicarGabarito, extrairItensTrilha, extrairPerguntas, publicadoNoDado } from './quizSchema'
import { requireSupabase } from './supabase'
import { htmlParaTexto, limitar, textoParaIndice } from './text'

type Linha = Record<string, unknown>
type LinhaComId = Linha & { id: string }

function dataSb(valor: unknown): Date | null {
  if (typeof valor !== 'string') return null
  const ms = Date.parse(valor)
  return Number.isFinite(ms) ? new Date(ms) : null
}

function texto(valor: unknown, fallback = ''): string {
  return typeof valor === 'string' ? valor : fallback
}

function listaTexto(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : []
}

function papeis(valor: unknown): Papel[] {
  return listaTexto(valor).filter((item): item is Papel => item === 'admin' || item === 'franqueado')
}

function audiencia(data: Linha, publicoPadrao: boolean): Audiencia {
  const publico = typeof data.publico === 'boolean' ? data.publico : publicoPadrao
  return {
    publico,
    unidades: listaTexto(data.unidades),
    papeis: papeis(data.papeis),
    uidsExtra: listaTexto(data.uids_extra),
    uids: listaTexto(data.uids),
  }
}

function mapAnexos(valor: unknown): Anexo[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const registro = item as Record<string, unknown>
    const url = texto(registro.url)
    const nome = texto(registro.nome, 'Anexo')
    if (!url) return []
    const tipo = registro.tipo === 'drive' || registro.tipo === 'video' || registro.tipo === 'link' ? registro.tipo : 'link'
    return [{ nome, url, tipo }]
  })
}

function inteiro(valor: unknown, padrao = 0): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? Math.round(valor) : padrao
}

export function mapCategoriaSb(data: LinhaComId): Categoria {
  const { id } = data
  const nome = texto(data.nome) || texto(data.titulo) || texto(data.title) || id
  return {
    id,
    nome,
    descricao: texto(data.descricao),
    ordem: typeof data.ordem === 'number' ? data.ordem : 0,
    parentId: typeof data.parent_id === 'string' && data.parent_id ? data.parent_id : null,
    ...audiencia(data, true),
    criadoEm: dataSb(data.criado_em),
    atualizadoEm: dataSb(data.atualizado_em),
  }
}

export function mapDocumentoSb(data: LinhaComId): Documento {
  const { id } = data
  const tipo = ['pop', 'manual', 'processo', 'politica', 'checklist', 'html'].includes(texto(data.tipo))
    ? (data.tipo as TipoDocumento)
    : 'manual'
  const htmlConteudo = texto(data.html_conteudo)
  const conteudoHtml = texto(data.conteudo_html) || texto(data.conteudo) || texto(data.html)
  const interativo =
    data.formato === 'html' ||
    id.endsWith('-interativo') ||
    /interativ/i.test(texto(data.tipo)) ||
    (htmlConteudo.includes('<') && htmlConteudo.length > 80 && !conteudoHtml)
  const formato: FormatoDocumento = interativo ? 'html' : 'richtext'
  const status: StatusDocumento = data.status === 'rascunho' ? 'rascunho' : 'publicado'
  const textoSalvo = texto(data.conteudo_texto)
  const conteudoTexto =
    textoSalvo && !textoSalvo.includes('data:image') && !textoSalvo.includes('base64') && textoSalvo.length < 20000
      ? textoSalvo
      : textoParaIndice(conteudoHtml || htmlConteudo || textoSalvo)
  return {
    id,
    titulo: texto(data.titulo) || texto(data.nome, 'Sem título'),
    categoriaId: texto(data.categoria_id) || texto(data.categoria),
    tipo,
    formato,
    status,
    versao: typeof data.versao === 'number' ? data.versao : 1,
    leituraObrigatoria: data.leitura_obrigatoria === true,
    conteudoHtml,
    conteudoTexto,
    htmlConteudo,
    htmlUrl: texto(data.html_url),
    anexos: mapAnexos(data.anexos),
    ...audiencia(data, false),
    criadoEm: dataSb(data.criado_em),
    atualizadoEm: dataSb(data.atualizado_em),
    atualizadoPor: texto(data.atualizado_por),
    atualizadoPorNome: texto(data.atualizado_por_nome),
    publicadoEm: dataSb(data.publicado_em),
  }
}

export function mapTrilhaSb(data: LinhaComId): Trilha {
  const { id } = data
  const nota = data.nota_minima
  return {
    id,
    titulo: texto(data.titulo) || texto(data.nome, 'Trilha'),
    descricao: texto(data.descricao),
    notaMinima: typeof nota === 'number' ? nota : 70,
    publicado: publicadoNoDado(data),
    itens: extrairItensTrilha(data),
    ...audiencia(data, true),
    criadoEm: dataSb(data.criado_em),
    atualizadoEm: dataSb(data.atualizado_em),
  }
}

export function mapQuizSb(data: LinhaComId): Quiz {
  const { id } = data
  const nota = data.nota_minima
  const perguntas = extrairPerguntas(data)
  return {
    id,
    trilhaId: texto(data.trilha_id) || texto(data.trilha),
    titulo: texto(data.titulo) || texto(data.nome, 'Quiz'),
    notaMinima: typeof nota === 'number' ? nota : 70,
    perguntas,
    publicado: publicadoNoDado(data),
    ...audiencia(data, true),
    criadoEm: dataSb(data.criado_em),
    atualizadoEm: dataSb(data.atualizado_em),
  }
}

export function mapLeituraSb(data: LinhaComId): Leitura {
  const { id } = data
  return {
    id,
    uid: texto(data.uid),
    documentoId: texto(data.documento_id),
    versao: typeof data.versao === 'number' ? data.versao : 1,
    titulo: texto(data.titulo),
    lidoEm: dataSb(data.lido_em),
  }
}

export function mapAceiteSb(data: LinhaComId): Aceite {
  const { id } = data
  return {
    id,
    uid: texto(data.uid),
    documentoId: texto(data.documento_id),
    versao: typeof data.versao === 'number' ? data.versao : 1,
    nome: texto(data.nome),
    email: texto(data.email),
    texto: texto(data.texto),
    titulo: texto(data.titulo),
    aceitoEm: dataSb(data.aceito_em),
  }
}

export function mapTentativaSb(data: LinhaComId): Tentativa {
  const { id } = data
  return {
    id,
    uid: texto(data.uid),
    quizId: texto(data.quiz_id),
    trilhaId: texto(data.trilha_id),
    nota: typeof data.nota === 'number' ? data.nota : 0,
    aprovado: data.aprovado === true,
    respostas: Array.isArray(data.respostas) ? data.respostas.filter((item): item is number => typeof item === 'number') : [],
    respondidoEm: dataSb(data.respondido_em),
  }
}

export function mapCertificadoSb(data: LinhaComId): Certificado {
  const { id } = data
  return {
    id,
    uid: texto(data.uid),
    trilhaId: texto(data.trilha_id),
    nome: texto(data.nome),
    trilhaTitulo: texto(data.trilha_titulo),
    emitidoEm: dataSb(data.emitido_em),
    codigo: texto(data.codigo),
    tentativaId: texto(data.tentativa_id),
  }
}

export function mapAvisoSb(data: LinhaComId): Aviso {
  const { id } = data
  const tipo: TipoAviso = data.tipo === 'atualizado' || data.tipo === 'geral' ? data.tipo : 'novo'
  return {
    id,
    titulo: texto(data.titulo),
    mensagem: texto(data.mensagem),
    documentoId: texto(data.documento_id),
    tipo,
    ...audiencia(data, true),
    criadoEm: dataSb(data.criado_em),
  }
}

export function mapItemTrilhaSb(data: LinhaComId): ItemTrilhaManual {
  const { id } = data
  return {
    documentoId: id,
    titulo: texto(data.titulo, 'Manual'),
    etapa: texto(data.etapa),
    ordem: inteiro(data.ordem, 999),
    tempoMinimoSeg: inteiro(data.tempo_minimo_seg, 60),
    videoMinutos: inteiro(data.video_minutos),
    anteriorId: texto(data.anterior_id),
    ativo: data.ativo === true,
    atualizadoPor: texto(data.atualizado_por),
    atualizadoPorNome: texto(data.atualizado_por_nome),
    atualizadoEm: dataSb(data.atualizado_em),
  }
}

export function mapProgressoSb(data: LinhaComId): ProgressoManual {
  const { id } = data
  return {
    id,
    uid: texto(data.uid),
    documentoId: texto(data.documento_id),
    nome: texto(data.nome, 'Pessoa'),
    unidadeId: texto(data.unidade_id),
    unidadeNome: texto(data.unidade_nome),
    status: data.status === 'concluido' ? 'concluido' : 'em_andamento',
    iniciadoEm: dataSb(data.iniciado_em),
    reinicios: inteiro(data.reinicios),
    tempoMinimoSeg: inteiro(data.tempo_minimo_seg, 60),
    concluidoEm: dataSb(data.concluido_em),
    atualizadoEm: dataSb(data.atualizado_em),
  }
}

export function mapAvisoLeituraSb(data: LinhaComId): AvisoLeitura {
  return { id: data.id, uid: texto(data.uid), avisoId: texto(data.aviso_id), lidaEm: dataSb(data.lida_em) }
}

export function mapVersaoSb(data: LinhaComId): VersaoDocumento {
  const id = texto(data.versao_id) || data.id.split('/').pop() || data.id
  return {
    id,
    versao: inteiro(data.versao, Number(id) || 1),
    titulo: texto(data.titulo),
    formato: data.formato === 'html' ? 'html' : 'richtext',
    conteudoHtml: texto(data.conteudo_html),
    conteudoTexto: texto(data.conteudo_texto),
    htmlConteudo: texto(data.html_conteudo),
    htmlUrl: texto(data.html_url),
    criadoEm: dataSb(data.criado_em),
    autorId: texto(data.autor_id),
    autorNome: texto(data.autor_nome),
  }
}

export function mapGabaritoSb(data: Linha): Linha {
  const dados = data.dados && typeof data.dados === 'object' && !Array.isArray(data.dados)
    ? data.dados as Linha
    : {}
  return Array.isArray(data.respostas) ? { ...dados, respostas: data.respostas } : { ...dados }
}

type AudienciaRascunho = Omit<Audiencia, 'uids'>

function audienciaParaLinha(dados: AudienciaRascunho, usuarios: Usuario[] | null, audienciaAnterior?: Audiencia) {
  const alvo = !usuarios && audienciaAnterior ? audienciaAnterior : dados
  return {
    publico: alvo.publico,
    unidades: alvo.unidades,
    papeis: alvo.papeis,
    uids_extra: alvo.uidsExtra,
    uids: usuarios ? calcularUids(alvo, usuarios) : audienciaAnterior?.uids ?? [],
  }
}

export function categoriaParaLinha(id: string, dados: RascunhoCategoria, usuarios: Usuario[] | null, audienciaAnterior?: Audiencia) {
  return {
    id,
    nome: dados.nome.trim(),
    descricao: dados.descricao.trim(),
    ordem: dados.ordem,
    parent_id: dados.parentId,
    ...audienciaParaLinha(dados, usuarios, audienciaAnterior),
  }
}

export function documentoParaLinha(id: string, dados: RascunhoDocumento, autor: Usuario, usuarios: Usuario[] | null, versao: number, audienciaAnterior?: Audiencia) {
  const corpo = dados.formato === 'html' ? dados.htmlConteudo || dados.conteudoHtml : dados.conteudoHtml
  return {
    id,
    titulo: dados.titulo.trim(),
    categoria_id: dados.categoriaId,
    tipo: dados.tipo,
    formato: dados.formato,
    status: dados.status,
    versao,
    leitura_obrigatoria: dados.leituraObrigatoria,
    conteudo_html: limitar(dados.conteudoHtml, 800000),
    conteudo_texto: limitar(htmlParaTexto(corpo), 800000),
    html_conteudo: limitar(dados.htmlConteudo, 800000),
    html_url: dados.htmlUrl.trim(),
    anexos: dados.anexos,
    ...audienciaParaLinha(dados, usuarios, audienciaAnterior),
    atualizado_por: autor.uid,
    atualizado_por_nome: autor.nome.slice(0, 120),
  }
}

export function versaoParaLinha(dados: ReturnType<typeof documentoParaLinha>, autor: Usuario) {
  return {
    documento_id: dados.id,
    versao_id: String(dados.versao),
    versao: dados.versao,
    titulo: dados.titulo,
    formato: dados.formato,
    conteudo_html: dados.conteudo_html,
    conteudo_texto: dados.conteudo_texto,
    html_conteudo: dados.html_conteudo,
    html_url: dados.html_url,
    autor_id: autor.uid,
    autor_nome: autor.nome.slice(0, 120),
  }
}

export function avisoParaLinha(id: string, dados: ReturnType<typeof documentoParaLinha>, atualizado: boolean) {
  const { publico, unidades, papeis, uids_extra, uids } = dados
  return {
    id,
    titulo: limitar(atualizado ? `Atualizado: ${dados.titulo}` : `Novo: ${dados.titulo}`, 120),
    mensagem: atualizado ? 'Uma nova versão foi publicada na biblioteca.' : 'Um documento novo foi publicado na biblioteca.',
    documento_id: dados.id,
    tipo: atualizado ? 'atualizado' : 'novo',
    publico, unidades, papeis, uids_extra, uids,
  }
}

export function trilhaParaLinha(id: string, dados: RascunhoTrilha, usuarios: Usuario[]) {
  return {
    id,
    titulo: dados.titulo.trim(),
    descricao: dados.descricao.trim(),
    nota_minima: dados.notaMinima,
    publicado: dados.publicado,
    itens: dados.itens,
    ...audienciaParaLinha(dados, usuarios),
  }
}

export function quizParaLinha(dados: RascunhoQuiz, trilha: ReturnType<typeof trilhaParaLinha>) {
  const { nota_minima, publicado, publico, unidades, papeis, uids_extra, uids } = trilha
  return {
    id: dados.id,
    trilha_id: trilha.id,
    titulo: dados.titulo.trim(),
    perguntas: dados.perguntas,
    nota_minima, publicado, publico, unidades, papeis, uids_extra, uids,
  }
}

type DocumentoLido = Pick<Documento, 'id' | 'versao' | 'titulo'>

export function leituraParaLinha(usuario: Usuario, documento: DocumentoLido) {
  return {
    id: idLeitura(usuario.uid, documento.id, documento.versao),
    uid: usuario.uid,
    documento_id: documento.id,
    versao: documento.versao,
    titulo: documento.titulo,
  }
}

export function aceiteParaLinha(usuario: Usuario, documento: DocumentoLido) {
  return { ...leituraParaLinha(usuario, documento), nome: usuario.nome, email: usuario.email, texto: 'Li e concordo' }
}

export function certificadoParaLinha(dados: Omit<Certificado, 'id' | 'emitidoEm'>) {
  return {
    id: idCertificado(dados.uid, dados.trilhaId),
    uid: dados.uid,
    trilha_id: dados.trilhaId,
    nome: dados.nome,
    trilha_titulo: dados.trilhaTitulo,
    codigo: dados.codigo,
    tentativa_id: dados.tentativaId,
  }
}

export function avisoLeituraParaLinha(uid: string, avisoId: string) {
  return { id: idAvisoLeitura(uid, avisoId), uid, aviso_id: avisoId }
}

export function itemTrilhaParaLinha(item: ItemTrilhaEdicao & { ordem: number; anteriorId: string }, autor: Usuario) {
  return {
    id: item.documentoId,
    documento_id: item.documentoId,
    titulo: item.titulo.trim().slice(0, 200) || 'Manual',
    etapa: item.etapa.trim().slice(0, 80),
    ordem: item.ordem,
    tempo_minimo_seg: limitarTempo(item.tempoMinimoSeg),
    video_minutos: Math.min(600, Math.max(0, Math.round(item.videoMinutos || 0))),
    anterior_id: item.anteriorId,
    ativo: item.ativo,
    atualizado_por: autor.uid,
    atualizado_por_nome: autor.nome,
  }
}

export function progressoParaLinha(usuario: Usuario, item: ItemTrilhaManual) {
  return {
    id: idProgresso(usuario.uid, item.documentoId),
    uid: usuario.uid,
    documento_id: item.documentoId,
    nome: usuario.nome,
    unidade_id: usuario.unidadeId ?? '',
    unidade_nome: usuario.unidade ?? '',
    status: 'em_andamento',
    reinicios: 0,
    tempo_minimo_seg: item.tempoMinimoSeg,
  }
}

export function novoId(): string {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  while (id.length < 20) {
    for (const byte of crypto.getRandomValues(new Uint8Array(20))) {
      if (byte < 248) id += alfabeto[byte % alfabeto.length]
    }
  }
  return id.slice(0, 20)
}

function falhou(erro: { message: string } | null): void {
  if (erro) throw new Error(erro.message)
}

async function listar<T>(
  tabela: string,
  mapear: (linha: LinhaComId) => T,
  filtro?: readonly [coluna: string, valor: string],
): Promise<T[]> {
  const registros: T[] = []
  const tamanho = 100
  for (let inicio = 0; ; inicio += tamanho) {
    const consulta = requireSupabase().from(tabela).select('*')
    if (filtro) consulta.eq(...filtro)
    const { data, error } = await consulta.order('id').range(inicio, inicio + tamanho - 1)
    falhou(error)
    const pagina = (data ?? []) as LinhaComId[]
    registros.push(...pagina.map(mapear))
    if (pagina.length < tamanho) return registros
  }
}

async function obterLinha(tabela: string, id: string): Promise<LinhaComId | null> {
  const { data, error } = await requireSupabase().from(tabela).select('*').eq('id', id).maybeSingle()
  falhou(error)
  return data as LinhaComId | null
}

async function gravar(tabela: string, dados: LinhaComId | LinhaComId[]): Promise<void> {
  const { error } = await requireSupabase().from(tabela).upsert(dados)
  falhou(error)
}

async function apagar(tabela: string, coluna: string, valor: string): Promise<void> {
  const { error } = await requireSupabase().from(tabela).delete().eq(coluna, valor)
  falhou(error)
}

async function inserirUmaVez(tabela: string, dados: Linha): Promise<boolean> {
  const { error } = await requireSupabase().from(tabela).insert(dados)
  if (error?.code === '23505') return false
  falhou(error)
  return true
}

async function registrarUmaVez(tabela: string, dados: LinhaComId): Promise<void> {
  // Registros antigos ainda valem quando a política já impede uma nova inserção.
  const { data, error } = await requireSupabase().from(tabela).select('id').eq('id', dados.id).maybeSingle()
  falhou(error)
  if (!data) await inserirUmaVez(tabela, dados)
}

export async function carregarPortalSb(usuario: Usuario) {
  const manuais = deveCarregar(usuario, 'manuais')
  const universidade = deveCarregar(usuario, 'universidade')
  const [categorias, documentos, trilhas] = await Promise.all([
    manuais ? listar('categorias', mapCategoriaSb) : [],
    manuais ? listar('documentos', mapDocumentoSb) : [],
    universidade ? listar('trilhas', mapTrilhaSb) : [],
  ])
  return { categorias, documentos, trilhas }
}

export async function salvarCategoriaSb(rascunho: RascunhoCategoria, usuarios: Usuario[] | null, id = novoId()): Promise<string> {
  const anterior = usuarios ? null : await obterLinha('categorias', id)
  const alvo = anterior ? mapCategoriaSb(anterior) : undefined
  await gravar('categorias', categoriaParaLinha(id, rascunho, usuarios, alvo))
  return id
}

export async function excluirCategoriaSb(id: string): Promise<void> {
  await apagar('categorias', 'id', id)
}

export async function salvarDocumentoSb(rascunho: RascunhoDocumento, autor: Usuario, usuarios: Usuario[] | null, id?: string): Promise<string> {
  const linhaAnterior = id ? await obterLinha('documentos', id) : null
  const anterior = linhaAnterior ? mapDocumentoSb(linhaAnterior) : null
  const mudou = anterior && (
    anterior.conteudoHtml !== rascunho.conteudoHtml ||
    anterior.htmlConteudo !== rascunho.htmlConteudo ||
    anterior.htmlUrl !== rascunho.htmlUrl ||
    anterior.titulo !== rascunho.titulo.trim()
  )
  const publicado = rascunho.status === 'publicado'
  const eraPublicado = anterior?.status === 'publicado'
  const versao = (anterior?.versao ?? 1) + (eraPublicado && publicado && mudou ? 1 : 0)
  const dados = documentoParaLinha(id ?? novoId(), rascunho, autor, usuarios, versao, anterior ?? undefined)
  const banco = requireSupabase()
  if (linhaAnterior) {
    const { data, error } = await banco.from('documentos').update(dados)
      .eq('id', dados.id).eq('atualizado_em', linhaAnterior.atualizado_em).select('id')
    falhou(error)
    if (!data?.length) throw new Error('O documento mudou. Recarregue antes de salvar.')
  } else {
    const { error } = await banco.from('documentos').insert(dados)
    falhou(error)
  }

  if (publicado && await inserirUmaVez('documento_versoes', versaoParaLinha(dados, autor))) {
    const { error } = await banco.from('avisos').insert(avisoParaLinha(novoId(), dados, eraPublicado))
    falhou(error)
  }
  return dados.id
}

export async function excluirDocumentoSb(id: string): Promise<void> {
  // A chave estrangeira remove as versões junto com o documento.
  await apagar('documentos', 'id', id)
}

export async function listarVersoesSb(documentoId: string): Promise<VersaoDocumento[]> {
  const versoes = await listar('documento_versoes', mapVersaoSb, ['documento_id', documentoId])
  return versoes.sort((a, b) => b.versao - a.versao)
}

export async function salvarTrilhaSb(rascunho: RascunhoTrilha, usuarios: Usuario[], id = novoId()): Promise<string> {
  const trilha = trilhaParaLinha(id, rascunho, usuarios)
  await gravar('trilhas', trilha)
  const existentes = await listar('quizzes', (linha) => linha.id, ['trilha_id', id])
  const quizzes = rascunho.quizzes.map((quiz) => quizParaLinha(quiz, trilha))
  if (quizzes.length) await gravar('quizzes', quizzes)
  const manter = new Set(quizzes.map((quiz) => quiz.id))
  const remover = existentes.filter((quizId) => !manter.has(quizId))
  if (remover.length) {
    const { error } = await requireSupabase().from('quizzes').delete().eq('trilha_id', id).in('id', remover)
    falhou(error)
  }
  return id
}

export async function excluirTrilhaSb(id: string): Promise<void> {
  await apagar('quizzes', 'trilha_id', id)
  await apagar('trilhas', 'id', id)
}

export async function obterQuizSb(id: string): Promise<Quiz | null> {
  const linha = await obterLinha('quizzes', id)
  if (!linha) return null
  const quiz = mapQuizSb(linha)

  // A mesma precedência do Firestore: gabarito global, oficial, primeiro legado.
  const global = await obterLinha('gabaritos', id)
  const oficial = global ? null : await obterLinha('quiz_gabaritos', `${id}/gabarito/oficial`)
  let gabarito = global ?? oficial
  if (!gabarito) {
    const { data, error } = await requireSupabase().from('quiz_gabaritos').select('*')
      .eq('quiz_id', id).order('gabarito_id').limit(1).maybeSingle()
    falhou(error)
    gabarito = data as LinhaComId | null
  }
  return gabarito ? { ...quiz, perguntas: aplicarGabarito(quiz.perguntas, mapGabaritoSb(gabarito)) } : quiz
}

export async function listarQuizzesDaTrilhaSb(trilhaId: string): Promise<Quiz[]> {
  return listar('quizzes', mapQuizSb, ['trilha_id', trilhaId])
}

export async function listarQuizzesSb(): Promise<Quiz[]> {
  return listar('quizzes', mapQuizSb)
}

export async function reidratarAcessosSb(): Promise<void> {
  const banco = requireSupabase()
  const [{ data, error }, usuarios] = await Promise.all([banco.auth.getUser(), listarUsuariosSb()])
  falhou(error)
  if (!data.user) throw new Error('Sessão inválida.')
  const uid = data.user.id
  const autor = usuarios.find((usuario) => usuario.uid === uid)
  for (const tabela of ['categorias', 'documentos', 'trilhas', 'quizzes']) {
    const linhas = await listar(tabela, (linha) => linha)
    for (const linha of linhas) {
      if (typeof linha.publico !== 'boolean') continue
      const alvo = audiencia(linha, false)
      const uids = calcularUids(alvo, usuarios)
      if (alvo.uids.length === uids.length && alvo.uids.every((id) => uids.includes(id))) continue
      const patch: Linha = { uids }
      // A política de documentos exige que a gravação identifique o admin atual.
      if (tabela === 'documentos') {
        patch.atualizado_por = uid
        patch.atualizado_por_nome = autor?.nome.slice(0, 120) ?? ''
      }
      // O RLS exige um booleano na edição. NULL legado já significa publicado.
      if (tabela === 'trilhas' && linha.publicado == null) patch.publicado = true
      const { error: erro } = await banco.from(tabela).update(patch).eq('id', linha.id)
      falhou(erro)
    }
  }
}

export async function registrarLeituraSb(usuario: Usuario, documento: DocumentoLido): Promise<void> {
  await registrarUmaVez('leituras', leituraParaLinha(usuario, documento))
}

export async function registrarAceiteSb(usuario: Usuario, documento: DocumentoLido): Promise<void> {
  await registrarUmaVez('aceites', aceiteParaLinha(usuario, documento))
  await registrarLeituraSb(usuario, documento)
}

export async function registrarTentativaSb(_dados: Omit<Tentativa, 'id' | 'respondidoEm'>): Promise<string> {
  throw new Error('Sem permissão para registrar tentativas.')
}

export async function emitirCertificadoSb(dados: Omit<Certificado, 'id' | 'emitidoEm'>): Promise<string> {
  const linha = certificadoParaLinha(dados)
  await registrarUmaVez('certificados', linha)
  return linha.id
}

export async function carregarMeuProgressoSb(usuario: Usuario) {
  const manuais = deveCarregar(usuario, 'manuais')
  const universidade = deveCarregar(usuario, 'universidade')
  const filtro = ['uid', usuario.uid] as const
  const [leituras, aceites, tentativas, certificados, avisosLidos] = await Promise.all([
    manuais ? listar('leituras', mapLeituraSb, filtro) : [],
    manuais ? listar('aceites', mapAceiteSb, filtro) : [],
    universidade ? listar('tentativas', mapTentativaSb, filtro) : [],
    universidade ? listar('certificados', mapCertificadoSb, filtro) : [],
    manuais ? listar('avisos_leituras', mapAvisoLeituraSb, filtro) : [],
  ])
  return { leituras, aceites, tentativas, certificados, avisosLidos }
}

export async function carregarRegistrosAdminSb() {
  const [leituras, aceites, tentativas, certificados] = await Promise.all([
    listar('leituras', mapLeituraSb),
    listar('aceites', mapAceiteSb),
    listar('tentativas', mapTentativaSb),
    listar('certificados', mapCertificadoSb),
  ])
  return { leituras, aceites, tentativas, certificados }
}

export async function carregarAvisosSb(usuario: Usuario): Promise<Aviso[]> {
  return deveCarregar(usuario, 'manuais') ? listar('avisos', mapAvisoSb) : []
}

export async function marcarAvisoLidoSb(uid: string, avisoId: string): Promise<void> {
  await registrarUmaVez('avisos_leituras', avisoLeituraParaLinha(uid, avisoId))
}

export async function listarTrilhaManuaisSb(): Promise<ItemTrilhaManual[]> {
  return listar('manuais_trilha', mapItemTrilhaSb)
}

export async function listarMeuProgressoSb(uid: string): Promise<ProgressoManual[]> {
  return listar('progresso_manuais', mapProgressoSb, ['uid', uid])
}

export async function listarProgressoVisivelSb(usuario: Usuario): Promise<ProgressoManual[]> {
  if (usuario.papel === 'admin' || usuario.papel === 'equipe_franqueadora') {
    return listar('progresso_manuais', mapProgressoSb)
  }
  if (!usuario.unidadeId) return []
  return listar('progresso_manuais', mapProgressoSb, ['unidade_id', usuario.unidadeId])
}

export async function salvarTrilhaManuaisSb(autor: Usuario, itens: ItemTrilhaEdicao[]): Promise<void> {
  if (itens.length > 450) throw new Error('A trilha aceita até 450 manuais por vez.')
  if (!itens.length) return
  await gravar('manuais_trilha', encadearTrilha(itens).map((item) => itemTrilhaParaLinha(item, autor)))
}

export async function iniciarOuReiniciarSb(usuario: Usuario, item: ItemTrilhaManual): Promise<ProgressoManual | null> {
  const tabela = 'progresso_manuais'
  const linha = progressoParaLinha(usuario, item)
  const atual = await obterLinha(tabela, linha.id)
  if (atual) {
    const progresso = mapProgressoSb(atual)
    if (progresso.status === 'concluido') return progresso
    const { error } = await requireSupabase().from(tabela)
      .update({ reinicios: progresso.reinicios + 1, tempo_minimo_seg: item.tempoMinimoSeg })
      .eq('id', linha.id).eq('status', 'em_andamento').eq('reinicios', progresso.reinicios)
    falhou(error)
  } else {
    await inserirUmaVez(tabela, linha)
  }
  const depois = await obterLinha(tabela, linha.id)
  return depois ? mapProgressoSb(depois) : null
}

export async function concluirManualSb(usuario: Usuario, documentoId: string): Promise<void> {
  const { data, error } = await requireSupabase().from('progresso_manuais')
    .update({ status: 'concluido' }).eq('id', idProgresso(usuario.uid, documentoId)).select('id')
  falhou(error)
  if (!data?.length) throw new Error('Não foi possível concluir o manual.')
}
