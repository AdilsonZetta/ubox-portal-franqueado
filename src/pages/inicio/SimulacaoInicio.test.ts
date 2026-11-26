// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import type { DadosAcompanhamento } from '../../lib/acompanhamentoApi'
import type { Unidade, Usuario } from '../../types'
import { VisaoProvider, useVisao } from '../../lib/visao'
import { ModulosPage } from '../Modulos'

const { carregarAcompanhamento, listarModelos, listarMeuProgresso, cartaoUniversidade } = vi.hoisted(() => ({
  carregarAcompanhamento: vi.fn(),
  listarModelos: vi.fn().mockResolvedValue([]),
  listarMeuProgresso: vi.fn().mockResolvedValue([]),
  cartaoUniversidade: vi.fn(() => null),
}))

const perfil: Usuario = { uid: 'admin', nome: 'Admin', email: '', papel: 'admin', ativo: true, recusado: false, unidade: '', cidade: '' }
const franqueado: Usuario = {
  ...perfil, uid: 'ana', nome: 'Ana', papel: 'franqueado', unidadeId: 'u1', unidade: 'Uberaba',
  modulosLiberados: ['nuvem', 'checklist', 'chamados', 'manuais', 'universidade'],
}

let usuario = perfil
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: usuario }) }))
vi.mock('../../lib/api', () => ({
  listarUsuarios: async () => [
    { ...franqueado, uid: 'bia', nome: 'Bia', modulosLiberados: [] },
    { ...franqueado, uid: 'inativo', unidadeId: 'u3', unidade: 'Unidade inativa', ativo: false },
    franqueado,
    { ...franqueado, uid: 'carlos', unidadeId: 'u2', unidade: 'Araxá', modulosLiberados: [] },
  ],
}))
const unidade: Unidade = {
  id: 'u1', nome: 'Uberaba', cidade: '', responsavel: '', email: '', uid: 'ana',
  modulosLiberados: franqueado.modulosLiberados ?? [], ativo: true,
}
const fontes: DadosAcompanhamento['fontes'] = {
  modelosChecklist: null, execucoes: [],
  auditorias: null, acoes: null, tentativas: null, cursosPublicados: null, progresso: null,
  trilhaManuais: null, pedidos: null, registros: null, passos: null,
  chamados: [
    { id: 'c1', titulo: 'Solicitação recente', abertoPor: 'ana', unidadeId: 'u1', status: 'aberto', criadoEmMs: Date.now() - 60000, slaHoras: 24 },
    { id: 'c2', titulo: 'Solicitação de outra unidade', abertoPor: 'bia', unidadeId: 'u2', status: 'aberto', criadoEmMs: Date.now() - 120000, slaHoras: 24 },
  ],
}
carregarAcompanhamento.mockResolvedValue({ fontes, registros: [], passos: [] })
vi.mock('../../lib/acompanhamentoApi', () => ({ carregarAcompanhamento }))
vi.mock('../../lib/gestao', () => ({ listarUnidades: vi.fn(async () => [unidade]) }))
vi.mock('../../lib/adesaoApi', () => ({ listarDesignados: vi.fn(async () => null), listarUnidadesComEstoque: vi.fn(async () => null) }))
vi.mock('../../lib/estoqueApi', () => ({ carregarEstoque: vi.fn(async () => null) }))
vi.mock('../../lib/universidadeApi', () => ({ listarCursos: vi.fn(async () => []) }))
vi.mock('../../lib/checklistApi', () => ({
  listarModelos, listarVigencias: vi.fn().mockResolvedValue([]), listarExecucoes: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../lib/manuaisApi', () => ({ listarMeuProgresso, listarTrilhaManuais: vi.fn().mockResolvedValue([]) }))
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
    const rede = container.querySelector('[aria-label="Indicadores da rede"]')
    expect(rede?.textContent).toContain('Cadastros aguardando aprovação')
    expect(rede?.querySelector('a[href="/admin/usuarios"]')?.textContent).toContain('1')
    expect(container.querySelector('table a[href="/acompanhamento/unidade/u1"]')?.textContent).toBe('Uberaba')
    expect(container.querySelector('a[href="/chamados?id=c1"]')?.textContent).toContain('Solicitação recente')
    expect(carregarAcompanhamento).toHaveBeenCalledWith(undefined, expect.objectContaining({ incluirChamadosEncerrados: true }))
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
    const indicadores = container.querySelector('[aria-label="Indicadores da unidade"]')
    expect(indicadores?.querySelector('a[href="/checklist"]')?.textContent).toContain('Checklist de hoje—Indisponível')
    expect(indicadores?.querySelector('a[href="/chamados"]')?.textContent).toContain('Chamados abertos1')
    expect(carregarAcompanhamento).toHaveBeenLastCalledWith('u1', expect.objectContaining({
      fontes: ['modelosChecklist', 'execucoes', 'chamados', 'progresso', 'tentativas'],
    }))
    expect(container.textContent).not.toContain('Solicitação de outra unidade')
    expect(container.querySelector('[aria-label="Indicadores da rede"]')).toBeNull()
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

it.each([
  ['franqueado', 'Painel da unidade'],
  ['equipe_franqueado', 'Meu dia'],
  ['equipe_franqueadora', 'Visão da rede'],
] as const)('mostra a visão de %s', async (papel, titulo) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  usuario = { ...franqueado, papel, ...(papel === 'equipe_franqueadora' ? { unidadeId: undefined } : {}) }
  const container = document.createElement('div')
  const raiz = createRoot(container)
  try {
    await act(async () => raiz.render(createElement(MemoryRouter, null, createElement(VisaoProvider, { children: createElement(ModulosPage) }))))
    expect(container.querySelector('#painel-inicial-titulo')?.textContent).toBe(titulo)
    expect(container.textContent).not.toContain('Cadastros aguardando aprovação')
    if (papel === 'equipe_franqueado') {
      expect(container.textContent).toContain('Meus chamados abertos')
      expect(container.textContent).not.toContain('Pessoas com progresso')
      expect(carregarAcompanhamento).toHaveBeenLastCalledWith('u1', { fontes: ['chamados'], solicitanteUid: 'ana' })
    }
    if (papel === 'equipe_franqueadora') {
      expect(container.querySelector('a[href="/admin/usuarios"]')).toBeNull()
      expect(container.querySelector('a[href="/franqueadora"]')).toBeNull()
      expect(container.querySelector('a[href="/checklist/gestao"]')).toBeTruthy()
      expect(container.textContent).not.toContain('Conformidade por unidade')
    }
  } finally {
    await act(async () => raiz.unmount())
    usuario = perfil
    vi.unstubAllGlobals()
  }
})
