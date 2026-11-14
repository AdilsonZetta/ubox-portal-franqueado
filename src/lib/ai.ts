import { aiHabilitado, modeloAi } from '../firebaseConfig'
import type { Documento } from '../types'
import { firebaseApp } from './firebase'
import { htmlParaTexto, limitar, pontuarBusca, trecho } from './text'

export interface FonteResposta {
  id: string
  titulo: string
  categoriaId: string
  trecho: string
}

function corpoPesquisavel(documento: Documento): string {
  const texto = documento.conteudoTexto
  const sujo = !texto || texto.includes('data:image') || texto.includes('base64') || texto.length > 20000
  if (!sujo) return texto
  return htmlParaTexto(documento.conteudoHtml || documento.htmlConteudo || texto)
}

export function fontesDaPergunta(pergunta: string, documentos: Documento[], limite = 4): FonteResposta[] {
  return documentos
    .map((documento) => {
      const corpo = corpoPesquisavel(documento)
      return { documento, corpo, pontos: pontuarBusca(pergunta, documento.titulo, corpo) }
    })
    .filter((item) => item.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, limite)
    .map(({ documento, corpo }) => ({
      id: documento.id,
      titulo: documento.titulo,
      categoriaId: documento.categoriaId,
      trecho: trecho(corpo, pergunta, 700),
    }))
}

function modelosParaTentar(): string[] {
  const preferido = modeloAi()
  return [...new Set([preferido, 'gemini-3.5-flash-lite', 'gemini-2.5-flash'].filter(Boolean))]
}

async function gerarTexto(prompt: string, maxOutputTokens: number): Promise<string> {
  if (!firebaseApp) throw new Error('Configuração do Firebase pendente')
  const { getAI, getGenerativeModel, GoogleAIBackend } = await import('firebase/ai')
  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() })
  let ultimo: unknown
  for (const modelName of modelosParaTentar()) {
    try {
      const model = getGenerativeModel(ai, { model: modelName, generationConfig: { maxOutputTokens } })
      const resultado = await model.generateContent(prompt)
      const texto = resultado.response.text().trim()
      if (texto) return texto
    } catch (erro) {
      ultimo = erro
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error('A IA não respondeu.')
}

function mensagemIa(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : ''
  if (/app check|permission|unauthenticated/i.test(texto)) {
    return 'A IA do Firebase recusou a consulta. Confira se o AI Logic e o App Check estão liberados para este app. Enquanto isso, use os trechos encontrados na base.'
  }
  return 'Não consegui consultar a IA agora. Os trechos abaixo foram encontrados pela busca do portal.'
}

export async function gerarRascunho(pedido: string): Promise<string> {
  if (!aiHabilitado()) throw new Error('A IA está desligada. Defina VITE_AI_ENABLED ou deixe o padrão ligado.')
  const texto = await gerarTexto(
    [
      'Escreva um procedimento operacional da Ubox Self Storage em HTML simples.',
      'Use apenas h1, p, h2, ol/li e ul/li. A lista ol é o passo a passo numerado.',
      'Não use markdown nem cerca de código. Português do Brasil. Seja específico para self storage.',
      `Pedido: ${pedido}`,
    ].join('\n'),
    1400,
  )
  return texto.replace(/```html/gi, '').replace(/```/g, '').trim()
}

export async function perguntarAoPortal(pergunta: string, documentos: Documento[]): Promise<{ texto: string; fontes: FonteResposta[] }> {
  const fontes = fontesDaPergunta(pergunta, documentos)
  if (!aiHabilitado()) {
    return {
      texto: 'A consulta com IA está desligada neste ambiente. Os trechos abaixo vieram da busca do portal.',
      fontes,
    }
  }
  if (!firebaseApp) throw new Error('Configuração do Firebase pendente')
  if (!fontes.length) {
    return {
      texto: 'Não encontrei esse assunto nos documentos publicados que você pode ler.',
      fontes,
    }
  }
  const contexto = limitar(
    fontes.map((fonte, indice) => `FONTE ${indice + 1}: ${fonte.titulo}\n${fonte.trecho}`).join('\n\n'),
    6000,
  )
  const prompt = [
    'Você é o assistente "Pergunte ao Portal" da Ubox Self Storage.',
    'Responda em português do Brasil, só com o CONTEXTO. Se não houver a resposta, diga isso.',
    'Cite o título da fonte.',
    '',
    'CONTEXTO:',
    contexto,
    '',
    `PERGUNTA: ${pergunta}`,
  ].join('\n')
  try {
    return { texto: await gerarTexto(prompt, 800), fontes }
  } catch (erro) {
    return { texto: mensagemIa(erro), fontes }
  }
}
