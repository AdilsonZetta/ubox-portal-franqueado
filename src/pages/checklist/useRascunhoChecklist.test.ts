// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { ModeloChecklist } from '../../lib/checklist'
import type { Usuario } from '../../types'
import { lerRascunho, salvarRascunho } from '../../lib/checklistApi'
import { useRascunhoChecklist } from './useRascunhoChecklist'

vi.mock('../../lib/checklistApi', () => ({
  lerRascunho: vi.fn(),
  salvarRascunho: vi.fn(async () => Date.now()),
  removerRascunho: vi.fn(async () => undefined),
  rascunhoIndisponivel: (erro: unknown) =>
    !!erro && typeof erro === 'object' && 'code' in erro && ['42P01', 'PGRST205'].includes(String(erro.code)),
  RASCUNHO_NO_APARELHO: false,
}))

const autor = {
  uid: 'eq1', email: 'eq1@ubox.test', nome: 'Equipe', papel: 'equipe_franqueado',
  ativo: true, recusado: false, unidade: 'Unidade Ck', cidade: 'São Paulo', unidadeId: 'un-ck',
} satisfies Usuario

const modelo = {
  id: 'ck-rede', versao: 2,
  itens: [{ id: 'i1', texto: 'Luzes', secao: 'Loja', peso: 1, exigeEvidencia: true, exigeObs: true }],
} as ModeloChecklist

function tela(leitura: Promise<unknown>) {
  vi.mocked(lerRascunho).mockReturnValue(leitura as ReturnType<typeof lerRascunho>)
  const container = document.createElement('div')
  const raiz = createRoot(container)
  const api: { atualizar?: ReturnType<typeof useRascunhoChecklist>['atualizar'] } = {}
  function Consumidor() {
    const rascunho = useRascunhoChecklist(autor, modelo, '2026-11-26')
    api.atualizar = rascunho.atualizar
    return rascunho.carregando ? 'carregando' : rascunho.status
  }
  return { container, raiz, api, Consumidor }
}

async function abrir(leitura: Promise<unknown>) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const atual = tela(leitura)
  await act(async () => atual.raiz.render(createElement(atual.Consumidor)))
  return atual
}

it('não grava por cima do rascunho quando a leitura falha', async () => {
  let falhar: (erro: unknown) => void = () => {}
  const leitura = new Promise((_, reject) => {
    falhar = reject
  })
  const atual = await abrir(leitura)
  await act(async () => {
    falhar(Object.assign(new Error('rede'), { code: '500' }))
  })
  try {
    expect(atual.container.textContent).toBe('Não foi possível recuperar as respostas salvas.')
    await act(async () => {
      atual.api.atualizar?.((dados) => ({ ...dados, obsGeral: 'oi' }))
    })
    await act(async () => atual.raiz.unmount())
    expect(salvarRascunho).not.toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
  }
})

it('grava ao sair quando não havia rascunho', async () => {
  vi.mocked(salvarRascunho).mockClear()
  const atual = await abrir(Promise.resolve(null))
  try {
    expect(atual.container.textContent).toBe('')
    await act(async () => {
      atual.api.atualizar?.((dados) => ({ ...dados, obsGeral: 'oi' }))
    })
    await act(async () => atual.raiz.unmount())
    expect(salvarRascunho).toHaveBeenCalledOnce()
  } finally {
    vi.unstubAllGlobals()
  }
})
