import { aiHabilitado, modeloAi } from '../firebaseConfig'
import type { Documento } from '../types'
import { firebaseApp } from './firebase'
import { limitar, pontuarBusca, trecho } from './text'

export interface FonteResposta {
  id: string
  titulo: string
  categoriaId: string
  trecho: string
}

export function fontesDaPergunta(pergunta: string, documentos: Documento[], limite = 4): FonteResposta[] {
  return documentos
    .map((documento) => ({
      documento,
      pontos: pontuarBusca(pergunta, documento.titulo, documento.conteudoTexto),
    }))
    .filter((item) => item.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, limite)
    .map(({ documento }) => ({
      id: documento.id,
      titulo: documento.titulo,
      categoriaId: documento.categoriaId,
      trecho: trecho(documento.conteudoTexto, pergunta, 900),
    }))
}

export async function gerarRascunho(pedido: string): Promise<string> {
  if (!aiHabilitado()) throw new Error('A IA está desligada. Defina VITE_AI_ENABLED ou deixe o padrão ligado.')
  if (!firebaseApp) throw new Error('Configuração do Firebase pendente')
  const { getAI, getGenerativeModel, GoogleAIBackend } = await import('firebase/ai')
  const model = getGenerativeModel(getAI(firebaseApp, { backend: new GoogleAIBackend() }), {
    model: modeloAi(),
    generationConfig: { maxOutputTokens: 1400 },
  })
  const resultado = await model.generateContent(
    [
      'Escreva um procedimento operacional da Ubox Self Storage em HTML simples.',
      'Use apenas h1, p, h2, ol/li e ul/li. A lista ol é o passo a passo numerado.',
      'Não use markdown nem cerca de código. Português do Brasil. Seja específico para self storage.',
      `Pedido: ${pedido}`,
    ].join('\n'),
  )
  return resultado.response
    .text()
    .replace(/```html/gi, '')
    .replace(/```/g, '')
    .trim()
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
  const { getAI, getGenerativeModel, GoogleAIBackend } = await import('firebase/ai')
  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() })
  const model = getGenerativeModel(ai, {
    model: modeloAi(),
    generationConfig: { maxOutputTokens: 900 },
  })
  const contexto = fontes
    .map((fonte, indice) => `FONTE ${indice + 1}: ${fonte.titulo}\n${limitar(fonte.trecho, 900)}`)
    .join('\n\n')
  const prompt = [
    'Você é o assistente "Pergunte ao Portal" da Ubox Self Storage, franqueadora de self storage em Uberaba/MG.',
    'Responda em português do Brasil, com clareza operacional, usando somente o CONTEXTO.',
    'Se o contexto não trouxer a resposta, diga que o portal não documenta isso e não invente procedimento.',
    'Cite os títulos das fontes usadas.',
    '',
    'CONTEXTO:',
    contexto,
    '',
    `PERGUNTA: ${pergunta}`,
  ].join('\n')
  const resultado = await model.generateContent(prompt)
  return { texto: resultado.response.text(), fontes }
}
