// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import type { Usuario } from '../../types'
import { VisaoProvider, useVisao } from '../../lib/visao'
import { ModulosPage } from '../Modulos'

const { listarModelos, listarMeuProgresso, cartaoUniversidade } = vi.hoisted(() => ({
  listarModelos: vi.fn(),
  listarMeuProgresso: vi.fn(),
  cartaoUniversidade: vi.fn(() => null),
}))

const perfil: Usuario = { uid: 'admin', nome: 'Admin', email: '', papel: 'admin', ativo: true, recusado: false, unidade: '', cidade: '' }
const franqueado: Usuario = {
  ...perfil, uid: 'ana', nome: 'Ana', papel: 'franqueado', unidadeId: 'u1', unidade: 'Uberaba',
  modulosLiberados: ['nuvem', 'checklist', 'chamados', 'manuais', 'universidade'],
}

vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: perfil }) }))
vi.mock('../../lib/api', () => ({
  listarUsuarios: async () => [
    { ...franqueado, uid: 'bia', nome: 'Bia', modulosLiberados: [] },
    { ...franqueado, uid: 'inativo', unidadeId: 'u3', unidade: 'Unidade inativa', ativo: false },
    franqueado,
    { ...franqueado, uid: 'carlos', unidadeId: 'u2', unidade: 'Araxá', modulosLiberados: [] },
  ],
}))
vi.mock('../../lib/checklistApi', () => ({ listarModelos, listarVigencias: vi.fn(), listarExecucoes: vi.fn() }))
vi.mock('../../lib/manuaisApi', () => ({ listarMeuProgresso, listarTrilhaManuais: vi.fn() }))
vi.mock('../universidade/Universidade', () => ({ CartaoUniversidade: cartaoUniversidade }))
vi.mock('./AtencaoRede', () => ({ AtencaoRede: () => null }))
vi.mock('./PendenciasInicio', () => ({ PendenciasInicio: () => null }))
vi.mock('../CompromissosUnidade', () => ({ CompromissosUnidade: () => null }))

it('pede uma unidade, mostra somente suas ações e volta à visão da franqueadora', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  const raiz = createRoot(container)
  function Inicio() {
    const { alternar, comoFranqueado } = useVisao()
    return createElement(Fragment, null,
      createElement('button', { onClick: alternar }, comoFranqueado ? 'Sair da simulação' : 'Simular'),
      createElement(ModulosPage),
    )
  }

  try {
    await act(async () => raiz.render(createElement(MemoryRouter, null, createElement(VisaoProvider, { children: createElement(Inicio) }))))
    expect(container.querySelector('a[href="/nuvem/rede"]')?.textContent).toContain('Arquivos da rede')
    expect(container.querySelector('a[href="/nuvem"]')).toBeNull()
    cartaoUniversidade.mockClear()
    await act(async () => container.querySelector('button')?.click())
    expect(container.textContent).toContain('Escolha a unidade para ver o portal como ela vê')
    expect(container.textContent).not.toContain('Nenhum módulo disponível')

    const seletor = container.querySelector('select')!
    expect(Array.from(seletor.options).map((opcao) => opcao.textContent)).toEqual(['Selecione uma unidade', 'Araxá', 'Uberaba'])
    await act(async () => {
      seletor.value = 'ana'
      seletor.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(container.querySelector('h1')?.textContent).toBe('Uberaba')
    expect(localStorage.getItem('ubox-simulado-uid')).toBe('ana')
    expect(container.querySelector('a[href="/nuvem"]')?.textContent).toContain('Arquivos da unidade')
    expect(container.querySelector('a[href="/chamados?novo=1"]')).toBeTruthy()
    expect(container.querySelector('a[href="/manuais/trilha"]')).toBeTruthy()
    expect(container.querySelector('a[href="/nuvem/rede"]')).toBeNull()
    expect(listarModelos).not.toHaveBeenCalled()
    expect(listarMeuProgresso).not.toHaveBeenCalled()
    expect(cartaoUniversidade).not.toHaveBeenCalled()

    await act(async () => container.querySelector('button')?.click())
    await act(async () => container.querySelector('button')?.click())
    const novaEscolha = container.querySelector('select')!
    expect(novaEscolha.value).toBe('')
    await act(async () => {
      novaEscolha.value = 'carlos'
      novaEscolha.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(container.querySelector('h1')?.textContent).toBe('Araxá')
    expect(container.textContent).toContain('Nenhum módulo disponível')
    await act(async () => container.querySelector('button')?.click())
    expect(container.querySelector('h1')?.textContent).toBe('Olá, Admin.')
  } finally {
    await act(async () => raiz.unmount())
    localStorage.clear()
    vi.unstubAllGlobals()
  }
})
