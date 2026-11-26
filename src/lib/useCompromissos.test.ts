// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { Usuario } from '../types'
import { listarCompartilhados } from './acompanhamentoApi'
import { listarAcoes } from './auditoriaApi'
import { useCompromissos } from './useCompromissos'

vi.mock('./acompanhamentoApi', () => ({
  listarCompartilhados: vi.fn(async () => ({ passos: [] })),
}))
vi.mock('./auditoriaApi', () => ({
  listarAcoes: vi.fn(async () => []),
}))

it('habilita os compromissos e consulta as duas fontes para um franqueado sem esses módulos', async () => {
  const pessoa: Usuario = {
    uid: 'franqueado-1',
    email: 'franqueado@example.com',
    nome: 'Maria',
    papel: 'franqueado',
    ativo: true,
    recusado: false,
    unidade: 'Aurora',
    cidade: 'Aurora',
    unidadeId: 'aurora',
    modulosLiberados: [],
  }
  const container = document.createElement('div')
  const raiz = createRoot(container)

  function Consumidor() {
    const { habilitado } = useCompromissos(pessoa)
    return habilitado ? 'habilitado' : 'desabilitado'
  }

  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  try {
    await act(async () => raiz.render(createElement(Consumidor)))
    expect(container.textContent).toBe('habilitado')
    expect(listarAcoes).toHaveBeenCalledWith(false, 'aurora')
    expect(listarCompartilhados).toHaveBeenCalledWith('aurora')
  } finally {
    await act(async () => raiz.unmount())
    vi.unstubAllGlobals()
  }
})
