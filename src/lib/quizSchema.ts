import type { Pergunta, TrilhaItem } from '../types'

function texto(valor: unknown, fallback = ''): string {
  return typeof valor === 'string' ? valor : fallback
}

function opcoesDe(registro: Record<string, unknown>): string[] {
  const bruto = registro.opcoes ?? registro.alternativas ?? registro.options ?? registro.escolhas ?? registro.respostas
  if (Array.isArray(bruto)) return bruto.map((item) => (typeof item === 'string' ? item : texto((item as { texto?: unknown })?.texto))).filter(Boolean)
  if (bruto && typeof bruto === 'object') return Object.values(bruto as Record<string, unknown>).map((item) => String(item))
  return []
}

function indiceCorreto(registro: Record<string, unknown>, opcoes: string[]): number {
  const bruto = registro.correta ?? registro.corretaIndex ?? registro.gabarito ?? registro.respostaCorreta ?? registro.resposta ?? registro.indice
  if (typeof bruto === 'number' && Number.isFinite(bruto)) return bruto
  if (typeof bruto === 'string') {
    const numero = Number(bruto)
    if (bruto.trim() !== '' && !Number.isNaN(numero)) return numero
    const letra = bruto.trim().toUpperCase()
    if (letra.length === 1 && letra >= 'A' && letra <= 'Z') return letra.charCodeAt(0) - 65
    const achado = opcoes.findIndex((opcao) => opcao === bruto)
    if (achado >= 0) return achado
  }
  return 0
}

export function extrairPerguntas(data: Record<string, unknown>): Pergunta[] {
  const lista = ['perguntas', 'questoes', 'questões', 'questions', 'quiz'].map((chave) => data[chave]).find(Array.isArray) as unknown[] | undefined
  if (!lista) return []
  return lista.flatMap((item, indice) => {
    if (!item || typeof item !== 'object') return []
    const registro = item as Record<string, unknown>
    const enunciado = texto(registro.enunciado) || texto(registro.pergunta) || texto(registro.texto) || texto(registro.questao) || texto(registro.title)
    const opcoes = opcoesDe(registro)
    if (!enunciado || opcoes.length < 2) return []
    return [{ id: texto(registro.id, `p${indice + 1}`), enunciado, opcoes, correta: indiceCorreto(registro, opcoes) }]
  })
}

export function aplicarGabarito(perguntas: Pergunta[], gabarito: unknown): Pergunta[] {
  if (!gabarito) return perguntas
  if (Array.isArray(gabarito) && gabarito.every((item) => typeof item === 'number')) {
    return perguntas.map((pergunta, indice) => ({ ...pergunta, correta: typeof gabarito[indice] === 'number' ? gabarito[indice] : pergunta.correta }))
  }
  if (Array.isArray(gabarito)) {
    return perguntas.map((pergunta, indice) => {
      const item = gabarito[indice]
      if (!item || typeof item !== 'object') return pergunta
      const registro = item as Record<string, unknown>
      return { ...pergunta, correta: indiceCorreto(registro, pergunta.opcoes) }
    })
  }
  if (typeof gabarito === 'object') {
    const mapa = gabarito as Record<string, unknown>
    if (Array.isArray(mapa.corretas) || Array.isArray(mapa.respostas) || Array.isArray(mapa.gabarito)) {
      return aplicarGabarito(perguntas, mapa.corretas ?? mapa.respostas ?? mapa.gabarito)
    }
    const aninhadas = extrairPerguntas(mapa)
    if (aninhadas.length === perguntas.length) {
      return perguntas.map((pergunta, indice) => ({ ...pergunta, correta: aninhadas[indice]?.correta ?? pergunta.correta }))
    }
  }
  return perguntas
}

function tipoItem(registro: Record<string, unknown>, refId: string): 'documento' | 'quiz' | null {
  const bruto = texto(registro.tipo).toLowerCase()
  if (['quiz', 'questionario', 'questionário'].includes(bruto) || registro.quizId) return 'quiz'
  if (['documento', 'doc', 'manual', 'pop'].includes(bruto) || registro.documentoId || registro.docId) return 'documento'
  if (refId.startsWith('quiz')) return 'quiz'
  if (refId) return 'documento'
  return null
}

export function extrairItensTrilha(data: Record<string, unknown>): TrilhaItem[] {
  const fontes = [data.itens, data.etapas, data.passos].find(Array.isArray) as unknown[] | undefined
  const itens = (fontes ?? []).flatMap((item) => {
    if (typeof item === 'string' && item) {
      return [{ id: item, tipo: item.startsWith('quiz') ? 'quiz' as const : 'documento' as const, refId: item, titulo: item }]
    }
    if (!item || typeof item !== 'object') return []
    const registro = item as Record<string, unknown>
    const refId = texto(registro.refId) || texto(registro.quizId) || texto(registro.documentoId) || texto(registro.docId) || texto(registro.idDocumento)
    const tipo = tipoItem(registro, refId)
    if (!tipo || !refId) return []
    return [{ id: texto(registro.id, refId), tipo, refId, titulo: texto(registro.titulo) || texto(registro.nome, tipo === 'quiz' ? 'Quiz' : refId) }]
  })
  if (itens.length) return itens
  const documentos = Array.isArray(data.documentos) ? data.documentos : []
  const quizzes = Array.isArray(data.quizzes) ? data.quizzes : []
  return [
    ...documentos.flatMap((item) => (typeof item === 'string' ? [{ id: item, tipo: 'documento' as const, refId: item, titulo: item }] : [])),
    ...quizzes.flatMap((item) => {
      if (typeof item === 'string') return [{ id: item, tipo: 'quiz' as const, refId: item, titulo: 'Quiz' }]
      if (!item || typeof item !== 'object') return []
      const registro = item as Record<string, unknown>
      const refId = texto(registro.id) || texto(registro.quizId)
      if (!refId) return []
      return [{ id: refId, tipo: 'quiz' as const, refId, titulo: texto(registro.titulo, 'Quiz') }]
    }),
  ]
}

export function publicadoNoDado(data: Record<string, unknown>): boolean {
  if (data.publicado === false || data.status === 'rascunho' || data.ativo === false) return false
  return data.publicado === true || data.ativa === true || data.ativo === true || data.publicado == null
}
