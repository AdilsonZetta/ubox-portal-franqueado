import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Documento } from '../types'

const obterAppParaAi = vi.fn()

vi.mock('./firebase', () => ({
  obterAppParaAi: (...args: unknown[]) => obterAppParaAi(...args),
}))

vi.mock('../firebaseConfig', async () => {
  const real = await vi.importActual<typeof import('../firebaseConfig')>('../firebaseConfig')
  return {
    ...real,
    aiHabilitado: () => true,
  }
})

import { gerarRascunho, mensagemIa, MENSAGEM_IA_INDISPONIVEL, perguntarAoPortal } from './ai'

const doc = {
  id: 'd1',
  titulo: 'Abertura da unidade',
  categoriaId: 'ops',
  conteudoTexto: 'A unidade abre às 8h e fecha às 18h nos dias úteis.',
  conteudoHtml: '',
  htmlConteudo: '',
} as unknown as Documento

describe('IA no backend supabase (sem app Firebase no carregamento)', () => {
  beforeEach(() => {
    obterAppParaAi.mockReset()
    obterAppParaAi.mockReturnValue(null)
  })

  it('perguntarAoPortal não lança e devolve os trechos locais se o app de IA não existir', async () => {
    const resposta = await perguntarAoPortal('horário de abertura', [doc])
    expect(obterAppParaAi).toHaveBeenCalled()
    expect(resposta.fontes.length).toBeGreaterThan(0)
    expect(resposta.fontes[0]?.titulo).toBe('Abertura da unidade')
    expect(resposta.texto).toMatch(/trechos abaixo foram encontrados/i)
    expect(resposta.texto).not.toMatch(/configuração do firebase pendente/i)
  })

  it('gerarRascunho mostra mensagem clara em vez de “Configuração do Firebase pendente”', async () => {
    await expect(gerarRascunho('abertura de domingo')).rejects.toThrow(MENSAGEM_IA_INDISPONIVEL)
  })

  it('mensagemIa descreve a ausência do app sem o erro genérico de configuração pendente', () => {
    expect(mensagemIa(new Error(MENSAGEM_IA_INDISPONIVEL))).toMatch(/não está disponível/i)
    expect(mensagemIa(new Error('Configuração do Firebase pendente'))).toMatch(/trechos abaixo foram encontrados/i)
  })
})
