export type Papel = 'admin' | 'equipe_franqueadora' | 'franqueado' | 'equipe_franqueado'
export type TipoDocumento = 'pop' | 'manual' | 'processo' | 'politica' | 'checklist' | 'html'
export type FormatoDocumento = 'richtext' | 'html'
export type StatusDocumento = 'rascunho' | 'publicado'
export type TipoAnexo = 'link' | 'drive' | 'video'
export type TipoAviso = 'novo' | 'atualizado' | 'geral'

export interface Usuario {
  uid: string
  email: string
  nome: string
  papel: Papel
  ativo: boolean
  recusado: boolean
  unidade: string
  cidade: string
  unidadeId?: string | null
  modulosLiberados?: string[]
  criadoPor?: string
  criadoEm?: unknown
  atualizadoEm?: unknown
}

export interface Unidade {
  id: string
  nome: string
  cidade: string
  responsavel: string
  email: string
  uid: string | null
  modulosLiberados: string[]
  ativo: boolean
  criadoPor?: string
  criadoEm?: unknown
  atualizadoEm?: unknown
}

export interface Audiencia {
  publico: boolean
  unidades: string[]
  papeis: Papel[]
  uidsExtra: string[]
  uids: string[]
}

export interface Categoria extends Audiencia {
  id: string
  nome: string
  descricao: string
  ordem: number
  parentId: string | null
  criadoEm?: unknown
  atualizadoEm?: unknown
}

export interface Anexo {
  nome: string
  url: string
  tipo: TipoAnexo
}

export interface Documento extends Audiencia {
  id: string
  titulo: string
  categoriaId: string
  tipo: TipoDocumento
  formato: FormatoDocumento
  status: StatusDocumento
  versao: number
  leituraObrigatoria: boolean
  conteudoHtml: string
  conteudoTexto: string
  htmlConteudo: string
  htmlUrl: string
  anexos: Anexo[]
  criadoEm?: unknown
  atualizadoEm?: unknown
  atualizadoPor: string
  atualizadoPorNome: string
  publicadoEm?: unknown
}

export interface VersaoDocumento {
  id: string
  versao: number
  titulo: string
  formato: FormatoDocumento
  conteudoHtml: string
  conteudoTexto: string
  htmlConteudo: string
  htmlUrl: string
  criadoEm?: unknown
  autorId: string
  autorNome: string
}

export interface TrilhaItem {
  id: string
  tipo: 'documento' | 'quiz'
  refId: string
  titulo: string
}

export interface Trilha extends Audiencia {
  id: string
  titulo: string
  descricao: string
  notaMinima: number
  publicado: boolean
  itens: TrilhaItem[]
  criadoEm?: unknown
  atualizadoEm?: unknown
}

export interface Pergunta {
  id: string
  enunciado: string
  opcoes: string[]
  correta: number
}

export interface Quiz extends Audiencia {
  id: string
  trilhaId: string
  titulo: string
  notaMinima: number
  perguntas: Pergunta[]
  publicado: boolean
  criadoEm?: unknown
  atualizadoEm?: unknown
}

export interface Leitura {
  id: string
  uid: string
  documentoId: string
  versao: number
  titulo: string
  lidoEm?: unknown
}

export interface Aceite {
  id: string
  uid: string
  documentoId: string
  versao: number
  nome: string
  email: string
  texto: string
  titulo: string
  aceitoEm?: unknown
}

export interface Tentativa {
  id: string
  uid: string
  quizId: string
  trilhaId: string
  nota: number
  aprovado: boolean
  respostas: number[]
  respondidoEm?: unknown
}

export interface Certificado {
  id: string
  uid: string
  trilhaId: string
  nome: string
  trilhaTitulo: string
  emitidoEm?: unknown
  codigo: string
  tentativaId: string
}

export interface Aviso {
  id: string
  titulo: string
  mensagem: string
  documentoId: string
  tipo: TipoAviso
  publico: boolean
  unidades: string[]
  papeis: Papel[]
  uidsExtra: string[]
  uids: string[]
  criadoEm?: unknown
}

export interface AvisoLeitura {
  id: string
  uid: string
  avisoId: string
  lidaEm?: unknown
}
